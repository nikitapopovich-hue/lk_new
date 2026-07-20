import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";
import { currentMonthKey, monthKeyLabel } from "./violationJournal";

export type FinanceEntryType = "overtime" | "bonus" | "recalculation";

export type FinanceEntry = {
  id: number;
  entryType: FinanceEntryType;
  date: string;
  employeeName: string;
  recordedBy: string;
  hours: number;
  amount: number;
  reason: string;
};

export type FinanceMeta = {
  employeeNames: string[];
  recordedByHints: string[];
};

export type FinanceStats = {
  month: string;
  entryType: FinanceEntryType;
  employees: { name: string; hours?: number; count?: number; amount: number }[];
};

export type FinanceDynamics = {
  entryType: FinanceEntryType;
  months: string[];
  series: {
    key: string;
    label: string;
    monthly: number[];
    total: number;
    deltaPercent: number;
  }[];
};

export const OVERTIME_HOUR_RATE = 400;

export type FinanceEntryInput = {
  date: string;
  employeeName: string;
  recordedBy?: string;
  hours?: number;
  amount: number;
  reason?: string;
};

export { currentMonthKey, monthKeyLabel };

export function todayRuDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function base(type: FinanceEntryType) {
  return `${getApiBase()}/finance-journal/${type}`;
}

export async function fetchFinanceMeta(type: FinanceEntryType): Promise<FinanceMeta> {
  const resp = await fetchWithTimeout(`${base(type)}/meta`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Журнал: meta ${resp.status}`);
  return (await resp.json()) as FinanceMeta;
}

export async function fetchFinanceEntries(type: FinanceEntryType, params: { month?: string; employee?: string }): Promise<FinanceEntry[]> {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.employee) q.set("employee", params.employee);
  const qs = q.toString();
  const resp = await fetchWithTimeout(`${base(type)}/entries${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Журнал: список ${resp.status}`);
  const data = (await resp.json()) as { entries: FinanceEntry[] };
  return data.entries;
}

export async function createFinanceEntry(type: FinanceEntryType, body: FinanceEntryInput): Promise<FinanceEntry> {
  const resp = await fetchWithTimeout(`${base(type)}/entries`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text.slice(0, 200) || `Ошибка сохранения ${resp.status}`);
  }
  return (await resp.json()) as FinanceEntry;
}

export async function updateFinanceEntry(type: FinanceEntryType, id: number, body: FinanceEntryInput): Promise<FinanceEntry> {
  const resp = await fetchWithTimeout(`${base(type)}/entries/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Ошибка обновления ${resp.status}`);
  return (await resp.json()) as FinanceEntry;
}

export async function deleteFinanceEntry(type: FinanceEntryType, id: number): Promise<void> {
  const resp = await fetchWithTimeout(`${base(type)}/entries/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`Ошибка удаления ${resp.status}`);
}

export async function bulkDeleteFinanceEntries(type: FinanceEntryType, ids: number[]): Promise<void> {
  const resp = await fetchWithTimeout(`${base(type)}/entries/bulk-delete`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
  if (!resp.ok) throw new Error(`Ошибка удаления ${resp.status}`);
}

export async function fetchFinanceStats(type: FinanceEntryType, month: string): Promise<FinanceStats> {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  const resp = await fetchWithTimeout(`${base(type)}/stats${q}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Статистика: ${resp.status}`);
  return (await resp.json()) as FinanceStats;
}

export async function fetchFinanceDynamics(type: FinanceEntryType, top = 50): Promise<FinanceDynamics> {
  const resp = await fetchWithTimeout(`${base(type)}/dynamics?top=${top}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Динамика: ${resp.status}`);
  return (await resp.json()) as FinanceDynamics;
}

export const FINANCE_JOURNAL_LABELS: Record<
  FinanceEntryType,
  { title: string; journalTab: string; statsTitle: string; rankTitle: string; unit: string }
> = {
  overtime: {
    title: "Переработки",
    journalTab: "Переработки",
    statsTitle: "Статистика переработок",
    rankTitle: "Рейтинг по часам",
    unit: "ч.",
  },
  bonus: {
    title: "Премии",
    journalTab: "Премии",
    statsTitle: "Статистика премий",
    rankTitle: "Рейтинг по сумме",
    unit: "₽",
  },
  recalculation: {
    title: "Перерасчёты",
    journalTab: "Перерасчёты",
    statsTitle: "Статистика перерасчётов",
    rankTitle: "Рейтинг по сумме",
    unit: "₽",
  },
};
