import { useMemo, useState } from "react";
import { MagicSurface } from "../MagicBento";
import { MetricsBarChart } from "./MetricsBarChart";
import {
  DEFAULT_OPERATOR_METRIC_KEY,
  OPERATOR_METRICS_DEMO,
  formatMetricValue,
  metricComparison,
  type OperatorMetricDemo,
  type OperatorMetricKey,
} from "./operatorMetricsDemo";
import { operatorSurface } from "./operatorTile";

export function OperatorMetricsCard(props: { metrics?: OperatorMetricDemo[]; pending?: boolean }) {
  const metrics = props.metrics ?? OPERATOR_METRICS_DEMO;
  const [activeKey, setActiveKey] = useState<OperatorMetricKey>(DEFAULT_OPERATOR_METRIC_KEY);

  const active = useMemo(
    () => metrics.find((m) => m.key === activeKey) ?? metrics[0],
    [activeKey, metrics],
  );

  const comparison = active ? metricComparison(active) : { text: "Загрузка…", positive: true };

  return (
    <MagicSurface className={`p-5 sm:p-6 ${operatorSurface}`}>
      <header className="mb-4">
        <h2 className="text-base font-bold text-white sm:text-lg">Показатели</h2>
      </header>

      {props.pending || !active ? (
        <div className="flex h-48 items-center justify-center text-sm text-white/40">Загрузка…</div>
      ) : (
        <MetricsBarChart metric={active} className="operator-metrics-chart" />
      )}

      <p
        className={`mt-3 text-sm font-medium ${comparison.positive ? "text-emerald-400" : "text-red-400"}`}
      >
        {comparison.text}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {(props.pending ? [] : metrics).map((metric) => {
          const selected = metric.key === activeKey;
          return (
            <button
              key={metric.key}
              type="button"
              className="group min-w-0 text-left transition"
              onClick={() => setActiveKey(metric.key)}
              aria-pressed={selected}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-[5px] transition ring-offset-2 ring-offset-transparent ${
                    selected ? "ring-2 ring-white/50" : "opacity-80 group-hover:opacity-100"
                  }`}
                  style={{ backgroundColor: metric.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] leading-tight text-white/50">{metric.label}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-white">{formatMetricValue(metric)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </MagicSurface>
  );
}
