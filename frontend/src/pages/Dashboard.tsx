import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EventsPanel } from "../components/EventsPanel";
import { HoroscopePanel } from "../components/HoroscopePanel";
import { MagicSpotlightShell, MagicSurface } from "../components/MagicBento";
import { OperatorHeaderActions } from "../components/OperatorHeaderActions";
import { OperatorKpdCard } from "../components/operator/OperatorKpdCard";
import { OperatorMetricsCard } from "../components/operator/OperatorMetricsCard";
import { OperatorMonitoringCard } from "../components/operator/OperatorMonitoringCard";
import { OperatorNewsTicker } from "../components/operator/OperatorNewsTicker";
import { operatorSquareTile, operatorSurface } from "../components/operator/operatorTile";
import { OPERATOR_DEMO_TOP_KPIS } from "../components/operator/operatorDemoData";
import {
  type OperatorMetricDemo,
  type OperatorMetricKey,
} from "../components/operator/operatorMetricsDemo";
import { TopKpiTrend } from "../components/operator/TopKpiTrend";
import {
  fetchMe,
  formatPersonDisplayName,
  largeProfilePictureUrl,
  type AuthUser,
} from "../lib/auth";
import {
  fetchMyMonitoring,
  fetchTeamMonitoring,
  fetchTeamOperatorOverview,
  type MonitoringMonthEntry,
  type MyMonitoringResponse,
  type TeamMonitoringResponse,
  type TeamOperatorOverviewResponse,
} from "../lib/api";
import { mskMonthToDatePeriod } from "../lib/period";
import { getRole, type Role } from "../lib/role";
import { listTeams } from "../lib/teams";
import { useShellSidebarCollapsed } from "../lib/shellSidebar";
import { ViolationBrandSelect } from "../components/violations/ViolationBrandSelect";
import "./DashboardOperator.css";

function dashboardPageTitle(role: Role): string {
  if (role === "superadmin") return "Дашборд суперадмина";
  if (role === "supervisor") return "Дашборд руководителя";
  return "Дашборд оператора";
}

