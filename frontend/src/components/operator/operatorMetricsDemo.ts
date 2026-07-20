export type OperatorMetricKey =
  | "nextReply"
  | "firstReply"
  | "sl"
  | "csat"
  | "ahtChats"
  | "ahtCalls";

export type OperatorMetricKind = "duration" | "percent" | "count";

export type OperatorMetricDemo = {
  key: OperatorMetricKey;
  label: string;
  color: string;
  kind: OperatorMetricKind;
  /** false — чем меньше, тем лучше. */
  higherIsBetter: boolean;
  /** Янв … Дек; null — нет данных. */
  monthly: (number | null)[];
};

export const OPERATOR_METRIC_MONTHS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

/** Порог «очень плохо» — красная линия (в тех же единицах, что monthly). */
export const METRIC_BAD_THRESHOLD: Partial<Record<OperatorMetricKey, number>> = {
  nextReply: hmsToSeconds("00:05:00"),
  firstReply: hmsToSeconds("00:10:00"),
  sl: 95,
  csat: 5,
  ahtChats: hmsToSeconds("00:06:00"),
  ahtCalls: hmsToSeconds("00:06:00"),
};

/** Парсинг «ЧЧ:ММ:СС» в секунды. */
export function hmsToSeconds(hms: string): number {
  const [h, m, s] = hms.split(":").map((part) => Number(part));
  return h * 3600 + m * 60 + s;
}

/** 0 = январь, по календарю МСК. */
export function currentMonthIndexMsk(): number {
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", month: "numeric" }).format(
    new Date(),
  );
  return Number.parseInt(month, 10) - 1;
}

function prevMonthIndexMsk(): number {
  return Math.max(0, currentMonthIndexMsk() - 1);
}

