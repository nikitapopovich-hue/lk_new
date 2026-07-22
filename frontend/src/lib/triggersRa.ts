import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type TrendCell = { text: string; sentiment: "good" | "bad" | "neutral" | string };

export type OperatorRow = {
  operator: string;
  totalCalls: number;
  isAtRisk: boolean;
  compositeScore: number;
  triggers: string[];
  triggersLabel: string;
  display: {
    nekonstruktivPct: string;
    clientNegPct: string;
    operatorEndPct: string;
    qcPct: string;
    monitoringPct: string;
    llmRisk: string;
    empathy: string;
    engagement: string;
    prematureClosurePct: string;
    score: string;
  };
  trends: {
    nekonstruktiv: TrendCell;
    clientNeg: TrendCell;
    operatorEnd: TrendCell;
    qc: TrendCell;
    monitoring: TrendCell;
    llmRisk: TrendCell;
    empathy: TrendCell;
  };
};

export type ProjectSection = {
  id: string;
  name: string;
  group: string;
  hasClientSentiment: boolean;
  hasEndCall: boolean;
  operators: Array<{
    operator: string;
    totalCalls: number;
    nekonstruktivPct: number;
    clientNegPct: number;
    operatorEndPct: number;
    qcAvgWeight: number | null;
    monitoringPct: number;
    llmBurnoutAvg: number | null;
    llmEmpathyAvg: number | null;
  }>;
};

export type TmSection = {
  id: string;
  name: string;
  statuses: string[];
  operators: Array<{
    operator: string;
    totalCalls: number;
    operatorEndPct: number;
    clientNegPct: number;
    statusPcts: Record<string, number>;
    llmBurnoutAvg: number | null;
    llmEmpathyAvg: number | null;
    llmPrematureClosurePct: number | null;
  }>;
};

export type ChartSection = {
  id: string;
  name: string;
  group: string;
  hasClientSentiment: boolean;
  points: Array<{
    date: string;
    nekonstruktivPct?: number;
    clientNegPct?: number;
  }>;
};

export type TriggersRaDashboard = {
  periodDays: number;
  minCalls: number;
  dateFrom?: string;
  dateTo?: string;
  fromCache?: boolean;
  period: { start: string; end: string; chartStart: string; chartEnd: string };
  operators: OperatorRow[];
  atRisk: OperatorRow[];
  projects: ProjectSection[];
  tm: TmSection[];
  charts: ChartSection[];
  formulasMarkdown: string;
};

export type TriggersRaPeriodQuery =
  | { mode: "preset"; periodDays: number; force?: boolean }
  | { mode: "custom"; dateFrom: string; dateTo: string; force?: boolean };

const DASHBOARD_TIMEOUT_MS = 180_000;

export async function fetchTriggersRaConfig(): Promise<{
  configured: boolean;
  defaultPeriodDays: number;
  periodOptions: number[];
  maxCustomDays?: number;
  cacheTtlSeconds?: number;
}> {
  const resp = await fetchWithTimeout(`${getApiBase()}/triggers-ra/config`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

export async function fetchTriggersRaDashboard(query: TriggersRaPeriodQuery): Promise<TriggersRaDashboard> {
  const params = new URLSearchParams();
  if (query.mode === "custom") {
    params.set("date_from", query.dateFrom);
    params.set("date_to", query.dateTo);
  } else {
    params.set("period_days", String(query.periodDays));
  }
  if (query.force) params.set("force", "true");

  const resp = await fetchWithTimeout(
    `${getApiBase()}/triggers-ra/dashboard?${params.toString()}`,
    { headers: authHeaders() },
    DASHBOARD_TIMEOUT_MS,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text.slice(0, 400) || `API ${resp.status}`);
  }
  return resp.json();
}

export async function downloadTriggersRaXlsx(data: TriggersRaDashboard): Promise<Blob> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/triggers-ra/export.xlsx`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
    60_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text.slice(0, 400) || `API ${resp.status}`);
  }
  return resp.blob();
}
