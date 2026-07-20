import { KPD_MOCK_CALCULATIONS, type KpdRunMode } from "./kpdMockData";

function modeLabel(mode: KpdRunMode): string {
  if (mode === "auto") return "Автоматический";
  if (mode === "hybrid") return "Смешанный";
  return "Ручной";
}

function modePillClass(mode: KpdRunMode): string {
  if (mode === "auto") return "kpd-pill kpd-pill--auto";
  if (mode === "hybrid") return "kpd-pill kpd-pill--hybrid";
  return "kpd-pill kpd-pill--manual";
}

export function KpdViewPage() {
  const rows = KPD_MOCK_CALCULATIONS;
  const total = 26;
  const shown = rows.length;

  return (
    <>
      <div className="kpd-page__head mt-4">
        <h1 className="kpd-page__title">Расчёты</h1>
      </div>

      <div className="kpd-filters">
        <div className="kpd-field">
          <label htmlFor="kpd-period">Период</label>
          <input id="kpd-period" type="month" defaultValue="2026-05" disabled />
        </div>
        <div className="kpd-field">
          <label htmlFor="kpd-status">Статус</label>
          <select id="kpd-status" defaultValue="all" disabled>
            <option value="all">Все</option>
            <option value="success">Успешно</option>
            <option value="failed">Неуспешно</option>
          </select>
        </div>
        <div className="kpd-field">
          <label htmlFor="kpd-mode-filter">Режим</label>
          <select id="kpd-mode-filter" defaultValue="all" disabled>
            <option value="all">Все</option>
            <option value="auto">Автоматический</option>
            <option value="hybrid">Смешанный</option>
            <option value="manual">Ручной</option>
          </select>
        </div>
        <button type="button" className="kpd-btn kpd-btn--ghost" disabled>
          Сбросить
        </button>
      </div>

      <div className="kpd-table-wrap">
        <table className="kpd-table">
          <thead>
            <tr>
              <th>Период</th>
              <th>Статус</th>
              <th>Режим</th>
              <th>Pipeline</th>
              <th>Завершён</th>
              <th>Операторов</th>
              <th>Версия</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href="#" className="kpd-period-link" onClick={(e) => e.preventDefault()}>
                    {row.period}
                  </a>
                  {row.isLatest ? <span className="kpd-badge-latest">последний</span> : null}
                </td>
                <td>
                  <span className="kpd-status">
                    <span
                      className={`kpd-status__dot ${row.status === "success" ? "kpd-status__dot--ok" : "kpd-status__dot--fail"}`}
                      aria-hidden
                    />
                    {row.status === "success" ? "Успешно" : "Неуспешно"}
                  </span>
                </td>
                <td>
                  <span className={modePillClass(row.mode)}>{modeLabel(row.mode)}</span>
                </td>
                <td>{row.pipeline}</td>
                <td>{row.completedAt}</td>
                <td>{row.operators}</td>
                <td>{row.version || "—"}</td>
                <td>
                  <button type="button" className="kpd-action-btn" disabled title="Скоро" aria-label="Детали">
                    ⇄
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kpd-pagination">
        <button type="button" className="kpd-btn kpd-btn--ghost kpd-btn--disabled" disabled>
          ← Назад
        </button>
        <button type="button" className="kpd-btn kpd-btn--ghost kpd-btn--disabled" disabled>
          Вперёд →
        </button>
        <span className="kpd-pagination__meta">
          показано 1–{shown} из {total}
        </span>
      </div>
    </>
  );
}
