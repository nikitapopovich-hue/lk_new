from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps.db import get_db_session
from app.api.v1.routes.kc_data import _photo_public_url
from app.auth.identity import Identity, get_identity
from app.domain.kc_structure import (
    assign_employees_to_nodes,
    build_tree_payloads,
    collect_suppression_keys_for_delete,
    dump_manual_ids,
    flatten_tree,
    parse_manual_ids,
    reconcile_root_flags,
    sync_nodes_from_employees,
    would_create_cycle,
)
from app.infra.models import KcEmployee, KcStructureLink, KcStructureNode, KcStructureSuppressedKey

router = APIRouter()


def _can_edit_structure(identity: Identity) -> bool:
    return identity.preferred_role in ("supervisor", "superadmin")


def _require_structure_editor(identity: Identity) -> None:
    if not _can_edit_structure(identity):
        raise HTTPException(status_code=403, detail="Редактирование структуры доступно только руководителю или суперадмину")


def _emp_brief_dict(b, photo_url: str = "") -> dict:
    return {
        "id": b.id,
        "fullName": b.full_name,
        "position": b.position,
        "photoUrl": photo_url or b.photo_url,
        "department": b.department,
        "subdivision": b.subdivision,
    }


def _flat_node_dict(p, photo_fn) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "parentId": p.parent_id,
        "matchDepartment": p.match_department,
        "matchSubdivision": p.match_subdivision,
        "managerEmployeeId": p.manager_employee_id,
        "sortOrder": p.sort_order,
        "x": p.pos_x,
        "y": p.pos_y,
        "manualMemberIds": p.manual_member_ids,
        "isRoot": p.is_root,
        "isBranchLeader": p.is_branch_leader,
        "branchLeaderTitle": p.branch_leader_title,
        "isLocation": p.is_location,
        "locationCity": p.location_city,
        "orgUnitCount": p.org_unit_count,
        "orgEmployeeCount": p.org_employee_count,
        "manager": _emp_brief_dict(p.manager) if p.manager else None,
        "employees": [_emp_brief_dict(e) for e in p.employees],
    }


class StructureNodeCreate(BaseModel):
    title: str = ""
    parentId: int | None = None
    matchDepartment: str = ""
    matchSubdivision: str = ""
    x: float = 0
    y: float = 0
    isLocation: bool = Field(False, validation_alias=AliasChoices("isLocation", "is_location"))
    locationCity: str = Field("", validation_alias=AliasChoices("locationCity", "location_city"))


class StructureNodeUpdate(BaseModel):
    title: str | None = None
    parentId: int | None = Field(default=None)
    managerEmployeeId: int | None = Field(default=None)
    matchDepartment: str | None = None
    matchSubdivision: str | None = None
    x: float | None = None
    y: float | None = None
    unsetParent: bool = False
    unsetManager: bool = False
    isBranchLeader: bool | None = None
    branchLeaderTitle: str | None = None
    locationCity: str | None = None


class StructureMembersBody(BaseModel):
    addEmployeeIds: list[int] = Field(default_factory=list)
    removeEmployeeIds: list[int] = Field(default_factory=list)


class StructureLinkCreate(BaseModel):
    fromNodeId: int
    toNodeId: int


async def _load_suppressed_keys(session: AsyncSession) -> set[tuple[str, str]]:
    rows = (await session.execute(select(KcStructureSuppressedKey))).scalars().all()
    return {(r.match_department.strip(), r.match_subdivision.strip()) for r in rows}


async def _add_suppressed_keys(session: AsyncSession, keys: set[tuple[str, str]]) -> None:
    if not keys:
        return
    existing = await _load_suppressed_keys(session)
    for dept, sub in keys:
        dept = dept.strip()
        sub = sub.strip()
        if not dept and not sub:
            continue
        key = (dept, sub)
        if key in existing:
            continue
        session.add(KcStructureSuppressedKey(match_department=dept, match_subdivision=sub))
        existing.add(key)


async def _persist_synced_nodes(session: AsyncSession, merged: list[KcStructureNode]) -> int:
    new_only = [n for n in merged if n.id is None]
    if not new_only:
        return 0
    dept_new = [n for n in new_only if not n.match_subdivision.strip()]
    sub_new = [n for n in new_only if n.match_subdivision.strip()]
    for n in dept_new:
        session.add(n)
    await session.flush()
    by_dept: dict[str, KcStructureNode] = {}
    for n in merged:
        if n.id and not n.match_subdivision.strip() and n.match_department:
            by_dept[n.match_department.strip()] = n
    for n in dept_new:
        if n.id and n.match_department:
            by_dept[n.match_department.strip()] = n
    for n in sub_new:
        parent = by_dept.get(n.match_department.strip())
        if parent and parent.id:
            n.parent_id = parent.id
        session.add(n)
    await session.commit()
    return len(new_only)