/** Демо-данные для блока «Показатели» до подключения API. */
export const OPERATOR_METRICS_DEMO: OperatorMetricDemo[] = [
  {
    key: "nextReply",
    label: "Next Reply",
    color: "#7c6cf0",
    kind: "duration",
    higherIsBetter: false,
    monthly: [
      hmsToSeconds("00:01:17"),
      hmsToSeconds("00:01:25"),
      hmsToSeconds("00:01:36"),
      hmsToSeconds("00:01:23"),
      hmsToSeconds("00:01:15"),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    key: "firstReply",
    label: "First Reply",
    color: "#facc15",
    kind: "duration",
    higherIsBetter: false,
    monthly: [
      hmsToSeconds("00:01:36"),
      hmsToSeconds("00:01:40"),
      hmsToSeconds("00:01:30"),
      hmsToSeconds("00:01:28"),
      hmsToSeconds("00:01:25"),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    key: "sl",
    label: "SL",
    color: "#ef4444",
    kind: "percent",
    higherIsBetter: true,
    monthly: [100, 100, 100, 98, 100, null, null, null, null, null, null, null],
  },
  {
    key: "csat",
    label: "CSAT",
    color: "#22c55e",
    kind: "count",
    higherIsBetter: false,
    monthly: [1, 0, 0, 1, 0, null, null, null, null, null, null, null],
  },
  {
    key: "ahtChats",
    label: "AHT (чаты)",
    color: "#22d3ee",
    kind: "duration",
    higherIsBetter: false,
    monthly: [
      hmsToSeconds("00:02:13"),
      hmsToSeconds("00:02:35"),
      hmsToSeconds("00:03:38"),
      hmsToSeconds("00:02:56"),
      hmsToSeconds("00:02:25"),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
  {
    key: "ahtCalls",
    label: "AHT (звонки)",
    color: "#fb923c",
    kind: "duration",
    higherIsBetter: false,
    monthly: [
      hmsToSeconds("00:03:07"),
      hmsToSeconds("00:02:42"),
      hmsToSeconds("00:03:18"),
      hmsToSeconds("00:03:21"),
      hmsToSeconds("00:03:01"),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  },
];

export const DEFAULT_OPERATOR_METRIC_KEY: OperatorMetricKey = "nextReply";

export type ChartScaleBounds = { min: number; max: number };

export function chartScaleBounds(metric: OperatorMetricDemo): ChartScaleBounds {
  const defined = metric.monthly.filter((v): v is number => v != null);
  const dataMax = defined.length ? Math.max(...defined) : 0;
  const threshold = METRIC_BAD_THRESHOLD[metric.key];

  if (metric.kind === "percent") {
    return { min: 0, max: 100 };
  }
  if (metric.kind === "count") {
    const max = Math.max(5, threshold ?? 5, dataMax);
    return { min: 0, max };
  }
  const max = Math.max(dataMax, threshold ?? 0, 1);
  return { min: 0, max: max * 1.06 };
}

/** @deprecated используйте chartScaleBounds */
export function chartScaleMax(metric: OperatorMetricDemo): number {
  return chartScaleBounds(metric).max;
}

export function metricCurrentValue(metric: OperatorMetricDemo): number {
  return metric.monthly[currentMonthIndexMsk()] ?? 0;
}

export function metricDeltaVsPrevMonth(metric: OperatorMetricDemo): number {
  const curIdx = currentMonthIndexMsk();
  const prevIdx = prevMonthIndexMsk();
  const prev = metric.monthly[prevIdx];
  const cur = metric.monthly[curIdx];
  if (prev == null || cur == null) return 0;
  return cur - prev;
}

export function formatMetricDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDurationDelta(deltaSeconds: number) {
  const sign = deltaSeconds < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(deltaSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatPercentDelta(deltaPp: number) {
  const sign = deltaPp > 0 ? "+" : deltaPp < 0 ? "-" : "";
  const str = Math.abs(deltaPp).toFixed(2).replace(".", ",");
  return `${sign}${str}%`;
}

export function formatCountDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/** Подпись оси Y (компактно). */
export function formatAxisValue(metric: OperatorMetricDemo, value: number) {
  if (metric.kind === "duration") {
    const total = Math.round(value);
    if (total >= 3600) {
      return formatMetricDuration(total);
    }
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (metric.kind === "percent") {
    return `${Math.round(value)}`;
  }
  return String(Math.round(value));
}

export function formatChartValue(metric: OperatorMetricDemo, value: number) {
  if (metric.kind === "duration") {
    return formatMetricDuration(value);
  }
  if (metric.kind === "percent") {
    return `${Math.round(value)}%`;
  }
  return String(Math.round(value));
}

export function formatMetricValue(metric: OperatorMetricDemo) {
  return formatChartValue(metric, metricCurrentValue(metric));
}

export function metricComparison(metric: OperatorMetricDemo): { text: string; positive: boolean } {
  const delta = metricDeltaVsPrevMonth(metric);
  const { kind, higherIsBetter } = metric;

  if (kind === "duration") {
    const positive = delta < 0;
    return {
      text: `${formatDurationDelta(delta)} в сравнении с прошлым месяцем`,
      positive,
    };
  }
  if (kind === "count") {
    const positive = delta < 0;
    return {
      text: `${formatCountDelta(delta)} в сравнении с прошлым месяцем`,
      positive,
    };
  }
  const positive = higherIsBetter ? delta > 0 : delta < 0;
  return {
    text: `${formatPercentDelta(delta)} в сравнении с прошлым месяцем`,
    positive,
  };
}

export function chartAxisTicks(metric: OperatorMetricDemo, bounds: ChartScaleBounds): number[] {
  const { min, max } = bounds;
  if (metric.kind === "percent") {
    return [0, 25, 50, 75, 100];
  }
  if (metric.kind === "count") {
    const top = Math.round(max);
    return Array.from({ length: top + 1 }, (_, i) => i);
  }
  const mid = Math.round((min + max) / 2);
  return [min, mid, max];
}

/** Цвет линии на графике (порог SL — красный пунктир, линия — бирюзовая). */
export function chartSeriesColor(metric: OperatorMetricDemo): string {
  if (metric.key === "sl") {
    return "#00c7b1";
  }
  return metric.color;
}
