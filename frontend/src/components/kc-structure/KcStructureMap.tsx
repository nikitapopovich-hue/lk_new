import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoLayout,
  edgeCurvePath,
  fitViewport,
  getBounds,
  needsAutoLayout,
  getNodeSize,
  NODE_H,
  NODE_W,
  nodeAnchor,
  pickAnchorSides,
  BRANCH_NODE_H,
  BRANCH_NODE_W,
  LOCATION_NODE_H,
  LOCATION_NODE_W,
  ROOT_NODE_H,
  ROOT_NODE_W,
  type AnchorSide,
  type NodeSizeKind,
} from "../../lib/kcStructureLayout";
import { coatUrlForCity, KC_STRUCTURE_LOCATION_CITIES } from "../../lib/kcStructureLocations";
import { findNodesByEmployeeQuery } from "../../lib/kcStructureSearch";
import { KcSelectInput } from "../kc-data/KcSelectInput";
import { KcEmployeeModal } from "../kc-data/KcEmployeeModal";
import { type KcEmployeeRecord, type KcFieldLabel } from "../../lib/kcData";
import { KcStructureMembersModal } from "./KcStructureMembersModal";
import {
  createKcStructureLink,
  createKcStructureNode,
  deleteKcStructureNode,
  syncKcStructure,
  updateKcStructureMembers,
  updateKcStructureNode,
  type KcStructureFlatNode,
  type KcStructureResponse,
} from "../../lib/kcStructure";
import "./KcStructureMap.css";

const DRAG_THRESHOLD = 6;
const PORT_SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

function nodeKind(node: KcStructureFlatNode): NodeSizeKind {
  return {
    isRoot: node.isRoot,
    isBranchLeader: node.isBranchLeader,
    isLocation: node.isLocation,
  };
}

function snapView(v: { scale: number; tx: number; ty: number }) {
  return {
    scale: Math.round(Math.min(1.4, Math.max(0.25, v.scale)) * 100) / 100,
    tx: Math.round(v.tx),
    ty: Math.round(v.ty),
  };
}

type Props = {
  data: KcStructureResponse;
  kcEmployees: KcEmployeeRecord[];
  fieldLabels: KcFieldLabel[];
  departmentHints: string[];
  subdivisionHints: string[];
  kcCanEdit: boolean;
  onChanged: () => void;
  onClose: () => void;
};