async def _load_structure_context(
    session: AsyncSession,
) -> tuple[list[KcStructureNode], list[KcStructureLink], list[KcEmployee]]:
    nodes = list(
        (await session.execute(select(KcStructureNode).order_by(KcStructureNode.sort_order.asc()))).scalars().all()
    )
    employees = list(
        (await session.execute(select(KcEmployee).order_by(KcEmployee.full_name.asc()))).scalars().all()
    )
    links = list(
        (await session.execute(select(KcStructureLink).order_by(KcStructureLink.id.asc()))).scalars().all()
    )
    return nodes, links, employees


def _build_edges(nodes: list[KcStructureNode], links: list[KcStructureLink]) -> list[dict]:
    seen: set[tuple[int, int]] = set()
    out: list[dict] = []
    for p in nodes:
        if p.parent_id is None:
            continue
        key = (p.parent_id, p.id)
        if key in seen:
            continue
        seen.add(key)
        out.append({"from": p.parent_id, "to": p.id, "kind": "parent"})
    for link in links:
        key = (link.from_node_id, link.to_node_id)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "id": link.id,
                "from": link.from_node_id,
                "to": link.to_node_id,
                "kind": "link",
            }
        )
    return out


def _build_response(
    nodes: list[KcStructureNode],
    links: list[KcStructureLink],
    employees: list[KcEmployee],
    request: Request,
    can_edit: bool,
) -> dict:
    assigned, unassigned = assign_employees_to_nodes(nodes, employees)
    roots, _ = build_tree_payloads(
        nodes, assigned, employees, lambda url: _photo_public_url(request, url)
    )
    flat = flatten_tree(roots)
    emp_by_id = {e.id: e for e in employees}
    for p in flat:
        if p.manager_employee_id and not p.manager:
            emp = emp_by_id.get(p.manager_employee_id)
            if emp:
                from app.domain.kc_structure import StructureEmployeeBrief

                p.manager = StructureEmployeeBrief(
                    id=emp.id,
                    full_name=emp.full_name,
                    position=emp.position,
                    photo_url=_photo_public_url(request, emp.photo_url),
                    department=emp.department,
                    subdivision=emp.subdivision,
                )
    edges = _build_edges(nodes, links)
    return {
        "nodes": [_flat_node_dict(p, lambda u: u) for p in flat],
        "edges": edges,
        "tree": [],  # legacy
        "unassigned": [
            {
                "id": e.id,
                "fullName": e.full_name,
                "position": e.position,
                "photoUrl": _photo_public_url(request, e.photo_url),
                "department": e.department,
                "subdivision": e.subdivision,
            }
            for e in unassigned
        ],
        "allEmployees": [
            {
                "id": e.id,
                "fullName": e.full_name,
                "position": e.position,
                "photoUrl": _photo_public_url(request, e.photo_url),
                "department": e.department,
                "subdivision": e.subdivision,
            }
            for e in employees
        ],
        "canEdit": can_edit,
    }


