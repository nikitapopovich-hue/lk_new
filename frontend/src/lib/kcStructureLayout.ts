import type { KcStructureFlatNode } from "./kcStructure";

export const NODE_W = 272;
export const NODE_H = 148;
export const ROOT_NODE_W = 272;
export const ROOT_NODE_H = 228;
export const BRANCH_NODE_W = 272;
export const BRANCH_NODE_H = 228;

export const LOCATION_NODE_W = 228;
export const LOCATION_NODE_H = 52;

export type NodeSizeKind = { isRoot?: boolean; isBranchLeader?: boolean; isLocation?: boolean };

export function getNodeSize(kind?: NodeSizeKind): { w: number; h: number } {
  if (kind?.isRoot) return { w: ROOT_NODE_W, h: ROOT_NODE_H };
  if (kind?.isBranchLeader) return { w: BRANCH_NODE_W, h: BRANCH_NODE_H };
  if (kind?.isLocation) return { w: LOCATION_NODE_W, h: LOCATION_NODE_H };
  return { w: NODE_W, h: NODE_H };
}
const GAP_X = 48;
const GAP_Y = 72;

export type AnchorSide = "top" | "bottom" | "left" | "right";

export function needsAutoLayout(nodes: KcStructureFlatNode[]): boolean {
  if (nodes.length === 0) return false;
  return nodes.every((n) => Math.abs(n.x) < 1 && Math.abs(n.y) < 1);
}

export function autoLayout(nodes: KcStructureFlatNode[]): Record<number, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<number, KcStructureFlatNode[]>();
  const roots: KcStructureFlatNode[] = [];
  const rootCard = nodes.find((n) => n.isRoot);

  for (const n of nodes) {
    if (n.isRoot) continue;
    if (n.parentId != null && byId.has(n.parentId)) {
      const list = children.get(n.parentId) ?? [];
      list.push(n);
      children.set(n.parentId, list);
    } else {
      roots.push(n);
    }
  }

  const positions: Record<number, { x: number; y: number }> = {};
  let leafX = 0;
  const depthOffset = rootCard ? 1 : 0;

  function layoutSubtree(node: KcStructureFlatNode, depth: number): { minX: number; maxX: number } {
    const kids = (children.get(node.id) ?? []).sort((a, b) => a.title.localeCompare(b.title, "ru"));
    if (kids.length === 0) {
      const x = leafX;
      leafX += NODE_W + GAP_X;
      positions[node.id] = { x, y: depth * (NODE_H + GAP_Y) };
      return { minX: x, maxX: x + NODE_W };
    }
    const childRanges = kids.map((ch) => layoutSubtree(ch, depth + 1));
    const minX = childRanges[0]!.minX;
    const maxX = childRanges[childRanges.length - 1]!.maxX;
    const x = (minX + maxX - NODE_W) / 2;
    positions[node.id] = { x, y: depth * (NODE_H + GAP_Y) };
    return { minX, maxX };
  }

  roots.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  for (const r of roots) {
    layoutSubtree(r, depthOffset);
    leafX += GAP_X;
  }

  if (rootCard) {
    const treeMinX = Object.values(positions).length
      ? Math.min(...Object.values(positions).map((p) => p.x))
      : 0;
    const treeMaxX = Object.values(positions).length
      ? Math.max(...Object.values(positions).map((p) => p.x + NODE_W))
      : NODE_W;
    const cx = (treeMinX + treeMaxX - ROOT_NODE_W) / 2;
    positions[rootCard.id] = { x: cx, y: 0 };
  }

  return positions;
}

export function getBounds(
  nodes: KcStructureFlatNode[],
  positions: Record<number, { x: number; y: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = NODE_W;
  let maxY = NODE_H;
  for (const n of nodes) {
    const p = positions[n.id] ?? { x: n.x, y: n.y };
    const { w, h } = getNodeSize(n);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + w);
    maxY = Math.max(maxY, p.y + h);
  }
  return { minX, minY, maxX, maxY };
}

export function fitViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  padding = 48,
): { scale: number; tx: number; ty: number } {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0 || width <= 0 || height <= 0) {
    return { scale: 1, tx: padding, ty: padding };
  }
  const scale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh, 1);
  const tx = (width - bw * scale) / 2 - bounds.minX * scale;
  const ty = (height - bh * scale) / 2 - bounds.minY * scale;
  return {
    scale: Math.round(scale * 100) / 100,
    tx: Math.round(tx),
    ty: Math.round(ty),
  };
}

export function nodeAnchor(
  pos: { x: number; y: number },
  side: AnchorSide,
  kind?: NodeSizeKind,
): { x: number; y: number } {
  const { w, h } = getNodeSize(kind);
  switch (side) {
    case "top":
      return { x: pos.x + w / 2, y: pos.y };
    case "bottom":
      return { x: pos.x + w / 2, y: pos.y + h };
    case "left":
      return { x: pos.x, y: pos.y + h / 2 };
    case "right":
      return { x: pos.x + w, y: pos.y + h / 2 };
  }
}

export function pickAnchorSides(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromKind?: NodeSizeKind,
  toKind?: NodeSizeKind,
): { fromSide: AnchorSide; toSide: AnchorSide } {
  const fs = getNodeSize(fromKind);
  const ts = getNodeSize(toKind);
  const fcx = from.x + fs.w / 2;
  const fcy = from.y + fs.h / 2;
  const tcx = to.x + ts.w / 2;
  const tcy = to.y + ts.h / 2;
  const dx = tcx - fcx;
  const dy = tcy - fcy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }
  return dy >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

function controlOffset(side: AnchorSide, amount: number): { dx: number; dy: number } {
  switch (side) {
    case "top":
      return { dx: 0, dy: -amount };
    case "bottom":
      return { dx: 0, dy: amount };
    case "left":
      return { dx: -amount, dy: 0 };
    case "right":
      return { dx: amount, dy: 0 };
  }
}

export function edgeCurvePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fromSide: AnchorSide,
  toSide: AnchorSide,
): string {
  const bend = Math.max(40, Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
  const o1 = controlOffset(fromSide, bend);
  const o2 = controlOffset(toSide, bend);
  const c1x = a.x + o1.dx;
  const c1y = a.y + o1.dy;
  const c2x = b.x + o2.dx;
  const c2y = b.y + o2.dy;
  return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
}
