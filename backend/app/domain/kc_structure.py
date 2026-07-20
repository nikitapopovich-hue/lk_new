from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.infra.models import KcEmployee, KcStructureNode


@dataclass
class StructureEmployeeBrief:
    id: int
    full_name: str
    position: str
    photo_url: str
    department: str
    subdivision: str


@dataclass
class StructureNodePayload:
    id: int
    title: str
    parent_id: int | None
    match_department: str
    match_subdivision: str
    manager_employee_id: int | None
    sort_order: int
    pos_x: float
    pos_y: float
    manual_member_ids: list[int]
    manager: StructureEmployeeBrief | None = None
    employees: list[StructureEmployeeBrief] = field(default_factory=list)
    children: list[StructureNodePayload] = field(default_factory=list)
    is_root: bool = False
    is_branch_leader: bool = False
    branch_leader_title: str = ""
    is_location: bool = False
    location_city: str = ""
    org_unit_count: int = 0
    org_employee_count: int = 0


ROOT_NODE_TITLE = "Директор по обслуживанию клиентов"


def find_director_employee(employees: list[KcEmployee]) -> KcEmployee | None:
    for emp in employees:
        pos = emp.position.strip().lower()
        if "директор" in pos and "обслуживан" in pos and "клиент" in pos:
            return emp
    for emp in employees:
        if emp.position.strip().lower() == ROOT_NODE_TITLE.lower():
            return emp
    return None


def ensure_root_node(nodes: list[KcStructureNode], employees: list[KcEmployee]) -> KcStructureNode:
    director = find_director_employee(employees)
    roots = [n for n in nodes if n.is_root]
    root = roots[0] if roots else None
    for extra in roots[1:]:
        extra.is_root = False
    if root is None:
        root = KcStructureNode(
            title=ROOT_NODE_TITLE,
            match_department="",
            match_subdivision="",
            sort_order=-1000,
            is_root=True,
        )
        nodes.insert(0, root)
    else:
        root.is_root = True
        if not root.title.strip():
            root.title = ROOT_NODE_TITLE
    root.parent_id = None
    if director:
        root.manager_employee_id = director.id
    return root


