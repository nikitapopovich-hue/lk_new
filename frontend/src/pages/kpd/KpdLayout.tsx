import { NavLink, Outlet } from "react-router-dom";
import { MagicSurface } from "../../components/MagicBento";
import { operatorSurface } from "../../components/operator/operatorTile";
import "../../components/kpd/Kpd.css";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

export function KpdLayout() {
  return (
    <div className="kpd-page">
      <MagicSurface className={panel}>
        <nav className="kpd-tabs" aria-label="Раздел КПД">
          <NavLink
            to="/kpd/view"
            className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
          >
            Просмотр
          </NavLink>
          <NavLink
            to="/kpd/upload"
            className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
          >
            Загрузка
          </NavLink>
        </nav>
        <Outlet />
      </MagicSurface>
    </div>
  );
}
