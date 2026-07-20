import { useMemo, useState } from "react";
import { MagicSurface } from "../components/MagicBento";
import { operatorSurface } from "../components/operator/operatorTile";
import { ChurnBarChart } from "../components/triggers/ChurnBarChart";
import {
  AT_RISK_EMPLOYEES,
  REPLACEMENT_COSTS,
  RETENTION_RECOMMENDATIONS,
  TRIGGERS_SUMMARY,
  formatRub,
  formatRubInteger,
  replacementCostTotal,
  type AtRiskEmployee,
  type RiskFilter,
  type RiskLevel,
} from "../components/triggers/triggersDemoData";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

function riskBarColor(level: RiskLevel) {
  if (level === "critical") return "bg-gradient-to-r from-red-600 to-red-400";
  if (level === "medium") return "bg-gradient-to-r from-amber-600 to-amber-400";
  return "bg-gradient-to-r from-pari-600 to-pari-400";
}

function avatarTone(id: string) {
  const tones = [
    "from-violet-600/80 to-violet-400/60",
    "from-pari-700/80 to-pari-500/60",
    "from-amber-700/80 to-amber-500/60",
    "from-rose-700/80 to-rose-500/60",
    "from-cyan-700/80 to-cyan-500/60",
    "from-indigo-700/80 to-indigo-500/60",
  ];
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return tones[n % tones.length];
}

function SummaryCard(props: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "red" | "pari";
}) {
  const valueClass =
    props.tone === "amber"
      ? "text-amber-400"
      : props.tone === "red"
        ? "text-red-400"
        : props.tone === "pari"
          ? "text-pari-300"
          : "text-white";
  return (
    <MagicSurface className={`${panel} flex flex-col justify-center`}>
      <p className={`whitespace-nowrap text-xl font-bold tracking-tight sm:text-2xl ${valueClass}`}>
        {props.value}
      </p>
      <p className="mt-1 text-xs text-white/50 sm:text-sm">{props.label}</p>
    </MagicSurface>
  );
}

