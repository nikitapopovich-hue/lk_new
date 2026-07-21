import { authHeaders, getApiBase } from "./auth";

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
  period: { start: string; end: string; chartStart: string; chartEnd: string };
  operators: OperatorRow[];
  atRisk: OperatorRow[];
  projects: ProjectSection[];
  tm: TmSection[];
  charts: ChartSection[];
  formulasMarkdown: string;
};

export async function fetchTriggersRaConfig(): Promise<{
  configured: boolean;
  defaultPeriodDays: number;
  periodOptions: number[];
}> {
  const resp = await fetch(`${getApiBase()}/triggers-ra/config`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

export async function fetchTriggersRaDashboard(periodDays: number): Promise<TriggersRaDashboard> {
  const resp = await fetch(
    `${getApiBase()}/triggers-ra/dashboard?period_days=${encodeURIComponent(String(periodDays))}`,
    { headers: authHeaders() },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text.slice(0, 400) || `API ${resp.status}`);
  }
  return resp.json();
}

export async function downloadTriggersRaXlsx(data: TriggersRaDashboard): Promise<Blob> {
  const resp = await fetch(`${getApiBase()}/triggers-ra/export.xlsx`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text.slice(0, 400) || `API ${resp.status}`);
  }
  return resp.blob();
}
