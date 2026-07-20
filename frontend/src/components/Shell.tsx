import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { getRole } from "../lib/role";
import { logout } from "../lib/auth";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../lib/shellSidebar";
import "./ShellKcNav.css";
import "./ShellStatsNav.css";
import "./ShellSidebar.css";

const sidebarTile =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const SCHEDULE_KC_URL = "https://contactcenter-schedule.paricorp.ru/";
const COMPAINER_URL = "https://actions-compainer.paricorp.ru:4443/home";
const GAMIFICATION_URL = "https://game.paricorp.ru/profile";
const CHANNEL_MONITORING_URL = "http://192.168.220.66:8002/";

const navLinkClass =
  "block rounded-xl px-3 py-2.5 text-sm transition border border-transparent text-white/70 hover:border-white/[0.06] hover:bg-white/[0.06] hover:text-white";

type NavRouteItem = { kind: "route"; to: string; label: string };
type NavExternalItem = { kind: "external"; href: string; label: string };
type NavKcGroupItem = { kind: "kc-group" };
type NavStatsGroupItem = { kind: "stats-group" };
type NavItem = NavRouteItem | NavExternalItem | NavKcGroupItem | NavStatsGroupItem;

const scheduleKcNavItem: NavExternalItem = {
  kind: "external",
  href: SCHEDULE_KC_URL,
  label: "График КЦ",
};

const compainerNavItem: NavExternalItem = {
  kind: "external",
  href: COMPAINER_URL,
  label: "Кампейнер",
};

const gamificationNavItem: NavExternalItem = {
  kind: "external",
  href: GAMIFICATION_URL,
  label: "Геймификация",
};

const channelMonitoringNavItem: NavExternalItem = {
  kind: "external",
  href: CHANNEL_MONITORING_URL,
  label: "Мониторинг каналов",
};

const kcNavGroupItem: NavKcGroupItem = { kind: "kc-group" };
const statsNavGroupItem: NavStatsGroupItem = { kind: "stats-group" };

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 3L5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 13V8.5M6 13V5M10 13V7M14 13V3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isStatsPath(pathname: string): boolean {
  return (
    pathname.startsWith("/kpd") ||
    pathname.startsWith("/violations") ||
    pathname.startsWith("/overtime") ||
    pathname.startsWith("/bonuses") ||
    pathname.startsWith("/recalculations")
  );
}

