import { NavLink, Outlet } from "react-router-dom";

export function TriggersLayout() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        <NavLink
          to="/triggers"
          end
          className={({ isActive }) =>
            `rounded-xl px-3 py-2 text-sm transition ${
              isActive
                ? "border border-pari-500/40 bg-pari-500/15 text-white"
                : "border border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white"
            }`
          }
        >
          Обзор команды
        </NavLink>
        <NavLink
          to="/triggers/ra"
          className={({ isActive }) =>
            `rounded-xl px-3 py-2 text-sm transition ${
              isActive
                ? "border border-pari-500/40 bg-pari-500/15 text-white"
                : "border border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white"
            }`
          }
        >
          Тригеры РА
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
