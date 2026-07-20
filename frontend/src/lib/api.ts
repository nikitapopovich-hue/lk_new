export type DashboardKpis = {
  calls_total: number | null;
  calls_connected: number | null;
  calls_missed: number | null;
  sl_percent: number | null;
  sl_threshold_seconds: number | null;
  lcr_percent: number | null;
  aht_avg_seconds: number | null;
  csi_score: number | null;
  next_reply_avg_seconds: number | null;
  csat_percent: number | null;
  utz_percent: number | null;
  occ_percent: number | null;
};

export type DashboardIdentity = {
  email: string;
  mapped: boolean;
  backofficeUserId?: string;
  usedeskUserId?: string;
  uisEmployeeId?: string;
};

export type DashboardSummaryResponse = {
  period: { from: string; to: string; tz: string };
  identity?: DashboardIdentity;
  kpis: DashboardKpis;
  tickets?: {
    tickets_total: number;
    tickets_unanswered: number;
    tickets_answered: number;
    tickets_in_progress: number;
    tickets_closed: number;
    tickets_editing: number;
  } | null;
  integrations?: unknown;
};

import { authHeaders } from "./auth";
import { getApiBase } from "./apiBase";
import { getEmail } from "./identity";
import { fetchWithTimeout } from "./http";

export async function fetchDashboardSummary(input: {
  from: string;
  to: string;
  tz: string;
  email: string;
  scope?: "self" | "team" | "all";
  teamMemberIds?: string[];
  backofficeInternalThemeIds?: string[];
}): Promise<DashboardSummaryResponse> {
  const email = input.email?.trim() || getEmail().trim();
  if (!email) {
    throw new Error("Требуется авторизация.");
  }
  const base = getApiBase();
  const resp = await fetchWithTimeout(
    `${base}/dashboard/summary`,
    {
      method: "POST",
      headers: {
        ...authHeaders({ "Content-Type": "application/json", "X-User-Email": email }),
      },
      body: JSON.stringify({
        period: { from: input.from, to: input.to, tz: input.tz },
        scope: input.scope ?? "self",
        filters: {
          ticketStates: [1, 2, 3, 4, 5],
          teamMemberIds: input.teamMemberIds ?? undefined,
          backofficeInternalThemeIds: input.backofficeInternalThemeIds ?? undefined,
        },
      }),
    },
    120_000,
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as DashboardSummaryResponse;
}

export type TeamOperatorTopKpi = {
  label: string;
  value: number;
  changePercent: number;
};

export type TeamOperatorMetric = {
  key: string;
  label: string;
  color: string;
  kind: "duration" | "percent" | "count";
  higherIsBetter: boolean;
  monthly: (number | null)[];
};

export type MonitoringMonthEntry = {
  year: number;
  month: number;
  points: number | null;
  grade: string | null;
  empty: boolean;
  membersWithData?: number;
  membersTotal?: number;
};

export type TeamOperatorOverviewResponse = {
  memberCount: number;
  topKpis: TeamOperatorTopKpi[];
  kpdPercent: number;
  monitoring: {
    points?: number;
    grade?: string;
    empty?: boolean;
    months: MonitoringMonthEntry[];
    membersWithData?: number;
    membersTotal?: number;
  };
  metrics: TeamOperatorMetric[];
  period?: { from: string; to: string; tz: string };
  integrations?: {
    monitoring?: {
      configured?: boolean;
      source?: string;
      empty?: boolean;
      error?: string;
      membersWithData?: number;
      membersTotal?: number;
    };
  };
};

export async function fetchTeamOperatorOverview(input: {
  from: string;
  to: string;
  tz: string;
  teamMemberIds?: string[];
}): Promise<TeamOperatorOverviewResponse> {
  const email = getEmail().trim();
  if (!email) {
    throw new Error("Требуется авторизация.");
  }
  const base = getApiBase();
  const resp = await fetchWithTimeout(
    `${base}/dashboard/team-overview`,
    {
      method: "POST",
      headers: {
        ...authHeaders({ "Content-Type": "application/json", "X-User-Email": email }),
      },
      body: JSON.stringify({
        period: { from: input.from, to: input.to, tz: input.tz },
        teamMemberIds: input.teamMemberIds ?? [],
      }),
    },
    90_000,
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as TeamOperatorOverviewResponse;
}

export type TeamMonitoringResponse = {
  configured: boolean;
  monitoring: { months: MonitoringMonthEntry[] } | null;
  integrations?: TeamOperatorOverviewResponse["integrations"];
};

export async function fetchTeamMonitoring(input: {
  teamMemberIds?: string[];
}): Promise<TeamMonitoringResponse> {
  const email = getEmail().trim();
  if (!email) {
    throw new Error("Требуется авторизация.");
  }
  const base = getApiBase();
  const resp = await fetchWithTimeout(
    `${base}/dashboard/team-monitoring`,
    {
      method: "POST",
      headers: {
        ...authHeaders({ "Content-Type": "application/json", "X-User-Email": email }),
      },
      body: JSON.stringify({
        teamMemberIds: input.teamMemberIds ?? [],
      }),
    },
    35_000,
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as TeamMonitoringResponse;
}

export type MyMonitoringResponse = {
  configured: boolean;
  monitoring: {
    months: MonitoringMonthEntry[];
  } | null;
  integrations?: { monitoring?: { configured?: boolean; source?: string; empty?: boolean; error?: string } };
};

export async function fetchMyMonitoring(input: {
  from: string;
  to: string;
  tz: string;
}): Promise<MyMonitoringResponse> {
  const email = getEmail().trim();
  if (!email) {
    throw new Error("Требуется авторизация.");
  }
  const base = getApiBase();
  const resp = await fetchWithTimeout(
    `${base}/dashboard/my-monitoring`,
    {
      method: "POST",
      headers: {
        ...authHeaders({ "Content-Type": "application/json", "X-User-Email": email }),
      },
      body: JSON.stringify({
        period: { from: input.from, to: input.to, tz: input.tz },
      }),
    },
    60_000,
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as MyMonitoringResponse;
}

