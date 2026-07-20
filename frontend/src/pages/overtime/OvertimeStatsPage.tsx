import { useEffect, useMemo, useState } from "react";
import { ViolationBrandSelect } from "../../components/violations/ViolationBrandSelect";
import {
  VIOLATION_CHART_COLORS,
  ViolationDynamicsChart,
  ViolationDynamicsLegend,
} from "../../components/violations/ViolationDynamicsChart";
import { ViolationSeriesFilter } from "../../components/violations/ViolationSeriesFilter";
import "../../components/violations/ViolationsJournal.css";
import {
  currentMonthKey,
  fetchFinanceDynamics,
  fetchFinanceStats,
  FINANCE_JOURNAL_LABELS,
  type FinanceDynamics,
  type FinanceStats,
} from "../../lib/financeJournal";
import { VIOLATION_MONTH_OPTIONS } from "../../lib/violationMonthOptions";

export function OvertimeStatsPage() {
  const labels = FINANCE_JOURNAL_LABELS.overtime;
  const [month, setMonth] = useState(currentMonthKey);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [dynamics, setDynamics] = useState<FinanceDynamics | null>(null);
  const [seriesFilter, setSeriesFilter] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dynLoading, setDynLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchFinanceStats("overtime", month)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setDynLoading(true);
    fetchFinanceDynamics("overtime", 50)
      .then((data) => {
        if (!cancelled) setDynamics(data);
      })
      .catch(() => {
        if (!cancelled) setDynamics(null);
      })
      .finally(() => {
        if (!cancelled) setDynLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const colorByKey = useMemo(() => {
    const map: Record<string, string> = {};
    dynamics?.series.forEach((s, i) => {
      map[s.key] = VIOLATION_CHART_COLORS[i % VIOLATION_CHART_COLORS.length]!;
    });
    return map;
  }, [dynamics]);

  const filteredDynamics = useMemo((): FinanceDynamics | null => {
    if (!dynamics) return null;
    if (seriesFilter === null) return dynamics;
    const keySet = new Set(seriesFilter);
    const series = dynamics.series.filter((s) => keySet.has(s.key));
    return { ...dynamics, series };
  }, [dynamics, seriesFilter]);

  const filterItems = useMemo(
    () => dynamics?.series.map((s) => ({ key: s.key, label: s.label })) ?? [],
    [dynamics],
  );

  const chartDynamics = useMemo(
    () => (filteredDynamics ? { ...filteredDynamics, view: "employees" as const } : null),
    [filteredDynamics],
  );

  return (
    <>
      <header className="vj-page-header vj-page-header--solo">
        <h1 className="kpd-page__title">{labels.statsTitle}</h1>
      </header>

      <div className="vj-month-filter kpd-filters">
        <div className="vj-month-field">
          <label htmlFor="ot-stats-month">Месяц</label>
          <ViolationBrandSelect
            id="ot-stats-month"
            value={month}
            onChange={setMonth}
            options={VIOLATION_MONTH_OPTIONS}
          />
        </div>
        <button type="button" className="kpd-btn kpd-btn--ghost" onClick={() => setMonth("")}>
          За всё время
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-white/50">Загрузка…</p> : null}

      {!loading && stats ? (
        <section className="vj-stats-card">
          <h2 className="vj-stats-card__title">{labels.rankTitle}</h2>
          <div className="vj-rank-list">
            {stats.employees.length === 0 ? (
              <p className="text-sm text-white/50">{month ? "Нет данных за месяц" : "Нет данных"}</p>
            ) : (
              stats.employees.map((row, index) => (
                <div key={row.name} className="vj-rank-item vj-rank-item--static">
                  <span>
                    {index + 1}. {row.name}
                  </span>
                  <span className="vj-rank-item__count">
                    {row.hours ?? 0} ч. · {row.amount} ₽
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="vj-dynamics-card">
        <div className="vj-dynamics-head">
          <h2 className="vj-stats-card__title vj-dynamics-card__title">Динамика переработок</h2>
          <ViolationSeriesFilter
            label="Сотрудники"
            allLabel="Все сотрудники"
            items={filterItems}
            selectedKeys={seriesFilter}
            onChange={setSeriesFilter}
          />
        </div>
        {dynLoading ? (
          <p className="text-sm text-white/50">Загрузка графика…</p>
        ) : chartDynamics && chartDynamics.series.length > 0 ? (
          <>
            <ViolationDynamicsChart
              key={seriesFilter === null ? "all" : seriesFilter.join("|")}
              data={chartDynamics}
              colorByKey={colorByKey}
            />
            <ViolationDynamicsLegend series={chartDynamics.series} colorByKey={colorByKey} />
          </>
        ) : (
          <p className="text-sm text-white/50">Недостаточно данных для графика</p>
        )}
      </section>
    </>
  );
}
