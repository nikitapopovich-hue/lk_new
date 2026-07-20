import { NavLink, Outlet } from "react-router-dom";
import { MagicSurface } from "../../components/MagicBento";
import { operatorSurface } from "../../components/operator/operatorTile";
import "../../components/kpd/Kpd.css";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

type Props = {
  basePath: string;
  journalLabel: string;
  withStats?: boolean;
};

export function FinanceJournalLayout(props: Props) {
  return (
    <div className="kpd-page">
      <MagicSurface className={`${panel} vj-layout`}>
        <nav className="kpd-tabs kpd-tabs--vj" aria-label={props.journalLabel}>
          <NavLink
            to={`${props.basePath}/journal`}
            end
            className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
          >
            {props.journalLabel}
          </NavLink>
          {props.withStats ? (
            <NavLink
              to={`${props.basePath}/stats`}
              className={({ isActive }) => `kpd-tabs__link ${isActive ? "kpd-tabs__link--active" : ""}`}
            >
              Статистика
            </NavLink>
          ) : null}
        </nav>
        <Outlet />
      </MagicSurface>
    </div>
  );
}