@router.get("")
async def get_kc_structure(
    request: Request,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    nodes, links, employees = await _load_structure_context(session)
    suppressed = await _load_suppressed_keys(session)
    merged = sync_nodes_from_employees(nodes, employees, suppressed)
    if any(n.id is None for n in merged):
        await _persist_synced_nodes(session, merged)
        nodes, links, employees = await _load_structure_context(session)
    if reconcile_root_flags(nodes, employees):
        for n in nodes:
            if n.id is None:
                session.add(n)
        await session.commit()
        nodes, links, employees = await _load_structure_context(session)
    return _build_response(nodes, links, employees, request, _can_edit_structure(identity))


@router.post("/sync")
async def sync_kc_structure(
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    nodes, _links, employees = await _load_structure_context(session)
    suppressed = await _load_suppressed_keys(session)
    merged = sync_nodes_from_employees(nodes, employees, suppressed)
    synced = await _persist_synced_nodes(session, merged)
    return {"synced": synced, "total": len(merged)}


@router.post("/links")
async def create_structure_link(
    body: StructureLinkCreate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    if body.fromNodeId == body.toNodeId:
        raise HTTPException(status_code=400, detail="Нельзя связать узел с самим собой")
    for nid in (body.fromNodeId, body.toNodeId):
        if not await session.get(KcStructureNode, nid):
            raise HTTPException(status_code=404, detail="Узел не найден")
    existing = (
        await session.execute(
            select(KcStructureLink).where(
                KcStructureLink.from_node_id == body.fromNodeId,
                KcStructureLink.to_node_id == body.toNodeId,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "from": existing.from_node_id, "to": existing.to_node_id}
    row = KcStructureLink(from_node_id=body.fromNodeId, to_node_id=body.toNodeId)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return {"id": row.id, "from": row.from_node_id, "to": row.to_node_id}


@router.delete("/links/{link_id}")
async def delete_structure_link(
    link_id: int,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    row = await session.get(KcStructureLink, link_id)
    if not row:
        raise HTTPException(status_code=404, detail="Связь не найдена")
    await session.delete(row)
    await session.commit()
    return {"deleted": link_id}


@router.post("/nodes")
async def create_structure_node(
    body: StructureNodeCreate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    if body.isLocation:
        city = body.locationCity.strip() or body.title.strip()
        if not city:
            raise HTTPException(status_code=400, detail="Укажите город локации")
        title = city
    else:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Укажите название")
    if body.parentId:
        parent = await session.get(KcStructureNode, body.parentId)
        if not parent:
            raise HTTPException(status_code=404, detail="Родительский узел не найден")
    max_order = (await session.execute(select(KcStructureNode.sort_order))).scalars().all()
    sort_order = (max(max_order) if max_order else 0) + 10
    row = KcStructureNode(
        title=title,
        parent_id=body.parentId,
        match_department=body.matchDepartment.strip(),
        match_subdivision=body.matchSubdivision.strip(),
        sort_order=sort_order,
        pos_x=body.x,
        pos_y=body.y,
        is_location=body.isLocation,
        location_city=body.locationCity.strip() if body.isLocation else "",
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return {"id": row.id, "title": row.title}


@router.patch("/nodes/{node_id}")
async def update_structure_node(
    node_id: int,
    body: StructureNodeUpdate,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    row = await session.get(KcStructureNode, node_id)
    if not row:
        raise HTTPException(status_code=404, detail="Узел не найден")

    nodes = list((await session.execute(select(KcStructureNode))).scalars().all())
    by_id = {n.id: n for n in nodes}

    if body.unsetParent:
        row.parent_id = None
    elif body.parentId is not None:
        if body.parentId == node_id:
            raise HTTPException(status_code=400, detail="Узел не может быть родителем самого себя")
        if body.parentId and body.parentId not in by_id:
            raise HTTPException(status_code=404, detail="Родитель не найден")
        if body.parentId and would_create_cycle(by_id, node_id, body.parentId):
            raise HTTPException(status_code=400, detail="Нельзя переместить узел внутрь своего поддерева")
        row.parent_id = body.parentId or None

    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        row.title = title
    if body.matchDepartment is not None:
        row.match_department = body.matchDepartment.strip()
    if body.matchSubdivision is not None:
        row.match_subdivision = body.matchSubdivision.strip()
    if body.x is not None:
        row.pos_x = float(body.x)
    if body.y is not None:
        row.pos_y = float(body.y)
    if body.isBranchLeader is not None:
        if row.is_location:
            raise HTTPException(status_code=400, detail="Локация не может быть руководителем ветки")
        if row.is_root and body.isBranchLeader:
            raise HTTPException(status_code=400, detail="Корневой узел не может быть руководителем ветки")
        row.is_branch_leader = bool(body.isBranchLeader)
        if row.is_branch_leader:
            row.is_root = False
    if body.branchLeaderTitle is not None:
        row.branch_leader_title = body.branchLeaderTitle.strip()
    if body.locationCity is not None and row.is_location:
        city = body.locationCity.strip()
        if not city:
            raise HTTPException(status_code=400, detail="Укажите город локации")
        row.location_city = city
        row.title = city
    if body.unsetManager:
        row.manager_employee_id = None
    elif body.managerEmployeeId is not None:
        if body.managerEmployeeId:
            mgr = await session.get(KcEmployee, body.managerEmployeeId)
            if not mgr:
                raise HTTPException(status_code=404, detail="Сотрудник не найден")
        row.manager_employee_id = body.managerEmployeeId or None

    await session.commit()
    return {"id": row.id}


@router.put("/nodes/{node_id}/members")
async def update_structure_members(
    node_id: int,
    body: StructureMembersBody,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    row = await session.get(KcStructureNode, node_id)
    if not row:
        raise HTTPException(status_code=404, detail="Узел не найден")
    if row.is_location:
        raise HTTPException(status_code=400, detail="У локации нет состава сотрудников")
    current = set(parse_manual_ids(row.manual_member_ids))
    for eid in body.removeEmployeeIds:
        current.discard(int(eid))
    for eid in body.addEmployeeIds:
        emp = await session.get(KcEmployee, int(eid))
        if not emp:
            raise HTTPException(status_code=404, detail=f"Сотрудник {eid} не найден")
        current.add(int(eid))
        if row.match_department:
            emp.department = row.match_department
        if row.match_subdivision:
            emp.subdivision = row.match_subdivision
    row.manual_member_ids = dump_manual_ids(list(current))
    await session.commit()
    return {"manualMemberIds": list(current)}


@router.delete("/nodes/{node_id}")
async def delete_structure_node(
    node_id: int,
    identity: Identity = Depends(get_identity),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    _require_structure_editor(identity)
    row = await session.get(KcStructureNode, node_id)
    if not row:
        raise HTTPException(status_code=404, detail="Узел не найден")
    if row.is_root:
        raise HTTPException(status_code=400, detail="Нельзя удалить корневую карточку структуры")
    nodes, _links, employees = await _load_structure_context(session)
    nodes_by_id = {n.id: n for n in nodes if n.id is not None}
    if row.id is not None:
        nodes_by_id[row.id] = row
    keys = collect_suppression_keys_for_delete(row, nodes_by_id, employees)
    await _add_suppressed_keys(session, keys)
    children = (
        await session.execute(select(KcStructureNode).where(KcStructureNode.parent_id == node_id))
    ).scalars().all()
    for ch in children:
        ch.parent_id = row.parent_id
    await session.delete(row)
    await session.commit()
    return {"deleted": node_id}
