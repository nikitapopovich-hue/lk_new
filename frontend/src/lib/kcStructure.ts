import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type KcStructureEmployee = {
  id: number;
  fullName: string;
  position: string;
  photoUrl: string;
  department: string;
  subdivision: string;
};

export type KcStructureFlatNode = {
  id: number;
  title: string;
  parentId: number | null;
  matchDepartment: string;
  matchSubdivision: string;
  managerEmployeeId: number | null;
  sortOrder: number;
  x: number;
  y: number;
  manualMemberIds: number[];
  isRoot: boolean;
  isBranchLeader: boolean;
  branchLeaderTitle: string;
  isLocation: boolean;
  locationCity: string;
  orgUnitCount: number;
  orgEmployeeCount: number;
  manager: KcStructureEmployee | null;
  employees: KcStructureEmployee[];
};

export type KcStructureEdge = {
  id?: number;
  from: number;
  to: number;
  kind?: "parent" | "link";
};

export type KcStructureResponse = {
  nodes: KcStructureFlatNode[];
  edges: KcStructureEdge[];
  unassigned: KcStructureEmployee[];
  allEmployees: KcStructureEmployee[];
  canEdit: boolean;
};

export async function fetchKcStructure(): Promise<KcStructureResponse> {
  const resp = await fetchWithTimeout(`${getApiBase()}/kc-data/structure`, { headers: authHeaders() }, 20_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Структура КЦ: ${resp.status} ${text.slice(0, 200)}`);
  }
  const raw = (await resp.json()) as KcStructureResponse;
  return {
    ...raw,
    nodes: raw.nodes.map((n) => ({
      ...n,
      isLocation: Boolean(n.isLocation),
      locationCity: n.locationCity ?? "",
    })),
  };
}

export async function syncKcStructure(): Promise<{ synced: number; total: number }> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/sync`,
    { method: "POST", headers: authHeaders() },
    30_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Синхронизация: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as { synced: number; total: number };
}

export async function updateKcStructureNode(
  nodeId: number,
  body: {
    parentId?: number | null;
    title?: string;
    managerEmployeeId?: number | null;
    matchDepartment?: string;
    matchSubdivision?: string;
    x?: number;
    y?: number;
    unsetParent?: boolean;
    unsetManager?: boolean;
    isBranchLeader?: boolean;
    branchLeaderTitle?: string;
    locationCity?: string;
  },
): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/nodes/${nodeId}`,
    {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Обновление: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function updateKcStructureMembers(
  nodeId: number,
  body: { addEmployeeIds?: number[]; removeEmployeeIds?: number[] },
): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/nodes/${nodeId}/members`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Состав: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function createKcStructureNode(body: {
  title?: string;
  parentId?: number | null;
  matchDepartment?: string;
  matchSubdivision?: string;
  x?: number;
  y?: number;
  isLocation?: boolean;
  locationCity?: string;
}): Promise<{ id: number }> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/nodes`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Создание: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as { id: number };
}

export async function createKcStructureLink(fromNodeId: number, toNodeId: number): Promise<{ id: number }> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/links`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ fromNodeId, toNodeId }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Связь: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as { id: number };
}

export async function deleteKcStructureLink(linkId: number): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/links/${linkId}`,
    { method: "DELETE", headers: authHeaders() },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удаление связи: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteKcStructureNode(nodeId: number): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/structure/nodes/${nodeId}`,
    { method: "DELETE", headers: authHeaders() },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удаление: ${resp.status} ${text.slice(0, 200)}`);
  }
}