export function DashboardPage() {
  const role = getRole();
  const [meUser, setMeUser] = useState<AuthUser | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string; memberUserIds: string[] }[]>([]);
  const [teamId, setTeamId] = useState<string>("");

  const teamOptions = useMemo(
    () => [
      { value: "", label: "Все сотрудники" },
      ...teams.map((t) => ({
        value: String(t.id),
        label: `Команда: ${t.name} (${t.memberUserIds.length})`,
      })),
    ],
    [teams],
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setMeReady(false);
      void fetchMe()
        .then((u) => {
          if (!cancelled) setMeUser(u);
        })
        .catch(() => {
          if (!cancelled) setMeUser(null);
        })
        .finally(() => {
          if (!cancelled) setMeReady(true);
        });
    };
    load();
    window.addEventListener("lk:identityChanged", load as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("lk:identityChanged", load as EventListener);
    };
  }, []);

  useEffect(() => {
    if (role !== "supervisor" && role !== "superadmin") return;
    listTeams()
      .then((t) => setTeams(t as { id: string; name: string; memberUserIds: string[] }[]))
      .catch(() => setTeams([]));
  }, [role]);

  const isTeamDashboard = role === "supervisor" || role === "superadmin";
  const [teamOverview, setTeamOverview] = useState<TeamOperatorOverviewResponse | null>(null);
  const [teamOverviewLoading, setTeamOverviewLoading] = useState(false);
  const [teamOverviewError, setTeamOverviewError] = useState<string | null>(null);
  const [myMonitoring, setMyMonitoring] = useState<MyMonitoringResponse | null>(null);
  const [myMonitoringLoading, setMyMonitoringLoading] = useState(false);
  const [teamMonitoring, setTeamMonitoring] = useState<TeamMonitoringResponse | null>(null);
  const [teamMonitoringLoading, setTeamMonitoringLoading] = useState(false);

  const selectedTeamMemberIds = useMemo(() => {
    if (!teamId) return [] as string[];
    const team = teams.find((t) => String(t.id) === teamId);
    return team?.memberUserIds ?? [];
  }, [teamId, teams]);

  const teamScopeLabel = useMemo(() => {
    if (!isTeamDashboard) return null;
    if (!teamId) return "все сотрудники";
    const team = teams.find((t) => String(t.id) === teamId);
    return team ? `команда «${team.name}»` : "команда";
  }, [isTeamDashboard, teamId, teams]);

  useEffect(() => {
    if (!isTeamDashboard) {
      setTeamOverview(null);
      setTeamOverviewError(null);
      setTeamMonitoring(null);
      return;
    }
    let cancelled = false;
    const period = mskMonthToDatePeriod();
    setTeamOverviewLoading(true);
    setTeamMonitoringLoading(true);
    setTeamOverviewError(null);
    setTeamMonitoring(null);

    void fetchTeamOperatorOverview({
      from: period.from,
      to: period.to,
      tz: period.tz,
      teamMemberIds: selectedTeamMemberIds,
    })
      .then((data) => {
        if (!cancelled) setTeamOverview(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTeamOverview(null);
          setTeamOverviewError(err instanceof Error ? err.message : "Не удалось загрузить показатели");
        }
      })
      .finally(() => {
        if (!cancelled) setTeamOverviewLoading(false);
      });

    void fetchTeamMonitoring({ teamMemberIds: selectedTeamMemberIds })
      .then((data) => {
        if (!cancelled) setTeamMonitoring(data);
      })
      .catch(() => {
        if (!cancelled) setTeamMonitoring(null);
      })
      .finally(() => {
        if (!cancelled) setTeamMonitoringLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTeamDashboard, selectedTeamMemberIds]);

  useEffect(() => {
    if (isTeamDashboard) {
      setMyMonitoring(null);
      return;
    }
    let cancelled = false;
    const period = mskMonthToDatePeriod();
    setMyMonitoringLoading(true);
    void fetchMyMonitoring({ from: period.from, to: period.to, tz: period.tz })
      .then((data) => {
        if (!cancelled) setMyMonitoring(data);
      })
      .catch(() => {
        if (!cancelled) setMyMonitoring(null);
      })
      .finally(() => {
        if (!cancelled) setMyMonitoringLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isTeamDashboard]);

  const pageTitle = dashboardPageTitle(role);

  return (
    <div className="min-w-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{pageTitle}</h1>
        <OperatorHeaderActions me={meUser} meReady={meReady} />
      </header>

      {role === "supervisor" || role === "superadmin" ? (
        <div className="dashboard-team-filter mt-4">
          <ViolationBrandSelect
            className="dashboard-team-filter__select"
            value={teamId}
            options={teamOptions}
            onChange={setTeamId}
          />
        </div>
      ) : null}

      <OperatorDashboardBody
        meUser={meUser}
        meReady={meReady}
        teamOverview={isTeamDashboard ? teamOverview : null}
        teamOverviewLoading={isTeamDashboard && teamOverviewLoading}
        teamOverviewError={isTeamDashboard ? teamOverviewError : null}
        teamScopeLabel={teamScopeLabel}
        myMonitoring={isTeamDashboard ? null : myMonitoring}
        myMonitoringLoading={!isTeamDashboard && myMonitoringLoading}
        teamMonitoring={isTeamDashboard ? teamMonitoring : null}
        teamMonitoringLoading={isTeamDashboard && teamMonitoringLoading}
      />
    </div>
  );
}

function TopKpiCard(props: { label: string; value: string; changePercent?: number }) {
  return (
    <MagicSurface
      enableStars={false}
      className={`magic-bento-card magic-bento-card--kpi flex h-[88px] min-w-0 flex-col justify-center gap-1.5 px-3 py-3 sm:px-4 ${operatorSurface}`}
    >
      <div className="line-clamp-2 text-[11px] font-medium leading-tight text-[#a0aec0] sm:text-xs">{props.label}</div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="truncate text-base font-bold leading-none text-white sm:text-lg">{props.value}</span>
        {typeof props.changePercent === "number" ? <TopKpiTrend changePercent={props.changePercent} /> : null}
      </div>
    </MagicSurface>
  );
}

function WelcomeOperatorCard(props: { meUser: AuthUser | null; meReady: boolean }) {
  const sidebarCollapsed = useShellSidebarCollapsed();
  const name = props.meReady && props.meUser ? formatPersonDisplayName(props.meUser) : null;
  const picture = largeProfilePictureUrl(props.meUser?.pictureUrl, 1024);
  const initials = (props.meUser?.givenName?.[0] ?? props.meUser?.displayName?.[0] ?? "?").toUpperCase();

  return (
    <MagicSurface
      className={`operator-welcome-card relative h-full w-full overflow-hidden ${operatorSurface} ${operatorSquareTile}`}
      enableStars={!sidebarCollapsed}
      enableBorderGlow
      clickEffect={false}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-pari-500/15 blur-3xl" aria-hidden />
      {props.meReady && picture ? (
        <div className="operator-welcome-card__photo-wrap" aria-hidden>
          <img src={picture} alt="" className="operator-welcome-card__photo" referrerPolicy="no-referrer" />
        </div>
      ) : props.meReady ? (
        <div className="operator-welcome-card__photo-wrap operator-welcome-card__photo-wrap--initials" aria-hidden>
          <div className="operator-welcome-card__photo-frame operator-welcome-card__photo-frame--initials">
            <span className="text-3xl font-semibold text-white/90">{initials}</span>
          </div>
        </div>
      ) : null}
      <div className="operator-welcome-card__body relative z-10 flex h-full min-h-0 flex-1">
        <div className="operator-welcome-card__text flex min-w-0 flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-[#a0aec0]">Привет,</p>
            <p className="mt-1 text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
              {name ?? (
                <span className="inline-block h-7 w-40 max-w-full animate-pulse rounded-lg bg-white/10" aria-hidden />
              )}
            </p>
          </div>
          <Link
            to="/profile"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-white/90 underline-offset-4 hover:text-pari-300 hover:underline"
          >
            Перейти к профилю <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </MagicSurface>
  );
}

function DashboardWithEventsSidebar(props: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-5 lg:col-span-8">{props.children}</div>
        <div className="space-y-5 lg:col-span-4">
          <HoroscopePanel />
          <EventsPanel />
        </div>
      </div>
      {props.footer}
    </>
  );
}

function teamMetricsToDemo(metrics: TeamOperatorOverviewResponse["metrics"]): OperatorMetricDemo[] {
  return metrics.map((m) => ({
    key: m.key as OperatorMetricKey,
    label: m.label,
    color: m.color,
    kind: m.kind,
    higherIsBetter: m.higherIsBetter,
    monthly: m.monthly,
  }));
}

function OperatorDashboardBody(props: {
  meUser: AuthUser | null;
  meReady: boolean;
  teamOverview: TeamOperatorOverviewResponse | null;
  teamOverviewLoading: boolean;
  teamOverviewError: string | null;
  teamScopeLabel: string | null;
  myMonitoring: MyMonitoringResponse | null;
  myMonitoringLoading: boolean;
  teamMonitoring: TeamMonitoringResponse | null;
  teamMonitoringLoading: boolean;
}) {
  const {
    meUser,
    meReady,
    teamOverview,
    teamOverviewLoading,
    teamOverviewError,
    teamScopeLabel,
    myMonitoring,
    myMonitoringLoading,
    teamMonitoring,
    teamMonitoringLoading,
  } = props;

  const topKpis =
    teamScopeLabel && !teamOverview
      ? OPERATOR_DEMO_TOP_KPIS.map((k) => ({ ...k, value: 0, changePercent: 0 }))
      : teamOverview?.topKpis ?? OPERATOR_DEMO_TOP_KPIS;
  const metricsDemo = teamOverview ? teamMetricsToDemo(teamOverview.metrics) : undefined;
  const monitoringPending = Boolean(
    (teamScopeLabel && teamMonitoringLoading) || (!teamScopeLabel && myMonitoringLoading),
  );
  const monitoringFromApi =
    teamMonitoring?.integrations?.monitoring?.source === "api" ||
    myMonitoring?.integrations?.monitoring?.source === "api";
  const monitoringMonths: MonitoringMonthEntry[] | undefined = teamScopeLabel
    ? teamMonitoring?.monitoring?.months
    : myMonitoring?.monitoring?.months;
  const monitoringUseDemo =
    !monitoringPending && !monitoringFromApi && !(monitoringMonths?.length);

  return (
    <div className="operator-dashboard mt-8 space-y-5">
      <MagicSpotlightShell
        spotlightRadius={400}
        glowColor="0, 199, 177"
        enableTilt={false}
        enableMagnetism={false}
        clickEffect
        defaultEnableStars
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Показатели за текущий месяц
            </p>
            {teamScopeLabel ? (
              <p className="mt-1 text-xs text-white/50">
                {teamOverviewLoading
                  ? "Загрузка…"
                  : teamOverviewError
                    ? teamOverviewError
                    : `Сводка по ${teamScopeLabel}${
                        teamOverview?.memberCount != null ? ` · ${teamOverview.memberCount} чел.` : ""
                      }`}
              </p>
            ) : null}
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
            {topKpis.map((kpi) => (
              <TopKpiCard
                key={kpi.label}
                label={kpi.label}
                value={
                  teamOverviewLoading && teamScopeLabel
                    ? "…"
                    : new Intl.NumberFormat("ru-RU").format(kpi.value)
                }
                changePercent={teamOverviewLoading && teamScopeLabel ? undefined : kpi.changePercent}
              />
            ))}
          </div>

          <OperatorNewsTicker />

          <DashboardWithEventsSidebar
            footer={
              <p className="border-t border-white/5 pt-6 text-sm text-white/45">
                @ 2026, Отдел реализации технических проектов
              </p>
            }
          >
            <div className="operator-dashboard__main-col">
              <div className="operator-dashboard__tiles grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
                <div className="operator-dashboard__tile operator-dashboard__tile--welcome aspect-square w-full min-w-0 [&>*]:h-full">
                  <WelcomeOperatorCard meUser={meUser} meReady={meReady} />
                </div>
                <div className="operator-dashboard__tile operator-dashboard__tile--metric aspect-square w-full min-w-0 [&>*]:h-full">
                  <OperatorKpdCard
                    percent={teamOverview?.kpdPercent}
                    pending={Boolean(teamScopeLabel && teamOverviewLoading)}
                  />
                </div>
                <div className="operator-dashboard__tile operator-dashboard__tile--metric aspect-square w-full min-w-0 [&>*]:h-full">
                  <OperatorMonitoringCard
                    months={monitoringMonths}
                    pending={monitoringPending}
                    useDemo={monitoringUseDemo}
                    teamScope={Boolean(teamScopeLabel)}
                  />
                </div>
              </div>
              <div className="operator-dashboard__metrics">
                <OperatorMetricsCard
                  metrics={metricsDemo}
                  pending={Boolean(teamScopeLabel && teamOverviewLoading)}
                />
              </div>
            </div>
          </DashboardWithEventsSidebar>
        </div>
      </MagicSpotlightShell>
    </div>
  );
}
