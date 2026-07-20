import { authHeaders } from "./auth";
import { getApiBase } from "./apiBase";

export type Team = {
  id: number | string;
  name: string;
  memberUserIds: string[];
  memberKcEmployeeIds?: number[];
  ownerEmail?: string;
};

export async function listTeams(): Promise<Team[]> {
  const base = getApiBase();
  const r = await fetch(`${base}/teams`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`API ${r.status}`);
  const j = (await r.json()) as { items: Team[] };
  return j.items ?? [];
}

export async function createTeam(input: {
  name: string;
  memberUserIds?: string[];
  memberKcEmployeeIds?: number[];
}) {
  const base = getApiBase();
  const r = await fetch(`${base}/teams`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as Team;
}

export async function updateTeam(
  teamId: number | string,
  input: { name?: string; memberUserIds?: string[]; memberKcEmployeeIds?: number[] },
) {
  const base = getApiBase();
  const r = await fetch(`${base}/teams/${teamId}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as Team;
}

export async function deleteTeam(teamId: number | string) {
  const base = getApiBase();
  const r = await fetch(`${base}/teams/${teamId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
}

export async function bulkDeleteTeams(ids: number[]) {
  const base = getApiBase();
  const r = await fetch(`${base}/teams/bulk-delete`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as { deleted?: number };
}
