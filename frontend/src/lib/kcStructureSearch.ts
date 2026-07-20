import type { KcStructureEmployee, KcStructureFlatNode } from "./kcStructure";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreHaystack(hay: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (hay === token) score += 120;
    else if (hay.startsWith(token)) score += 80;
    else if (hay.split(" ").some((w) => w.startsWith(token))) score += 55;
    else if (hay.includes(token)) score += 30;
  }
  return score;
}

function personHaystack(p: KcStructureEmployee): string {
  return normalize([p.fullName, p.position, p.department, p.subdivision].filter(Boolean).join(" "));
}

function nodeMatchesEmployee(node: KcStructureFlatNode, emp: KcStructureEmployee): boolean {
  const dept = node.matchDepartment.trim();
  const sub = node.matchSubdivision.trim();
  if (dept && emp.department.trim() === dept) {
    if (!sub || emp.subdivision.trim() === sub) return true;
  }
  return false;
}

export function findNodesByEmployeeQuery(
  nodes: KcStructureFlatNode[],
  query: string,
  allEmployees: KcStructureEmployee[] = [],
): number[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  const hits = new Map<number, number>();

  for (const node of nodes) {
    const people: KcStructureEmployee[] = [
      ...(node.manager ? [node.manager] : []),
      ...node.employees,
    ];
    let best = 0;
    for (const p of people) {
      best = Math.max(best, scoreHaystack(personHaystack(p), tokens));
    }
    if (best > 0) hits.set(node.id, Math.max(hits.get(node.id) ?? 0, best));
  }

  for (const emp of allEmployees) {
    const sc = scoreHaystack(personHaystack(emp), tokens);
    if (sc <= 0) continue;
    for (const node of nodes) {
      if (node.isRoot) continue;
      const inCard = node.manager?.id === emp.id || node.employees.some((e) => e.id === emp.id);
      if (inCard || nodeMatchesEmployee(node, emp)) {
        hits.set(node.id, Math.max(hits.get(node.id) ?? 0, sc));
      }
    }
  }

  return [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