function EmployeesTable(props: { rows: AtRiskEmployee[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-wider text-white/40">
            <th className="pb-3 pr-4">Сотрудник</th>
            <th className="pb-3 pr-4">Локация</th>
            <th className="pb-3 pr-4 text-right">Звонки</th>
            <th className="pb-3 pr-4 text-right">Качество</th>
            <th className="pb-3 pr-4">Риск</th>
            <th className="pb-3 pr-4">Триггеры</th>
            <th className="pb-3 text-right">Действие</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} className="border-b border-white/[0.05] last:border-0">
              <td className="py-3.5 pr-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white ${avatarTone(row.id)}`}
                  >
                    {row.initials}
                  </span>
                  <span>
                    <p className="font-semibold text-white">{row.name}</p>
                    <p className="text-xs text-white/45">{row.role}</p>
                  </span>
                </div>
              </td>
              <td className="py-3.5 pr-4 text-white/70">{row.location}</td>
              <td className="py-3.5 pr-4 text-right font-medium text-white">{row.calls}</td>
              <td className="py-3.5 pr-4 text-right">
                <span className="font-semibold text-white">{row.qualityScore}</span>
                <span
                  className={`ml-1.5 text-xs font-medium ${row.qualityDelta >= 0 ? "text-pari-400" : "text-red-400"}`}
                >
                  {row.qualityDelta >= 0 ? `+${row.qualityDelta}` : row.qualityDelta}
                </span>
              </td>
              <td className="py-3.5 pr-4">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${riskBarColor(row.riskLevel)}`}
                    style={{ width: `${row.riskPercent}%` }}
                  />
                </div>
              </td>
              <td className="py-3.5 pr-4">
                <div className="flex max-w-[220px] flex-wrap gap-1.5">
                  {row.triggers.length === 0 ? (
                    <span className="text-xs text-white/35">—</span>
                  ) : (
                    row.triggers.map((t) => (
                      <span
                        key={t.id}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium leading-snug ${
                          t.tone === "red"
                            ? "bg-red-500/20 text-red-200"
                            : t.tone === "amber"
                              ? "bg-amber-500/20 text-amber-100"
                              : "bg-white/10 text-white/70"
                        }`}
                      >
                        {t.label}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td className="py-3.5 text-right">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    row.actionTone === "red"
                      ? "bg-red-500/25 text-red-100 hover:bg-red-500/35"
                      : row.actionTone === "amber"
                        ? "bg-amber-500/25 text-amber-100 hover:bg-amber-500/35"
                        : "bg-pari-500/25 text-pari-100 hover:bg-pari-500/35"
                  }`}
                >
                  {row.actionLabel}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TriggersPage() {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

  const filteredEmployees = useMemo(() => {
    if (riskFilter === "all") return AT_RISK_EMPLOYEES;
    return AT_RISK_EMPLOYEES.filter((e) => e.riskLevel === riskFilter);
  }, [riskFilter]);

  const totalCost = replacementCostTotal(REPLACEMENT_COSTS);
  const s = TRIGGERS_SUMMARY;

  return (
    <div className="min-w-0 space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-pari-400/90">Руководитель</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Обзор команды</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Операторов" value={String(s.operators)} />
        <SummaryCard label="В зоне риска" value={String(s.atRisk)} tone="amber" />
        <SummaryCard label="Критичный риск" value={String(s.critical)} tone="red" />
        <SummaryCard
          label="Потенциальные потери"
          value={`${formatRubInteger(totalCost)} ₽`}
          tone="pari"
        />
        <SummaryCard label="Средняя оценка" value={String(s.avgQuality)} />
        <SummaryCard label="Звонков сегодня" value={String(s.callsToday)} />
      </div>

      <MagicSurface className={panel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Сотрудники с рисками</h2>
          <label className="flex items-center gap-2 text-xs text-white/55">
            <span>Фильтр</span>
            <select
              className="rounded-lg border border-white/10 bg-[#1a1f37] px-3 py-1.5 text-xs text-white outline-none"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
            >
              <option value="all">Все</option>
              <option value="critical">Критичный</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </label>
        </div>
        <EmployeesTable rows={filteredEmployees} />
      </MagicSurface>

      <div className="grid gap-5 lg:grid-cols-12">
        <MagicSurface className={`lg:col-span-7 ${panel}`}>
          <h2 className="text-base font-semibold text-white">Рекомендации по удержанию</h2>
          <div className="mt-4 space-y-5">
            {RETENTION_RECOMMENDATIONS.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      rec.level === "critical" ? "bg-red-400" : "bg-amber-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{rec.title}</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-white/60">
                      {rec.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                    >
                      Создать задачу
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </MagicSurface>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <MagicSurface className={panel}>
            <h2 className="text-base font-semibold text-white">Стоимость замены оператора</h2>
            <ul className="mt-4 space-y-2">
              {REPLACEMENT_COSTS.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    item.highlight ? "border border-amber-500/35 bg-amber-500/10" : "bg-white/[0.03]"
                  }`}
                >
                  <span className="text-white/75">{item.label}</span>
                  <span className="font-medium text-white">{formatRub(item.amount)} ₽</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-white/[0.08] pt-4 text-sm text-white/55">
              Итого с НДС:{" "}
              <span className="text-xl font-bold text-pari-300">{formatRub(totalCost)} ₽</span>
            </p>
          </MagicSurface>

          <MagicSurface className={panel}>
            <h2 className="text-base font-semibold text-white">Динамика оттока</h2>
            <ChurnBarChart />
          </MagicSurface>
        </div>
      </div>

      <p className="border-t border-white/5 pt-6 text-sm text-white/45">
        @ 2026, Отдел реализации технических проектов
      </p>
    </div>
  );
}
