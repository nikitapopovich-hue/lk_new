import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type ViolationEntry = {
  id: number;
  date: string;
  employeeName: string;
  recordedBy: string;
  groupName: string;
  violationType: string;
  penaltyKind: "warning" | "fine";
  penaltyLabel: string;
  hasExplanation: boolean;
  fineAmount: number;
  comment: string;
};

export type ViolationMeta = {
  violationTypes: { name: string; fineAmount: number }[];
  employeeNames: string[];
  recordedByHints: string[];
  groupHints: string[];
};

export type ViolationStats = {
  month: string;
  employees: { name: string; count: number }[];
  violationTypes: { name: string; count: number }[];
};

export type ViolationDynamics = {
  view: "employees" | "types";
  months: string[];
  series: {
    key: string;
    label: string;
    monthly: number[];
    total: number;
    deltaPercent: number;
  }[];
};

export type ViolationEntryInput = {
  date: string;
  employeeName: string;
  recordedBy: string;
  groupName: string;
  violationType: string;
  penaltyKind: "warning" | "fine";
  hasExplanation: boolean;
  fineAmount: number;
  comment: string;
};

export function todayRuDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return key;
  return `${months[mi]} ${y.slice(2)}`;
}

export async function fetchViolationMeta(): Promise<ViolationMeta> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/meta`, {
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`Журнал: meta ${resp.status}`);
  return (await resp.json()) as ViolationMeta;
}

export async function fetchViolationEntries(params: {
  month?: string;
  employee?: string;
  violationType?: string;
}): Promise<ViolationEntry[]> {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.employee) q.set("employee", params.employee);
  if (params.violationType) q.set("violationType", params.violationType);
  const qs = q.toString();
  const resp = await fetchWithTimeout(
    `${getApiBase()}/violation-journal/entries${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() },
  );
  if (!resp.ok) throw new Error(`Журнал: список ${resp.status}`);
  const data = (await resp.json()) as { entries: ViolationEntry[] };
  return data.entries;
}

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text.slice(0, 200) || `Ошибка ${resp.status}`;
}

export async function createViolationEntry(body: ViolationEntryInput): Promise<ViolationEntry> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/entries`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await parseError(resp));
  return (await resp.json()) as ViolationEntry;
}

export async function updateViolationEntry(id: number, body: ViolationEntryInput): Promise<ViolationEntry> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/entries/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await parseError(resp));
  return (await resp.json()) as ViolationEntry;
}

export async function deleteViolationEntry(id: number): Promise<void> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/entries/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(await parseError(resp));
}

export async function bulkDeleteViolationEntries(ids: number[]): Promise<number> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/entries/bulk-delete`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!resp.ok) throw new Error(await parseError(resp));
  const data = (await resp.json()) as { deleted: number };
  return data.deleted;
}

export async function createViolationType(name: string, fineAmount: number): Promise<{ name: string; fineAmount: number }> {
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/violation-types`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, fineAmount }),
  });
  if (!resp.ok) throw new Error(await parseError(resp));
  return (await resp.json()) as { name: string; fineAmount: number };
}

export async function fetchViolationStats(month: string): Promise<ViolationStats> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/stats${q}`, {
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`Журнал: статистика ${resp.status}`);
  return (await resp.json()) as ViolationStats;
}

export async function fetchViolationDynamics(
  view: "employees" | "types",
  top = 50,
): Promise<ViolationDynamics> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/violation-journal/dynamics?view=${view}&top=${top}`,
    { headers: authHeaders() },
  );
  if (!resp.ok) throw new Error(`Журнал: динамика ${resp.status}`);
  return (await resp.json()) as ViolationDynamics;
}

export async function exportViolationJournalXlsx(month: string): Promise<Blob> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/export${q}`, {
    headers: authHeaders(),
  }, 60_000);
  if (!resp.ok) throw new Error(await parseError(resp));
  return resp.blob();
}

export async function importViolationJournalXlsx(file: File): Promise<{ imported: number; skipped: number; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetchWithTimeout(`${getApiBase()}/violation-journal/import`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  }, 120_000);
  if (!resp.ok) throw new Error(await parseError(resp));
  return (await resp.json()) as { imported: number; skipped: number; message: string };
}