function Av(props: { url?: string; name: string; className?: string }) {
  const cls = props.className ?? "kc-map-av";
  if (props.url) {
    return <img className={cls} src={props.url} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${cls} kc-map-av--ph`} aria-hidden>
      {props.name.charAt(0)}
    </span>
  );
}

export function KcStructureMap(props: Props) {
  const canEdit = props.data.canEdit;
  const stageRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Record<number, { x: number; y: number }>>({});
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [view, setView] = useState({ scale: 1, tx: 48, ty: 48 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const pendingDrag = useRef<{
    nodeId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [linkDrag, setLinkDrag] = useState<{
    fromNodeId: number;
    fromSide: AnchorSide;
    x: number;
    y: number;
  } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockFit, setLockFit] = useState(false);
  const [lock100, setLock100] = useState(false);
  const [worldSize, setWorldSize] = useState({ w: 800, h: 600 });
  const [mapEditMode, setMapEditMode] = useState(canEdit);

  useEffect(() => {
    setMapEditMode(canEdit);
  }, [canEdit]);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const [membersModalNode, setMembersModalNode] = useState<KcStructureFlatNode | null>(null);
  const [employeeView, setEmployeeView] = useState<KcEmployeeRecord | null>(null);
  const [branchTitle, setBranchTitle] = useState("");

  const nodes = props.data.nodes;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const initPositions = useMemo(() => {
    const base: Record<number, { x: number; y: number }> = {};
    for (const n of nodes) base[n.id] = { x: n.x, y: n.y };
    if (needsAutoLayout(nodes)) {
      return { ...base, ...autoLayout(nodes) };
    }
    return base;
  }, [nodes]);

  useEffect(() => {
    setPositions(initPositions);
  }, [initPositions]);

  positionsRef.current = positions;

  const applyFit = useCallback(() => {
    const el = stageRef.current;
    if (!el || nodes.length === 0) return;
    const bounds = getBounds(nodes, positionsRef.current);
    setView(snapView(fitViewport(bounds, el.clientWidth, el.clientHeight)));
  }, [nodes]);

  const applyView = useCallback(
    (next: { scale: number; tx: number; ty: number }) => {
      if (lockFit) {
        applyFit();
        return;
      }
      if (lock100) {
        setView(snapView({ ...next, scale: 1 }));
        return;
      }
      setView(snapView(next));
    },
    [lockFit, lock100, applyFit],
  );

  useEffect(() => {
    if (!lockFit) return;
    applyFit();
  }, [lockFit, positions, nodes, applyFit]);

  useEffect(() => {
    if (dragId != null || linkDrag) return;
    const b = getBounds(nodes, positions);
    setWorldSize({ w: Math.max(b.maxX + 80, 800), h: Math.max(b.maxY + 80, 600) });
  }, [nodes, positions, dragId, linkDrag]);

  useEffect(() => {
    if (selectedId == null) return;
    const n = nodes.find((x) => x.id === selectedId);
    setEditTitle(n?.title ?? "");
    setBranchTitle(n?.branchLeaderTitle ?? "");
  }, [selectedId, nodes]);

  const focusNode = useCallback(
    (nodeId: number) => {
      const node = nodeById.get(nodeId);
      const pos = positionsRef.current[nodeId];
      const el = stageRef.current;
      if (!node || !pos || !el) return;
      const { w, h } = getNodeSize(nodeKind(node));
      const cx = pos.x + w / 2;
      const cy = pos.y + h / 2;
      const scale = lock100 ? 1 : Math.max(viewRef.current.scale, 0.85);
      applyView({
        scale,
        tx: Math.round(el.clientWidth / 2 - cx * scale),
        ty: Math.round(el.clientHeight / 2 - cy * scale),
      });
    },
    [nodeById, lock100, applyView],
  );

  const runSearch = useCallback(() => {
    const ids = findNodesByEmployeeQuery(nodes, searchQuery, props.data.allEmployees);
    setHighlightIds(new Set(ids));
    if (ids.length > 0) focusNode(ids[0]!);
  }, [nodes, searchQuery, focusNode]);

  const edges = useMemo(() => {
    const out: { id: string; d: string; kind?: "parent" | "link" }[] = [];
    for (const e of props.data.edges) {
      const from = positions[e.from];
      const to = positions[e.to];
      if (!from || !to) continue;
      const fromNode = nodeById.get(e.from);
      const toNode = nodeById.get(e.to);
      const { fromSide, toSide } = pickAnchorSides(
        from,
        to,
        fromNode ? nodeKind(fromNode) : undefined,
        toNode ? nodeKind(toNode) : undefined,
      );
      const a = nodeAnchor(from, fromSide, fromNode ? nodeKind(fromNode) : undefined);
      const b = nodeAnchor(to, toSide, toNode ? nodeKind(toNode) : undefined);
      const d = edgeCurvePath(a, b, fromSide, toSide);
      const key = e.id != null ? `link-${e.id}` : `parent-${e.from}-${e.to}`;
      out.push({ id: key, d, kind: e.kind });
    }
    return out;
  }, [props.data.edges, positions, nodeById]);

  const linkPreview = useMemo(() => {
    if (!linkDrag) return null;
    const from = positions[linkDrag.fromNodeId];
    if (!from) return null;
    const fromNode = nodeById.get(linkDrag.fromNodeId);
    const a = nodeAnchor(from, linkDrag.fromSide, fromNode ? nodeKind(fromNode) : undefined);
    const b = { x: linkDrag.x, y: linkDrag.y };
    const ghostTo = { x: linkDrag.x - NODE_W / 2, y: linkDrag.y - NODE_H / 2 };
    const { toSide } = pickAnchorSides(from, ghostTo);
    return edgeCurvePath(a, b, linkDrag.fromSide, toSide);
  }, [linkDrag, positions, nodeById]);

  const worldW = worldSize.w;
  const worldH = worldSize.h;

  function screenToWorld(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - view.tx) / view.scale,
      y: (clientY - rect.top - view.ty) / view.scale,
    };
  }

  function findNodeAt(wx: number, wy: number, excludeId: number): number | null {
    for (const n of nodes) {
      if (n.id === excludeId) continue;
      const p = positions[n.id];
      if (!p) continue;
      const { w, h } = getNodeSize(nodeKind(n));
      if (wx >= p.x && wx <= p.x + w && wy >= p.y && wy <= p.y + h) {
        return n.id;
      }
    }
    return null;
  }

  function onWheel(e: React.WheelEvent) {
    if (lockFit || lock100 || dragId != null || linkDrag) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    applyView({ ...viewRef.current, scale: viewRef.current.scale * factor });
  }

  function toggleLockFit() {
    setLockFit((on) => {
      const next = !on;
      if (next) {
        setLock100(false);
        window.setTimeout(applyFit, 0);
      }
      return next;
    });
  }

  function toggleLock100() {
    setLock100((on) => {
      const next = !on;
      if (next) {
        setLockFit(false);
        setView((v) => snapView({ ...v, scale: 1 }));
      }
      return next;
    });
  }

  async function persistPosition(id: number, x: number, y: number) {
    await updateKcStructureNode(id, { x, y });
  }

  function openNodeInViewMode(node: KcStructureFlatNode) {
    if (node.isLocation) return;
    if (node.isRoot || node.isBranchLeader) {
      const headId = node.managerEmployeeId ?? node.manager?.id;
      if (!headId) return;
      const rec = props.kcEmployees.find((e) => e.id === headId);
      if (rec) setEmployeeView(rec);
      return;
    }
    setMembersModalNode(node);
  }

  function onPortPointerDown(e: React.PointerEvent, nodeId: number, side: AnchorSide) {
    if (!canEdit || !mapEditMode) return;
    e.stopPropagation();
    e.preventDefault();
    const w = screenToWorld(e.clientX, e.clientY);
    setLinkDrag({ fromNodeId: nodeId, fromSide: side, x: w.x, y: w.y });
    setSelectedId(nodeId);
    stageRef.current?.setPointerCapture(e.pointerId);
  }

  function onNodePointerDown(e: React.PointerEvent, node: KcStructureFlatNode) {
    if ((e.target as HTMLElement).closest(".kc-map-port")) return;
    e.stopPropagation();
    setSelectedId(node.id);
    pendingDrag.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!canEdit || linkDrag || !mapEditMode) return;
    const p = positions[node.id] ?? { x: 0, y: 0 };
    const w = screenToWorld(e.clientX, e.clientY);
    dragOffset.current = { x: w.x - p.x, y: w.y - p.y };
  }

  function onNodePointerMove(e: React.PointerEvent, nodeId: number) {
    const pending = pendingDrag.current;
    if (pending?.nodeId === nodeId && dragId == null) {
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        if (canEdit && mapEditMode) {
          pending.moved = true;
          setDragId(nodeId);
        }
      }
    }
    if (dragId !== nodeId) return;
    if (!canEdit || !mapEditMode) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const x = w.x - dragOffset.current.x;
    const y = w.y - dragOffset.current.y;
    setPositions((prev) => ({ ...prev, [nodeId]: { x, y } }));
  }

  async function onNodePointerUp(e: React.PointerEvent, nodeId: number) {
    const pending = pendingDrag.current;
    const wasThisNode = pending?.nodeId === nodeId;
    if (wasThisNode) pendingDrag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (dragId === nodeId) {
      const p = positions[nodeId];
      setDragId(null);
      if (!p || !canEdit || !mapEditMode) return;
      try {
        await persistPosition(nodeId, p.x, p.y);
        props.onChanged();
      } catch {
        /* parent reloads on error via page */
      }
      return;
    }

    if (wasThisNode && pending && !pending.moved) {
      const node = nodeById.get(nodeId);
      if (!node) return;
      if (!mapEditMode) {
        openNodeInViewMode(node);
        return;
      }
      setSelectedId(nodeId);
    }
  }

  function onStagePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".kc-map-node")) return;
    if ((e.target as HTMLElement).closest(".kc-map-port")) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onStagePointerMove(e: React.PointerEvent) {
    if (linkDrag) {
      const w = screenToWorld(e.clientX, e.clientY);
      setLinkDrag((prev) => (prev ? { ...prev, x: w.x, y: w.y } : null));
      return;
    }
    if (dragId != null) return;
    if (!panning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    applyView({
      ...viewRef.current,
      tx: panStart.current.tx + dx,
      ty: panStart.current.ty + dy,
    });
  }

  async function finishLinkDrag(e: React.PointerEvent) {
    if (!linkDrag) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const targetId = findNodeAt(w.x, w.y, linkDrag.fromNodeId);
    const fromId = linkDrag.fromNodeId;
    setLinkDrag(null);
    if (targetId != null) {
      try {
        await createKcStructureLink(fromId, targetId);
        props.onChanged();
      } catch {
        /* ignore */
      }
    }
  }

  function onStagePointerUp(e: React.PointerEvent) {
    if (linkDrag) {
      void finishLinkDrag(e);
    }
    setPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  const selected = nodes.find((n) => n.id === selectedId);

  return (
    <div className="kc-map-root">
      <header className="kc-map-topbar">
        <div className="kc-map-topbar__left">
          <h1 className="kc-map-title">Структура КЦ</h1>
          <div className="kc-map-search">
            <input
              type="search"
              className="kc-map-search__input"
              placeholder="Поиск: ФИО, должность…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
            <button type="button" className="kc-map-search__btn" onClick={runSearch}>
              Найти
            </button>
          </div>
          {canEdit ? (
            <button
              type="button"
              className={`kc-map-toolbar-btn ${mapEditMode ? "kc-map-toolbar-btn--active" : ""}`}
              onClick={() => setMapEditMode((v) => !v)}
              aria-pressed={mapEditMode}
            >
              Редактирование таблицы {mapEditMode ? "вкл" : "выкл"}
            </button>
          ) : null}
          {!canEdit ? (
            <span className="kc-map-toolbar-hint text-xs text-white/45">Только просмотр</span>
          ) : null}
          {canEdit && mapEditMode ? (
            <>
              <button
                type="button"
                className="kc-map-toolbar-btn kc-map-toolbar-btn--accent"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void syncKcStructure()
                    .then(() => props.onChanged())
                    .finally(() => setBusy(false));
                }}
              >
                Обновить из данных КЦ
              </button>
              <button
                type="button"
                className="kc-map-toolbar-btn"
                disabled={busy}
                onClick={() => {
                  const cx = (-view.tx + (stageRef.current?.clientWidth ?? 400) / 2) / view.scale;
                  const cy = (-view.ty + (stageRef.current?.clientHeight ?? 300) / 2) / view.scale;
                  setBusy(true);
                  void createKcStructureNode({
                    isLocation: true,
                    locationCity: "Ростов-на-Дону",
                    title: "Ростов-на-Дону",
                    x: cx,
                    y: cy,
                  })
                    .then((res) => {
                      setSelectedId(res.id);
                      props.onChanged();
                      window.setTimeout(() => focusNode(res.id), 350);
                    })
                    .catch((e: unknown) => {
                      window.alert(e instanceof Error ? e.message : String(e));
                    })
                    .finally(() => setBusy(false));
                }}
              >
                + Локация
              </button>
              <button
                type="button"
                className="kc-map-toolbar-btn"
                disabled={busy}
                onClick={() => {
                  const cx = (-view.tx + (stageRef.current?.clientWidth ?? 400) / 2) / view.scale;
                  const cy = (-view.ty + (stageRef.current?.clientHeight ?? 300) / 2) / view.scale;
                  setBusy(true);
                  void createKcStructureNode({ title: "Новый отдел", x: cx, y: cy })
                    .then(() => props.onChanged())
                    .finally(() => setBusy(false));
                }}
              >
                + Отдел
              </button>
              <button
                type="button"
                className="kc-map-toolbar-btn"
                disabled={busy || selectedId == null}
                onClick={() => {
                  const parent = selectedId!;
                  const parentNode = nodes.find((n) => n.id === parent);
                  const parentH = parentNode ? getNodeSize(nodeKind(parentNode)).h : NODE_H;
                  const pp = positions[parent] ?? { x: 0, y: 0 };
                  setBusy(true);
                  void createKcStructureNode({
                    title: "Новый подраздел",
                    parentId: parent,
                    x: pp.x,
                    y: pp.y + parentH + 72,
                  })
                    .then(() => props.onChanged())
                    .finally(() => setBusy(false));
                }}
              >
                + Подраздел
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`kc-map-toolbar-btn ${lockFit ? "kc-map-toolbar-btn--active" : ""}`}
            onClick={toggleLockFit}
            aria-pressed={lockFit}
          >
            Вписать в экран {lockFit ? "вкл" : "выкл"}
          </button>
          <button
            type="button"
            className={`kc-map-toolbar-btn ${lock100 ? "kc-map-toolbar-btn--active" : ""}`}
            onClick={toggleLock100}
            aria-pressed={lock100}
          >
            100% {lock100 ? "вкл" : "выкл"}
          </button>
        </div>
        <button type="button" className="kc-map-close" onClick={props.onClose} aria-label="Закрыть карту">
          ×
        </button>
      </header>

      <div className="kc-map-stage-wrap">
        <div
          ref={stageRef}
          className={`kc-map-stage ${panning ? "kc-map-stage--panning" : ""} ${linkDrag ? "kc-map-stage--linking" : ""}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerLeave={onStagePointerUp}
          onWheel={onWheel}
        >
          <div
            className="kc-map-world kc-map-world--sharp"
            style={{
              width: worldW,
              height: worldH,
              transform: `translate3d(${Math.round(view.tx)}px, ${Math.round(view.ty)}px, 0) scale(${view.scale})`,
            }}
          >
            <svg className="kc-map-svg" width={worldW} height={worldH}>
              {edges.map((e) => (
                <path
                  key={e.id}
                  className={`kc-map-edge ${e.kind === "link" ? "kc-map-edge--manual" : ""}`}
                  d={e.d}
                />
              ))}
              {linkPreview ? <path className="kc-map-edge kc-map-edge--preview" d={linkPreview} /> : null}
            </svg>

            {nodes.map((node) => {
              const pos = positions[node.id] ?? { x: 0, y: 0 };
              const isSelected = selectedId === node.id;
              const isDragging = dragId === node.id;
              const team = node.employees.slice(0, 5);
              const extra = node.employees.length - team.length;
              const sz = getNodeSize(nodeKind(node));
              const hit = highlightIds.has(node.id);
              const cardClass = [
                "kc-map-node",
                node.isRoot ? "kc-map-node--root" : "",
                node.isBranchLeader ? "kc-map-node--branch" : "",
                node.isLocation ? "kc-map-node--location" : "",
                isSelected ? "kc-map-node--selected" : "",
                isDragging ? "kc-map-node--dragging" : "",
                hit ? "kc-map-node--search-hit" : "",
                !canEdit || !mapEditMode ? "kc-map-node--readonly" : "",
              ]
                .filter(Boolean)
                .join(" ");

              if (node.isLocation) {
                const city = node.locationCity || node.title;
                const coat = coatUrlForCity(city);
                return (
                  <div
                    key={node.id}
                    className={cardClass}
                    style={{ left: pos.x, top: pos.y, width: LOCATION_NODE_W, height: LOCATION_NODE_H }}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onPointerMove={(e) => onNodePointerMove(e, node.id)}
                    onPointerUp={(e) => void onNodePointerUp(e, node.id)}
                  >
                    {canEdit && mapEditMode ? (
                      <div className={`kc-map-ports ${isSelected ? "kc-map-ports--visible" : ""}`}>
                        {PORT_SIDES.map((side) => (
                          <button
                            key={side}
                            type="button"
                            className={`kc-map-port kc-map-port--${side}`}
                            aria-label={`Связь: ${side}`}
                            onPointerDown={(e) => onPortPointerDown(e, node.id, side)}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className="kc-map-location">
                      {coat ? <img className="kc-map-location__coat" src={coat} alt="" aria-hidden /> : null}
                      <span className="kc-map-location__label">{city}</span>
                    </div>
                  </div>
                );
              }

              if (node.isRoot) {
                const head = node.manager;
                return (
                  <div
                    key={node.id}
                    className={cardClass}
                    style={{ left: pos.x, top: pos.y, width: ROOT_NODE_W, height: ROOT_NODE_H }}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onPointerMove={(e) => onNodePointerMove(e, node.id)}
                    onPointerUp={(e) => void onNodePointerUp(e, node.id)}
                  >
                    {canEdit && mapEditMode ? (
                      <div className={`kc-map-ports ${isSelected ? "kc-map-ports--visible" : ""}`}>
                        {PORT_SIDES.map((side) => (
                          <button
                            key={side}
                            type="button"
                            className={`kc-map-port kc-map-port--${side}`}
                            aria-label={`Связь: ${side}`}
                            onPointerDown={(e) => onPortPointerDown(e, node.id, side)}
                          />
                        ))}
                      </div>
                    ) : null}
                    {head ? (
                      <div className="kc-map-leader-card">
                        {(node.branchLeaderTitle || head.position) ? (
                          <p className="kc-map-leader-head__role kc-map-leader-head__role--root">
                            {node.branchLeaderTitle || head.position}
                          </p>
                        ) : (
                          <p className="kc-map-leader-head__role kc-map-leader-head__role--root">
                            Директор по обслуживанию клиентов
                          </p>
                        )}
                        <Av url={head.photoUrl} name={head.fullName} className="kc-map-av kc-map-av--root" />
                        <p className="kc-map-leader-card__name">{head.fullName}</p>
                      </div>
                    ) : (
                      <p className="kc-map-node__title">{node.title}</p>
                    )}
                  </div>
                );
              }

              if (node.isBranchLeader) {
                const head = node.manager;
                return (
                  <div
                    key={node.id}
                    className={cardClass}
                    style={{ left: pos.x, top: pos.y, width: BRANCH_NODE_W, height: BRANCH_NODE_H }}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onPointerMove={(e) => onNodePointerMove(e, node.id)}
                    onPointerUp={(e) => void onNodePointerUp(e, node.id)}
                  >
                    {canEdit && mapEditMode ? (
                      <div className={`kc-map-ports ${isSelected ? "kc-map-ports--visible" : ""}`}>
                        {PORT_SIDES.map((side) => (
                          <button
                            key={side}
                            type="button"
                            className={`kc-map-port kc-map-port--${side}`}
                            aria-label={`Связь: ${side}`}
                            onPointerDown={(e) => onPortPointerDown(e, node.id, side)}
                          />
                        ))}
                      </div>
                    ) : null}
                    {head ? (
                      <div className="kc-map-leader-card">
                        {node.branchLeaderTitle || head.position ? (
                          <p className="kc-map-leader-head__role kc-map-leader-head__role--branch">
                            {node.branchLeaderTitle || head.position}
                          </p>
                        ) : null}
                        <div className="kc-map-leader-card__avatar-wrap">
                          <Av url={head.photoUrl} name={head.fullName} className="kc-map-av kc-map-av--branch" />
                        </div>
                        <p className="kc-map-leader-card__name">{head.fullName}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-white/35 mt-1">Назначьте руководителя в настройках</p>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={node.id}
                  className={cardClass}
                  style={{ left: pos.x, top: pos.y, width: sz.w, minHeight: sz.h }}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onPointerMove={(e) => onNodePointerMove(e, node.id)}
                  onPointerUp={(e) => void onNodePointerUp(e, node.id)}
                >
                  {canEdit && mapEditMode ? (
                    <div className={`kc-map-ports ${isSelected ? "kc-map-ports--visible" : ""}`}>
                      {PORT_SIDES.map((side) => (
                        <button
                          key={side}
                          type="button"
                          className={`kc-map-port kc-map-port--${side}`}
                          aria-label={`Связь: ${side}`}
                          onPointerDown={(e) => onPortPointerDown(e, node.id, side)}
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="kc-map-node__title">{node.title}</p>
                  <p className="kc-map-node__meta">
                    {node.employees.length + (node.manager ? 1 : 0)} чел.
                  </p>
                  {node.manager ? (
                    <>
                      <div className="kc-map-node__manager">
                        <p className="kc-map-node__label">Руководитель</p>
                        <div className="kc-map-node__person">
                          <Av url={node.manager.photoUrl} name={node.manager.fullName} />
                          <span>{node.manager.fullName}</span>
                        </div>
                      </div>
                      <div className="kc-map-node__team-block">
                        <p className="kc-map-node__label">Сотрудники</p>
                        <div className="kc-map-team">
                          {team.map((e) => (
                            <Av key={e.id} url={e.photoUrl} name={e.fullName} />
                          ))}
                          {extra > 0 ? <span className="kc-map-team__more">+{extra}</span> : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="kc-map-node__team-block kc-map-node__team-block--solo">
                      <div className="kc-map-team">
                        {team.map((e) => (
                          <Av key={e.id} url={e.photoUrl} name={e.fullName} />
                        ))}
                        {extra > 0 ? <span className="kc-map-team__more">+{extra}</span> : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {canEdit && mapEditMode && selected ? (
          <aside
            className="kc-map-drawer scrollbar-pari"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white">
              {selected.isLocation ? selected.locationCity || selected.title : selected.title}
            </h2>
            {selected.isLocation ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-white/45">
                  Перетащите локацию на карту и сделайте её родителем для отделов этого города — так проще
                  показать географию структуры.
                </p>
                <label>
                  Город
                  <KcSelectInput
                    value={selected.locationCity || selected.title}
                    onChange={(v) => {
                      void updateKcStructureNode(selected.id, { locationCity: v }).then(props.onChanged);
                    }}
                    options={KC_STRUCTURE_LOCATION_CITIES.map((c) => ({ value: c, label: c }))}
                  />
                </label>
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/15 py-2 text-xs text-red-200"
                  onClick={() => {
                    if (!window.confirm(`Удалить локацию «${selected.locationCity || selected.title}»?`)) return;
                    void deleteKcStructureNode(selected.id).then(() => {
                      setSelectedId(null);
                      props.onChanged();
                    });
                  }}
                >
                  Удалить локацию
                </button>
              </>
            ) : (
              <>
            <label>
              Название
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => {
                  if (editTitle.trim()) {
                    void updateKcStructureNode(selected.id, { title: editTitle.trim() }).then(props.onChanged);
                  }
                }}
              />
            </label>
            {!selected.isRoot ? (
              <>
                <label>
                  Привязка к полю «Отдел»
                  <input
                    defaultValue={selected.matchDepartment}
                    onBlur={(e) => {
                      void updateKcStructureNode(selected.id, { matchDepartment: e.target.value }).then(
                        props.onChanged,
                      );
                    }}
                  />
                </label>
                <label>
                  Привязка к полю «Подраздел»
                  <input
                    defaultValue={selected.matchSubdivision}
                    onBlur={(e) => {
                      void updateKcStructureNode(selected.id, { matchSubdivision: e.target.value }).then(
                        props.onChanged,
                      );
                    }}
                  />
                </label>
              </>
            ) : null}
            {selected.isRoot ? (
              <p className="mt-3 text-xs text-white/50 leading-relaxed">
                Корневая карточка. Руководитель подставляется из сотрудников с должностью «Директор по
                обслуживанию клиентов». Подразделения и сотрудники структуры отображаются в сводке на карточке.
              </p>
            ) : (
              <>
                <label className="kc-map-drawer__check">
                  <input
                    type="checkbox"
                    checked={selected.isBranchLeader}
                    onChange={(e) => {
                      void updateKcStructureNode(selected.id, {
                        isBranchLeader: e.target.checked,
                      }).then(props.onChanged);
                    }}
                  />
                  Руководитель ветки
                </label>
                {selected.isBranchLeader ? (
                  <label>
                    Должность на карточке
                    <input
                      value={branchTitle}
                      onChange={(e) => setBranchTitle(e.target.value)}
                      onBlur={() => {
                        void updateKcStructureNode(selected.id, {
                          branchLeaderTitle: branchTitle.trim(),
                        }).then(props.onChanged);
                      }}
                      placeholder="Напр. Руководитель службы поддержки"
                    />
                  </label>
                ) : null}
                <label>
                  Руководитель
                  <select
                    value={selected.managerEmployeeId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      void updateKcStructureNode(selected.id, {
                        managerEmployeeId: v ? Number(v) : null,
                        unsetManager: !v,
                      }).then(props.onChanged);
                    }}
                  >
                    <option value="">Не назначен</option>
                    {[...(selected.manager ? [selected.manager] : []), ...selected.employees].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                    {props.data.allEmployees
                      .filter(
                        (e) =>
                          !selected.employees.some((x) => x.id === e.id) &&
                          selected.manager?.id !== e.id,
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.fullName}
                        </option>
                      ))}
                  </select>
                </label>
                {!selected.isBranchLeader ? (
                <label>
                  Добавить сотрудника в отдел
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!v) return;
                      void updateKcStructureMembers(selected.id, { addEmployeeIds: [v] }).then(
                        props.onChanged,
                      );
                      e.target.value = "";
                    }}
                  >
                    <option value="">Выберите…</option>
                    {props.data.allEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/15 py-2 text-xs text-red-200"
                  onClick={() => {
                    if (!window.confirm(`Удалить «${selected.title}»?`)) return;
                    void deleteKcStructureNode(selected.id).then(() => {
                      setSelectedId(null);
                      props.onChanged();
                    });
                  }}
                >
                  Удалить отдел
                </button>
              </>
            )}
              </>
            )}
          </aside>
        ) : null}

        <p className="kc-map-hint">
          {mapEditMode && canEdit
            ? "Режим редактирования: перетаскивание и связи. «+ Локация» — метка города для группировки отделов."
            : "Клик по группе — состав. Поиск подсвечивает карточку отдела. Колёсико — масштаб."}
        </p>

        {membersModalNode ? (
          <KcStructureMembersModal
            node={membersModalNode}
            onClose={() => setMembersModalNode(null)}
            onMemberClick={(employeeId) => {
              const rec = props.kcEmployees.find((e) => e.id === employeeId);
              if (rec) setEmployeeView(rec);
            }}
          />
        ) : null}

        <KcEmployeeModal
          open={employeeView != null}
          employee={employeeView}
          fieldLabels={props.fieldLabels}
          canEdit={props.kcCanEdit}
          departmentHints={props.departmentHints}
          subdivisionHints={props.subdivisionHints}
          overlayZClass="kc-employee-modal__root--stacked"
          onClose={() => setEmployeeView(null)}
          onSaved={(employee) => {
            setEmployeeView(employee);
            props.onChanged();
          }}
        />
      </div>
    </div>
  );
}
