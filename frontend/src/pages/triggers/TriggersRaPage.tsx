import { useCallback, useState } from "react";
import { MagicSurface } from "../../components/MagicBento";
import { operatorSurface } from "../../components/operator/operatorTile";
import { TriggersRaFormulasModal } from "../../components/triggers/TriggersRaFormulasModal";
import {
  downloadTriggersRaXlsx,
  fetchTriggersRaDashboard,
  type ChartSection,
  type OperatorRow,
  type ProjectSection,
  type TmSection,
  type TrendCell,
  type TriggersRaDashboard,
} from "../../lib/triggersRa";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

type TabId = "operators" | "projects" | "tm" | "charts";

function trendClass(cell: TrendCell | undefined) {
  if (!cell) return "text-white/45";
  if (cell.sentiment === "good") return "text-emerald-400 font-semibold";
  if (cell.sentiment === "bad") return "text-rose-400 font-semibold";
  return "text-white/45";
}

function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(v * 10) / 10}%`;
}

function score(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return String(Math.round(v * 10) / 10);
}

function SimpleLineChart(props: { points: ChartSection["points"]; field: "nekonstruktivPct" | "clientNegPct" }) {
  const values = props.points
    .map((p) => p[props.field])
    .filter((v): v is number => typeof v === "number");
  if (values.length < 2) {
    return <p className="text-sm text-white/40">Недостаточно точек для графика</p>;
  }
  const w = 520;
  const h = 160;
  const pad = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.1);
  const coords = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
      <polyline fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="2.5" points={coords.join(" ")} />
      <text x={pad} y={14} fill="rgba(255,255,255,0.45)" fontSize="11">
        max {Math.round(max * 10) / 10}%
      </text>
      <text x={pad} y={h - 4} fill="rgba(255,255,255,0.45)" fontSize="11">
        min {Math.round(min * 10) / 10}%
      </text>
    </svg>
  );
}

function OperatorsTable(props: { rows: OperatorRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-wider text-white/40">
            <th className="pb-3 pr-3">Оператор</th>
            <th className="pb-3 pr-3 text-right">Обращений</th>
            <th className="pb-3 pr-3 text-right">Неконстр.</th>
            <th className="pb-3 pr-3 text-right">Δ</th>
            <th className="pb-3 pr-3 text-right">Негатив</th>
            <th className="pb-3 pr-3 text-right">Δ</th>
            <th className="pb-3 pr-3 text-right">Завершил оп.</th>
            <th className="pb-3 pr-3 text-right">Δ</th>
            <th className="pb-3 pr-3 text-right">ОКК</th>
            <th className="pb-3 pr-3 text-right">Монит.</th>
            <th className="pb-3 pr-3 text-right">Риск ИИ</th>
            <th className="pb-3 pr-3 text-right">Эмпатия</th>
            <th className="pb-3 pr-3 text-right">Балл</th>
            <th className="pb-3">Срабатывания</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={row.operator}
              className={`border-b border-white/[0.05] last:border-0 ${
                row.isAtRisk ? "bg-rose-500/10" : ""
              }`}
            >
              <td className="py-2.5 pr-3 font-medium text-white">{row.operator}</td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.totalCalls}</td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.nekonstruktivPct}</td>
              <td className={`py-2.5 pr-3 text-right ${trendClass(row.trends.nekonstruktiv)}`}>
                {row.trends.nekonstruktiv.text}
              </td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.clientNegPct}</td>
              <td className={`py-2.5 pr-3 text-right ${trendClass(row.trends.clientNeg)}`}>
                {row.trends.clientNeg.text}
              </td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.operatorEndPct}</td>
              <td className={`py-2.5 pr-3 text-right ${trendClass(row.trends.operatorEnd)}`}>
                {row.trends.operatorEnd.text}
              </td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.qcPct}</td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.monitoringPct}</td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.llmRisk}</td>
              <td className="py-2.5 pr-3 text-right text-white/80">{row.display.empathy}</td>
              <td className="py-2.5 pr-3 text-right font-semibold text-white">{row.display.score}</td>
              <td className="py-2.5 text-xs text-white/65">{row.triggersLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsBlock(props: { sections: ProjectSection[] }) {
  const groups = (() => {
    const sp = props.sections.filter((s) => s.group === "sp");
    const vip = props.sections.filter((s) => s.group === "vip");
    return [
      { title: "СП", items: sp },
      { title: "VIP", items: vip },
    ];
  })();

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.title} className="space-y-4">
          <h3 className="text-lg font-semibold text-white">{g.title}</h3>
          {g.items.map((section) => (
            <MagicSurface key={section.id} className={panel}>
              <h4 className="mb-3 text-sm font-semibold text-white/90">{section.name}</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-white/40">
                      <th className="pb-2 pr-3 text-left">Оператор</th>
                      <th className="pb-2 pr-3 text-right">Обращений</th>
                      <th className="pb-2 pr-3 text-right">Неконстр.</th>
                      {section.hasClientSentiment ? (
                        <th className="pb-2 pr-3 text-right">Негатив</th>
                      ) : null}
                      {section.hasEndCall ? (
                        <th className="pb-2 pr-3 text-right">Завершил оп.</th>
                      ) : null}
                      <th className="pb-2 pr-3 text-right">ОКК</th>
                      <th className="pb-2 pr-3 text-right">Монит.</th>
                      <th className="pb-2 pr-3 text-right">Риск ИИ</th>
                      <th className="pb-2 text-right">Эмпатия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.operators.map((op) => (
                      <tr key={op.operator} className="border-b border-white/[0.05] last:border-0">
                        <td className="py-2 pr-3 text-white">{op.operator}</td>
                        <td className="py-2 pr-3 text-right text-white/80">{op.totalCalls}</td>
                        <td className="py-2 pr-3 text-right text-white/80">{pct(op.nekonstruktivPct)}</td>
                        {section.hasClientSentiment ? (
                          <td className="py-2 pr-3 text-right text-white/80">{pct(op.clientNegPct)}</td>
                        ) : null}
                        {section.hasEndCall ? (
                          <td className="py-2 pr-3 text-right text-white/80">{pct(op.operatorEndPct)}</td>
                        ) : null}
                        <td className="py-2 pr-3 text-right text-white/80">
                          {op.qcAvgWeight != null ? pct(op.qcAvgWeight * 100) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-white/80">{pct(op.monitoringPct)}</td>
                        <td className="py-2 pr-3 text-right text-white/80">{score(op.llmBurnoutAvg)}</td>
                        <td className="py-2 text-right text-white/80">{score(op.llmEmpathyAvg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MagicSurface>
          ))}
        </div>
      ))}
    </div>
  );
}

function TmBlock(props: { sections: TmSection[] }) {
  return (
    <div className="space-y-4">
      {props.sections.map((section) => (
        <MagicSurface key={section.id} className={panel}>
          <h3 className="mb-3 text-sm font-semibold text-white">{section.name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-white/40">
                  <th className="pb-2 pr-3 text-left">Оператор</th>
                  <th className="pb-2 pr-3 text-right">Обращений</th>
                  <th className="pb-2 pr-3 text-right">Завершил оп.</th>
                  <th className="pb-2 pr-3 text-right">Негатив</th>
                  {section.statuses.map((st) => (
                    <th key={st} className="pb-2 pr-3 text-right">
                      {st}
                    </th>
                  ))}
                  <th className="pb-2 pr-3 text-right">Риск ИИ</th>
                  <th className="pb-2 text-right">Эмпатия</th>
                </tr>
              </thead>
              <tbody>
                {section.operators.map((op) => (
                  <tr key={op.operator} className="border-b border-white/[0.05] last:border-0">
                    <td className="py-2 pr-3 text-white">{op.operator}</td>
                    <td className="py-2 pr-3 text-right text-white/80">{op.totalCalls}</td>
                    <td className="py-2 pr-3 text-right text-white/80">{pct(op.operatorEndPct)}</td>
                    <td className="py-2 pr-3 text-right text-white/80">{pct(op.clientNegPct)}</td>
                    {section.statuses.map((st) => (
                      <td key={st} className="py-2 pr-3 text-right text-white/80">
                        {pct(op.statusPcts[st] ?? 0)}
                      </td>
                    ))}
                    <td className="py-2 pr-3 text-right text-white/80">{score(op.llmBurnoutAvg)}</td>
                    <td className="py-2 text-right text-white/80">{score(op.llmEmpathyAvg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MagicSurface>
      ))}
    </div>
  );
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 13);
  return { from: isoDate(from), to: isoDate(to) };
}

export function TriggersRaPage() {
  const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
  const [periodDays, setPeriodDays] = useState(14);
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [tab, setTab] = useState<TabId>("operators");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TriggersRaDashboard | null>(null);
  const [showFormulas, setShowFormulas] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    async (force = true) => {
      setLoading(true);
      setError("");
      try {
        if (periodMode === "custom") {
          if (!customRange.from || !customRange.to) {
            throw new Error("Укажите даты начала и конца интервала");
          }
          if (customRange.to < customRange.from) {
            throw new Error("Дата окончания не может быть раньше даты начала");
          }
          const dash = await fetchTriggersRaDashboard({
            mode: "custom",
            dateFrom: customRange.from,
            dateTo: customRange.to,
            force,
          });
          setData(dash);
        } else {
          const dash = await fetchTriggersRaDashboard({
            mode: "preset",
            periodDays,
            force,
          });
          setData(dash);
        }
      } catch (e: unknown) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [periodMode, periodDays, customRange],
  );

  const downloadExcel = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    setError("");
    try {
      const blob = await downloadTriggersRaXlsx(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const from = data.dateFrom;
      const to = data.dateTo;
      a.download =
        from && to ? `trigery-ra-${from}_${to}.xlsx` : `trigery-ra-${data.periodDays}d.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [data]);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "operators", label: "СП + VIP · Операторы" },
    { id: "projects", label: "По проектам" },
    { id: "tm", label: "ТМ · Реактивация" },
    { id: "charts", label: "Графики 30 дней" },
  ];

  const periodLabel =
    data?.dateFrom && data?.dateTo
      ? `${data.dateFrom} — ${data.dateTo} (${data.periodDays} дн.)`
      : `${data?.periodDays ?? periodDays} дн.`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Тригеры РА</h1>
          <p className="mt-1 text-sm text-white/50">
            Мониторинг выгорания операторов · 3i TouchPoint Analytics (СП / VIP / ТМ)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-white/50">
            Режим
            <select
              className="ml-2 rounded-lg border border-white/10 bg-[#0b1228] px-2 py-1.5 text-sm text-white"
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as "preset" | "custom")}
            >
              <option value="preset">Пресет</option>
              <option value="custom">Свои даты</option>
            </select>
          </label>
          {periodMode === "preset" ? (
            <label className="text-xs text-white/50">
              Период
              <select
                className="ml-2 rounded-lg border border-white/10 bg-[#0b1228] px-2 py-1.5 text-sm text-white"
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
              >
                <option value={7}>7 дней</option>
                <option value={14}>14 дней</option>
                <option value={30}>30 дней</option>
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs text-white/50">
                С
                <input
                  type="date"
                  className="ml-2 rounded-lg border border-white/10 bg-[#0b1228] px-2 py-1.5 text-sm text-white"
                  value={customRange.from}
                  onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
                />
              </label>
              <label className="text-xs text-white/50">
                По
                <input
                  type="date"
                  className="ml-2 rounded-lg border border-white/10 bg-[#0b1228] px-2 py-1.5 text-sm text-white"
                  value={customRange.to}
                  onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
                />
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={loading}
            className="rounded-xl bg-pari-600 px-4 py-2 text-sm font-medium text-white hover:bg-pari-500 disabled:opacity-50"
            title="Загрузить данные (кэш до 3 мин)"
          >
            {loading ? "Загрузка…" : "Обновить данные"}
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05] disabled:opacity-50"
            title="Игнорировать кэш и запросить TouchPoint заново"
          >
            Без кэша
          </button>
          <button
            type="button"
            onClick={() => void downloadExcel()}
            disabled={!data || exporting}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
            title={data ? "Скачать Excel-отчёт" : "Сначала загрузите данные"}
          >
            {exporting ? "Формирование…" : "Скачать Excel"}
          </button>
          <button
            type="button"
            onClick={() => setShowFormulas(true)}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
          >
            Как считаются столбцы
          </button>
        </div>
      </div>

      <TriggersRaFormulasModal open={showFormulas} onClose={() => setShowFormulas(false)} />

      {!data && !loading && !error ? (
        <MagicSurface className={panel}>
          <p className="text-sm text-white/60">
            Нажмите <span className="text-white">«Обновить данные»</span> для загрузки из TouchPoint API.
          </p>
        </MagicSurface>
      ) : null}

      {error ? (
        <MagicSurface className={`${panel} border border-rose-500/30`}>
          <p className="text-sm text-rose-300 whitespace-pre-wrap">{error}</p>
        </MagicSurface>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  tab === t.id
                    ? "border border-pari-500/40 bg-pari-500/15 text-white"
                    : "border border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "operators" ? (
            <div className="space-y-4">
              <MagicSurface className={panel}>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold text-white">Рейтинг операторов · {periodLabel}</h2>
                  <p className="mt-1 text-xs text-white/45">
                    Сравнение с предыдущими {data.periodDays} дн. той же длины. Подсветка: балл ≥ 51 или ≥ 2
                    срабатываний. Порог включения: ≥ {data.minCalls} обращений.
                    {data.fromCache ? " Данные из кэша (до 3 мин)." : ""}
                  </p>
                </div>
                {data.operators.length ? (
                  <OperatorsTable rows={data.operators} />
                ) : (
                  <p className="text-sm text-white/50">Нет операторов с достаточным числом обращений.</p>
                )}
              </MagicSurface>
              {data.atRisk.length ? (
                <MagicSurface className={panel}>
                  <h3 className="mb-3 text-base font-semibold text-rose-300">Операторы в зоне риска</h3>
                  <OperatorsTable rows={data.atRisk} />
                </MagicSurface>
              ) : null}
            </div>
          ) : null}

          {tab === "projects" ? <ProjectsBlock sections={data.projects} /> : null}
          {tab === "tm" ? <TmBlock sections={data.tm} /> : null}

          {tab === "charts" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.charts.map((chart) => (
                <MagicSurface key={chart.id} className={panel}>
                  <h3 className="mb-1 text-sm font-semibold text-white">{chart.name}</h3>
                  <p className="mb-3 text-xs text-white/45">Неконструктив % · 30 дней</p>
                  <SimpleLineChart points={chart.points} field="nekonstruktivPct" />
                  {chart.hasClientSentiment ? (
                    <>
                      <p className="mb-2 mt-4 text-xs text-white/45">Негатив клиента % · 30 дней</p>
                      <SimpleLineChart points={chart.points} field="clientNegPct" />
                    </>
                  ) : null}
                </MagicSurface>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
