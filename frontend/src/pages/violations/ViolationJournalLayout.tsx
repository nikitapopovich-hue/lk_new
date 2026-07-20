import { NavLink, Outlet } from "react-router-dom";
import { MagicSurface } from "../../components/MagicBento";
import { operatorSurface } from "../../components/operator/operatorTile";
import "../../components/kpd/Kpd.css";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

export function ViolationJournalLayout() {
  return (
    <div className="kpd-page">
      <MagicSurface className={`${panel} vj-layout`}>
        <nav className="kpd-tabs kpd-tabs--vj" aria-label="Журнал нарушений">
          <NavLink
            to="/violations/journal"
            end
            className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
          >
            Нарушения
          </NavLink>
          <NavLink
            to="/violations/stats"
            className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
          >
            Статистика
          </NavLink>
        </nav>
        <Outlet />
      </MagicSurface>
    </div>
  );
}