function StatisticsNavGroup(props: { open: boolean; onToggle: () => void }) {
  const location = useLocation();
  const onStatsSection = isStatsPath(location.pathname);

  return (
    <div className={`shell-stats-nav ${onStatsSection ? "shell-stats-nav--active" : ""}`}>
      <button
        type="button"
        className="shell-stats-nav__header"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span className="shell-stats-nav__icon">
          <StatsIcon />
        </span>
        <span className="shell-stats-nav__titles">
          <span className="shell-stats-nav__eyebrow">Раздел</span>
          <span className="shell-stats-nav__title">Статистика</span>
        </span>
        <span className="shell-stats-nav__chevron" aria-hidden>
          {props.open ? "▲" : "▼"}
        </span>
      </button>
      {props.open ? (
        <div className="shell-stats-nav__body">
          <div className="shell-stats-nav__links">
            <NavLink
              to="/kpd/view"
              className={({ isActive }) =>
                `shell-stats-nav__link ${isActive ? "shell-stats-nav__link--active" : ""}`
              }
            >
              КПД
            </NavLink>
            <NavLink
              to="/violations/journal"
              className={({ isActive }) =>
                `shell-stats-nav__link ${isActive || location.pathname.startsWith("/violations") ? "shell-stats-nav__link--active" : ""}`
              }
            >
              Журнал нарушений
            </NavLink>
            <NavLink
              to="/overtime/journal"
              className={({ isActive }) =>
                `shell-stats-nav__link ${isActive || location.pathname.startsWith("/overtime") ? "shell-stats-nav__link--active" : ""}`
              }
            >
              Переработки
            </NavLink>
            <NavLink
              to="/bonuses/journal"
              className={({ isActive }) =>
                `shell-stats-nav__link ${isActive || location.pathname.startsWith("/bonuses") ? "shell-stats-nav__link--active" : ""}`
              }
            >
              Премии
            </NavLink>
            <NavLink
              to="/recalculations/journal"
              className={({ isActive }) =>
                `shell-stats-nav__link ${isActive || location.pathname.startsWith("/recalculations") ? "shell-stats-nav__link--active" : ""}`
              }
            >
              Перерасчёты
            </NavLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KcNavGroup(props: { open: boolean; onToggle: () => void; structureMode: boolean }) {
  const location = useLocation();
  const onKc = location.pathname.startsWith("/kc-data");

  return (
    <div className="kc-shell-nav-group">
      <button
        type="button"
        className={`kc-shell-nav-group__trigger w-full text-left ${onKc && !props.structureMode ? "kc-shell-nav-group__trigger--active" : ""}`}
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span>Данные КЦ</span>
        <span className="kc-shell-nav-group__chevron" aria-hidden>
          {props.open ? "▲" : "▼"}
        </span>
      </button>
      {props.open && !props.structureMode ? (
        <div className="kc-shell-nav-submenu">
          <span className="kc-shell-nav-submenu__bar" aria-hidden />
          <div className="kc-shell-nav-submenu__links">
            <NavLink
              to="/kc-data"
              end
              className={({ isActive }) =>
                `kc-shell-nav-submenu__link ${isActive ? "kc-shell-nav-submenu__link--active" : ""}`
              }
            >
              Сотрудники
            </NavLink>
            <NavLink
              to="/kc-data/structure"
              className={({ isActive }) =>
                `kc-shell-nav-submenu__link ${isActive ? "kc-shell-nav-submenu__link--active" : ""}`
              }
            >
              Структура КЦ
            </NavLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell(props: { children: ReactNode }) {
  const role = getRole();
  const navigate = useNavigate();
  const location = useLocation();
  const structureMode = location.pathname === "/kc-data/structure";
  const [kcMenuOpen, setKcMenuOpen] = useState(() => location.pathname.startsWith("/kc-data"));
  const [statsMenuOpen, setStatsMenuOpen] = useState(() => isStatsPath(location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/kc-data") && !structureMode) {
      setKcMenuOpen(true);
    }
    if (isStatsPath(location.pathname)) {
      setStatsMenuOpen(true);
    }
  }, [location.pathname, structureMode]);

  const supervisorNav: NavItem[] = [
    { kind: "route", to: "/", label: "Дашборд" },
    { kind: "route", to: "/triggers", label: "Триггеры" },
    { kind: "route", to: "/remote-work", label: "Удалённая работа" },
    { kind: "route", to: "/teams", label: "Команды" },
    statsNavGroupItem,
    scheduleKcNavItem,
    compainerNavItem,
    gamificationNavItem,
    channelMonitoringNavItem,
    kcNavGroupItem,
    { kind: "route", to: "/profile", label: "Профиль" },
  ];

  const nav: NavItem[] =
    role === "operator"
      ? [
          { kind: "route", to: "/", label: "Дашборд" },
          { kind: "route", to: "/finance", label: "Финансы" },
          scheduleKcNavItem,
          compainerNavItem,
          gamificationNavItem,
          channelMonitoringNavItem,
          kcNavGroupItem,
          { kind: "route", to: "/profile", label: "Профиль" },
        ]
      : role === "supervisor"
        ? supervisorNav
        : [
            { kind: "route", to: "/", label: "Дашборд" },
            { kind: "route", to: "/triggers", label: "Триггеры" },
            { kind: "route", to: "/remote-work", label: "Удалённая работа" },
            { kind: "route", to: "/teams", label: "Команды" },
            { kind: "route", to: "/mappings", label: "Маппинг сотрудников" },
            { kind: "route", to: "/accounts", label: "Учётные записи" },
            statsNavGroupItem,
            scheduleKcNavItem,
            compainerNavItem,
            gamificationNavItem,
            channelMonitoringNavItem,
            kcNavGroupItem,
            { kind: "route", to: "/profile", label: "Профиль" },
          ];

  function handleStatsToggle() {
    setStatsMenuOpen((open) => {
      const next = !open;
      if (next && !isStatsPath(location.pathname)) {
        navigate("/kpd/view");
      }
      return next;
    });
  }

  function handleKcToggle() {
    if (structureMode) return;
    setKcMenuOpen((open) => {
      const next = !open;
      if (next && !location.pathname.startsWith("/kc-data")) {
        navigate("/kc-data");
      }
      return next;
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`relative min-h-full bg-[#020515] text-white ${structureMode ? "shell--structure" : ""}`}>
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(162deg,#00c7b1_14%,#090d2e_56%,#020515_86%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(0,199,177,0.22),transparent_55%)]"
        aria-hidden
      />
      <div
        className={[
          "relative mx-auto min-h-full px-6 py-10 transition-all duration-500 ease-out shell-layout",
          structureMode ? "max-w-none p-0" : "max-w-[min(88rem,calc(100vw-1.5rem))]",
          sidebarCollapsed && !structureMode ? "shell-layout--sidebar-collapsed shell-layout--wide" : "",
        ].join(" ")}
      >
        {!structureMode ? (
          <div
            className={`shell-sidebar-rail ${sidebarCollapsed ? "shell-sidebar-rail--collapsed" : ""}`}
          >
            <aside className="shell-sidebar" aria-hidden={sidebarCollapsed}>
              <div className={`shell-sidebar__inner flex flex-col gap-4 p-4 ${sidebarTile}`}>
            <header className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">Личный кабинет</p>
              <p className="mt-1 bg-gradient-to-br from-white via-pari-100 to-[#753BBD] bg-clip-text font-extralight leading-none tracking-[-0.02em] text-transparent text-[1.625rem] drop-shadow-[0_0_20px_rgba(0,199,177,0.28)]">
                PARI.One
              </p>
            </header>

            <nav className="flex flex-col gap-1">
              {nav.map((i) => {
                if (i.kind === "kc-group") {
                  return (
                    <KcNavGroup
                      key="kc-group"
                      open={kcMenuOpen}
                      onToggle={handleKcToggle}
                      structureMode={structureMode}
                    />
                  );
                }
                if (i.kind === "stats-group") {
                  return (
                    <StatisticsNavGroup
                      key="stats-group"
                      open={statsMenuOpen}
                      onToggle={handleStatsToggle}
                    />
                  );
                }
                if (i.kind === "external") {
                  return (
                    <a
                      key={i.href}
                      href={i.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={navLinkClass}
                    >
                      {i.label}
                    </a>
                  );
                }
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === "/"}
                    className={({ isActive }) =>
                      [
                        "block rounded-xl px-3 py-2.5 text-sm transition",
                        isActive
                          ? "border border-white/[0.1] bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "border border-transparent text-white/70 hover:border-white/[0.06] hover:bg-white/[0.06] hover:text-white",
                      ].join(" ")
                    }
                  >
                    {i.label}
                  </NavLink>
                );
              })}
            </nav>

            <button
              type="button"
              className="mt-1 w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2.5 text-sm text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/[0.14] hover:bg-white/[0.1] hover:text-white"
              onClick={() => void handleLogout()}
            >
              Выйти
            </button>
              </div>
            </aside>
            <button
              type="button"
              className="shell-sidebar__toggle"
              aria-label={sidebarCollapsed ? "Открыть меню" : "Свернуть меню"}
              title={sidebarCollapsed ? "Открыть меню" : "Свернуть меню"}
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          </div>
        ) : null}

        <main className={`shell-main ${structureMode ? "p-0" : ""}`}>{props.children}</main>
      </div>
    </div>
  );
}
