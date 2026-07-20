import { useEffect, useMemo, useState } from "react";
import { ViolationBrandSelect } from "../../components/violations/ViolationBrandSelect";
import { ViolationDetailModal } from "../../components/violations/ViolationDetailModal";
import {
  VIOLATION_CHART_COLORS,
  ViolationDynamicsChart,
  ViolationDynamicsLegend,
} from "../../components/violations/ViolationDynamicsChart";
import { ViolationSeriesFilter } from "../../components/violations/ViolationSeriesFilter";
import "../../components/violations/ViolationsJournal.css";
import {
  currentMonthKey,
  fetchViolationDynamics,
  fetchViolationStats,
  type ViolationDynamics,
  type ViolationStats,
} from "../../lib/violationJournal";
import { VIOLATION_MONTH_OPTIONS } from "../../lib/violationMonthOptions";

type DetailTarget =
  | { kind: "employee"; name: string }
  | { kind: "violationType"; name: string }
  | null;

export function ViolationsStatsPage() {
  const [month, setMonth] = useState(currentMonthKey);
  const [stats, setStats] = useState<ViolationStats | null>(null);
  const [dynamicsView, setDynamicsView] = useState<"employees" | "types">("employees");
  const [dynamics, setDynamics] = useState<ViolationDynamics | null>(null);
  /** null — все серии; иначе ключи выбранных серий */
  const [seriesFilter, setSeriesFilter] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dynLoading, setDynLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DetailTarget>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchViolationStats(month)
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
    setSeriesFilter(null);
  }, [dynamicsView]);

  useEffect(() => {
    let cancelled = false;
    setDynLoading(true);
    fetchViolationDynamics(dynamicsView, 50)
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
  }, [dynamicsView]);

  const colorByKey = useMemo(() => {
    const map: Record<string, string> = {};
    dynamics?.series.forEach((s, i) => {
      map[s.key] = VIOLATION_CHART_COLORS[i % VIOLATION_CHART_COLORS.length]!;
    });
    return map;
  }, [dynamics]);

  const filteredDynamics = useMemo((): ViolationDynamics | null => {
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

  return (
    <>
      <header className="vj-page-header vj-page-header--solo">
        <h1 className="kpd-page__title">Статистика нарушений</h1>
      </header>

      <div className="vj-month-filter kpd-filters">
        <div className="vj-month-field">
          <label htmlFor="vj-stats-month">Месяц</label>
          <ViolationBrandSelect
            id="vj-stats-month"
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
        <div className="vj-stats-grid">
          <section className="vj-stats-card">
            <h2 className="vj-stats-card__title">Антирейтинг нарушителей</h2>
            <div className="vj-rank-list">
              {stats.employees.length === 0 ? (
                <p className="text-sm text-white/50">{month ? "Нет данных за месяц" : "Нет данных"}</p>
              ) : (
                stats.employees.map((row, index) => (
                  <button
                    key={row.name}
                    type="button"
                    className="vj-rank-item"
                    onClick={() => setDetail({ kind: "employee", name: row.name })}
                  >
                    <span>
                      {index + 1}. {row.name}
                    </span>
                    <span className="vj-rank-item__count">{row.count}</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="vj-stats-card">
            <h2 className="vj-stats-card__title">Антирейтинг нарушений</h2>
            <div className="vj-rank-list">
              {stats.violationTypes.length === 0 ? (
                <p className="text-sm text-white/50">{month ? "Нет данных за месяц" : "Нет данных"}</p>
              ) : (
                stats.violationTypes.map((row, index) => (
                  <button
                    key={row.name}
                    type="button"
                    className="vj-rank-item"
                    onClick={() => setDetail({ kind: "violationType", name: row.name })}
                  >
                    <span>
                      {index + 1}. {row.name}
                    </span>
                    <span className="vj-rank-item__count">{row.count}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <section className="vj-dynamics-card">
        <div className="vj-dynamics-head">
          <h2 className="vj-stats-card__title vj-dynamics-card__title">Динамика нарушений</h2>
          <div className="vj-dynamics-head__controls">
            <div className="vj-dynamics-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`vj-dynamics-tab ${dynamicsView === "employees" ? "vj-dynamics-tab--active" : ""}`}
                onClick={() => setDynamicsView("employees")}
              >
                По сотрудникам
              </button>
              <button
                type="button"
                role="tab"
                className={`vj-dynamics-tab ${dynamicsView === "types" ? "vj-dynamics-tab--active" : ""}`}
                onClick={() => setDynamicsView("types")}
              >
                По типам
              </button>
            </div>
            <ViolationSeriesFilter
              label={dynamicsView === "employees" ? "Сотрудники" : "Типы"}
              allLabel={dynamicsView === "employees" ? "Все сотрудники" : "Все типы"}
              items={filterItems}
              selectedKeys={seriesFilter}
              onChange={setSeriesFilter}
            />
          </div>
        </div>
        {dynLoading ? (
          <p className="text-sm text-white/50">Загрузка графика…</p>
        ) : filteredDynamics && filteredDynamics.series.length > 0 ? (
          <>
            <ViolationDynamicsChart
              key={`${dynamicsView}-${seriesFilter === null ? "all" : seriesFilter.join("|")}`}
              data={filteredDynamics}
              colorByKey={colorByKey}
            />
            <ViolationDynamicsLegend series={filteredDynamics.series} colorByKey={colorByKey} />
          </>
        ) : dynamics && dynamics.series.length > 0 ? (
          <p className="text-sm text-white/50">Выберите хотя бы одну серию в фильтре</p>
        ) : (
          <p className="text-sm text-white/50">Недостаточно данных для графика</p>
        )}
      </section>

      {detail?.kind === "employee" ? (
        <ViolationDetailModal
          title={`Нарушения: ${detail.name}`}
          month={month}
          employee={detail.name}
          onClose={() => setDetail(null)}
        />
      ) : null}
      {detail?.kind === "violationType" ? (
        <ViolationDetailModal
          title={`Тип: ${detail.name}`}
          month={month}
          violationType={detail.name}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </>
  );
}