def parse_manual_ids(raw: str) -> list[int]:
    text = (raw or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[int] = []
    for item in data:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def dump_manual_ids(ids: list[int]) -> str:
    cleaned = sorted({int(i) for i in ids if int(i) > 0})
    return json.dumps(cleaned, ensure_ascii=False)


def _match_key(department: str, subdivision: str) -> tuple[str, str]:
    return (department.strip(), subdivision.strip())


def is_pair_suppressed(
    department: str,
    subdivision: str,
    suppressed: set[tuple[str, str]],
) -> bool:
    dept, sub = _match_key(department, subdivision)
    if (dept, sub) in suppressed:
        return True
    return bool(sub and (dept, "") in suppressed)


def collect_suppression_keys_for_delete(
    node: KcStructureNode,
    nodes_by_id: dict[int, KcStructureNode],
    employees: list[KcEmployee],
) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for nid in collect_subtree_ids(nodes_by_id, node.id):
        n = nodes_by_id[nid]
        dept = n.match_department.strip()
        sub = n.match_subdivision.strip()
        if dept or sub:
            keys.add((dept, sub))
        elif n.title.strip():
            keys.add((n.title.strip(), ""))

    root_dept = node.match_department.strip() or node.title.strip()
    root_sub = node.match_subdivision.strip()
    if root_dept and not root_sub:
        keys.add((root_dept, ""))
        for emp in employees:
            if emp.department.strip() == root_dept:
                emp_sub = emp.subdivision.strip()
                if emp_sub:
                    keys.add((root_dept, emp_sub))
    elif root_dept and root_sub:
        keys.add((root_dept, root_sub))
        keys.add((root_dept, ""))
    return keys


def assign_employees_to_nodes(
    nodes: list[KcStructureNode],
    employees: list[KcEmployee],
) -> tuple[dict[int, list[KcEmployee]], list[KcEmployee]]:
    by_key: dict[tuple[str, str], list[KcStructureNode]] = {}
    dept_only: dict[str, KcStructureNode] = {}
    manual_by_node: dict[int, set[int]] = {n.id: set(parse_manual_ids(n.manual_member_ids)) for n in nodes}
    emp_by_id = {e.id: e for e in employees}

    for node in nodes:
        if node.is_location:
            continue
        key = _match_key(node.match_department, node.match_subdivision)
        by_key.setdefault(key, []).append(node)
        if key[1] == "" and key[0]:
            dept_only[key[0]] = node

    assigned: dict[int, list[KcEmployee]] = {n.id: [] for n in nodes}
    used: set[int] = set()

    for node in nodes:
        if node.is_root or node.is_location:
            continue
        for eid in manual_by_node.get(node.id, set()):
            emp = emp_by_id.get(eid)
            if emp:
                assigned[node.id].append(emp)
                used.add(eid)

    for emp in employees:
        if emp.id in used:
            continue
        if any(n.is_root and n.manager_employee_id == emp.id for n in nodes):
            continue
        dept = emp.department.strip() or "Без отдела"
        sub = emp.subdivision.strip()
        target: KcStructureNode | None = None
        exact = by_key.get((dept, sub))
        if exact:
            target = exact[0]
        elif sub:
            partial = by_key.get((dept, ""))
            if partial:
                target = partial[0]
        elif dept in dept_only:
            target = dept_only[dept]
        if target:
            assigned[target.id].append(emp)
            used.add(emp.id)
        else:
            continue

    unassigned = [e for e in employees if e.id not in used]
    return assigned, unassigned


def build_tree_payloads(
    nodes: list[KcStructureNode],
    employees_by_node: dict[int, list[KcEmployee]],
    all_employees: list[KcEmployee],
    photo_url_fn,
) -> tuple[list[StructureNodePayload], list[StructureEmployeeBrief]]:
    emp_brief_cache: dict[int, StructureEmployeeBrief] = {}
    emp_by_id = {e.id: e for e in all_employees}
    director = find_director_employee(all_employees)
    director_id = director.id if director else None
    org_units = len([n for n in nodes if not n.is_root and not n.is_location and not n.is_branch_leader])
    org_employees = len([e for e in all_employees if e.id != director_id])

    def brief(emp: KcEmployee) -> StructureEmployeeBrief:
        if emp.id not in emp_brief_cache:
            emp_brief_cache[emp.id] = StructureEmployeeBrief(
                id=emp.id,
                full_name=emp.full_name,
                position=emp.position,
                photo_url=photo_url_fn(emp.photo_url),
                department=emp.department,
                subdivision=emp.subdivision,
            )
        return emp_brief_cache[emp.id]

    payloads: dict[int, StructureNodePayload] = {}
    for node in nodes:
        members = employees_by_node.get(node.id, [])
        manager_brief = None
        if node.is_location:
            city = (node.location_city or node.title).strip()
            payloads[node.id] = StructureNodePayload(
                id=node.id,
                title=city or node.title,
                parent_id=node.parent_id,
                match_department=node.match_department,
                match_subdivision=node.match_subdivision,
                manager_employee_id=None,
                sort_order=node.sort_order,
                pos_x=float(node.pos_x or 0),
                pos_y=float(node.pos_y or 0),
                manual_member_ids=[],
                manager=None,
                employees=[],
                is_location=True,
                location_city=city,
            )
            continue
        if node.is_root or node.is_branch_leader:
            head_id = node.manager_employee_id or (director_id if node.is_root else None)
            head = emp_by_id.get(head_id) if head_id else None
            if head:
                manager_brief = brief(head)
            if node.is_root:
                payloads[node.id] = StructureNodePayload(
                    id=node.id,
                    title=node.title,
                    parent_id=node.parent_id,
                    match_department=node.match_department,
                    match_subdivision=node.match_subdivision,
                    manager_employee_id=head_id,
                    sort_order=node.sort_order,
                    pos_x=float(node.pos_x or 0),
                    pos_y=float(node.pos_y or 0),
                    manual_member_ids=parse_manual_ids(node.manual_member_ids),
                    manager=manager_brief,
                    employees=[],
                    is_root=True,
                    org_unit_count=org_units,
                    org_employee_count=org_employees,
                )
            else:
                payloads[node.id] = StructureNodePayload(
                    id=node.id,
                    title=node.title,
                    parent_id=node.parent_id,
                    match_department=node.match_department,
                    match_subdivision=node.match_subdivision,
                    manager_employee_id=head_id,
                    sort_order=node.sort_order,
                    pos_x=float(node.pos_x or 0),
                    pos_y=float(node.pos_y or 0),
                    manual_member_ids=parse_manual_ids(node.manual_member_ids),
                    manager=manager_brief,
                    employees=[],
                    is_branch_leader=True,
                    branch_leader_title=(node.branch_leader_title or "").strip(),
                )
            continue
        if node.manager_employee_id:
            mgr = next((e for e in members if e.id == node.manager_employee_id), None)
            if not mgr:
                mgr = emp_by_id.get(node.manager_employee_id)
            if mgr:
                manager_brief = brief(mgr)
        payloads[node.id] = StructureNodePayload(
            id=node.id,
            title=node.title,
            parent_id=node.parent_id,
            match_department=node.match_department,
            match_subdivision=node.match_subdivision,
            manager_employee_id=node.manager_employee_id,
            sort_order=node.sort_order,
            pos_x=float(node.pos_x or 0),
            pos_y=float(node.pos_y or 0),
            manual_member_ids=parse_manual_ids(node.manual_member_ids),
            manager=manager_brief,
            employees=[brief(e) for e in members if e.id != node.manager_employee_id],
            is_root=False,
        )

    roots: list[StructureNodePayload] = []
    for node in sorted(nodes, key=lambda n: (n.sort_order, n.title.lower())):
        payload = payloads[node.id]
        if node.parent_id and node.parent_id in payloads:
            payloads[node.parent_id].children.append(payload)
        else:
            roots.append(payload)

    def sort_children(p: StructureNodePayload) -> None:
        p.children.sort(key=lambda c: (c.sort_order, c.title.lower()))
        for ch in p.children:
            sort_children(ch)

    for r in roots:
        sort_children(r)
    roots.sort(key=lambda r: (r.sort_order, r.title.lower()))

    return roots, []


def flatten_tree(roots: list[StructureNodePayload]) -> list[StructureNodePayload]:
    out: list[StructureNodePayload] = []

    def walk(n: StructureNodePayload) -> None:
        out.append(n)
        for ch in n.children:
            walk(ch)

    for r in roots:
        walk(r)
    return out


def collect_subtree_ids(nodes_by_id: dict[int, KcStructureNode], root_id: int) -> set[int]:
    out: set[int] = {root_id}
    for node in nodes_by_id.values():
        if node.parent_id == root_id and node.id not in out:
            out |= collect_subtree_ids(nodes_by_id, node.id)
    return out


def would_create_cycle(nodes_by_id: dict[int, KcStructureNode], node_id: int, new_parent_id: int) -> bool:
    if new_parent_id == node_id:
        return True
    return new_parent_id in collect_subtree_ids(nodes_by_id, node_id)


def sync_nodes_from_employees(
    existing: list[KcStructureNode],
    employees: list[KcEmployee],
    suppressed: set[tuple[str, str]] | None = None,
) -> list[KcStructureNode]:
    suppressed = suppressed or set()
    by_key = {_match_key(n.match_department, n.match_subdivision): n for n in existing}
    dept_nodes: dict[str, KcStructureNode] = {}
    for n in existing:
        d, s = _match_key(n.match_department, n.match_subdivision)
        if d and not s:
            dept_nodes[d] = n

    pairs: set[tuple[str, str]] = set()
    for emp in employees:
        dept = emp.department.strip() or "Без отдела"
        sub = emp.subdivision.strip()
        pairs.add((dept, ""))
        if sub:
            pairs.add((dept, sub))

    new_nodes: list[KcStructureNode] = list(existing)
    sort_base = (max((n.sort_order for n in existing), default=0) // 10 + 1) * 10

    for dept, sub in sorted(pairs, key=lambda x: (x[0].lower(), x[1].lower())):
        key = (dept, sub)
        if key in by_key:
            continue
        if is_pair_suppressed(dept, sub, suppressed):
            continue
        parent_id = None
        title = sub or dept
        if sub:
            parent = dept_nodes.get(dept)
            if not parent and not is_pair_suppressed(dept, "", suppressed):
                parent = KcStructureNode(
                    title=dept,
                    match_department=dept,
                    match_subdivision="",
                    sort_order=sort_base,
                )
                sort_base += 10
                new_nodes.append(parent)
                dept_nodes[dept] = parent
                by_key[(dept, "")] = parent
            parent_id = parent.id if parent.id else None
        node = KcStructureNode(
            title=title,
            parent_id=parent_id,
            match_department=dept,
            match_subdivision=sub,
            sort_order=sort_base,
        )
        sort_base += 10
        new_nodes.append(node)
        by_key[key] = node

    ensure_root_node(new_nodes, employees)
    return new_nodes


def reconcile_root_flags(nodes: list[KcStructureNode], employees: list[KcEmployee]) -> bool:
    """Приводит корневой узел в порядок. Возвращает True, если нужен commit."""
    root = ensure_root_node(nodes, employees)
    changed = root.id is None
    for n in nodes:
        if n is not root and n.is_root:
            n.is_root = False
            changed = True
    director = find_director_employee(employees)
    if director and root.manager_employee_id != director.id:
        root.manager_employee_id = director.id
        changed = True
    return changed
