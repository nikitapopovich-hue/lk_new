export type MonitoringTier =
  | "lt71.5"
  | "71.5-72.49"
  | "72.5-73.49"
  | "73.5-74.49"
  | "74.5-75.49"
  | "75.5-76.49"
  | "76.5-77.49"
  | "77.5-78.49"
  | "78.5-79.49"
  | "79.5-80.49"
  | "80.5+";

export type KpdTier =
  | "100-80"
  | "79.9-75"
  | "74.99-70"
  | "69.99-65"
  | "64.99-60"
  | "59.99-55"
  | "54.99-50"
  | "lt50";

export type SlTier = "98+" | "95-97.99" | "lt95";
export type NextReplyTier = "lte3m" | "3-5m" | "gt5m";
export type CsatTier = "0-2" | "3-4" | "5+";
export type FirstReplyTier = "done" | "not_done";
export type ThemesTier = "none" | "1" | "2" | "3" | "gt4";

export type PremiumInputs = {
  monitoring: MonitoringTier;
  kpd: KpdTier;
  sl: SlTier;
  nextReply: NextReplyTier;
  csat: CsatTier;
  firstReply: FirstReplyTier;
  themes: ThemesTier;
  lineHours: number;
  plannedHours: number;
  penalty: number;
};

export type PremiumMetricField = keyof Pick<
  PremiumInputs,
  "monitoring" | "kpd" | "sl" | "nextReply" | "csat" | "firstReply" | "themes"
>;

export type PremiumMetricRow = {
  id: string;
  group?: string;
  label: string;
  hint?: string;
  actualValue: string;
  rateValue: number;
  kind: "amount" | "multiplier";
  field?: PremiumMetricField;
};

export type PremiumCalculation = {
  monitoringAmount: number;
  kpdAmount: number;
  nextReplyAmount: number;
  firstReplyAmount: number;
  baseSum: number;
  slMultiplier: number;
  csatMultiplier: number;
  themesMultiplier: number;
  lineHours: number;
  plannedHours: number;
  hoursFactor: number;
  penalty: number;
  total: number;
  rows: PremiumMetricRow[];
};

const MONITORING_OPTIONS: ReadonlyArray<{ value: MonitoringTier; label: string; amount: number }> = [
  { value: "lt71.5", label: "< 71,5", amount: 0 },
  { value: "71.5-72.49", label: "71,5 – 72,49", amount: 800 },
  { value: "72.5-73.49", label: "72,5 – 73,49", amount: 1600 },
  { value: "73.5-74.49", label: "73,5 – 74,49", amount: 2400 },
  { value: "74.5-75.49", label: "74,5 – 75,49", amount: 3200 },
  { value: "75.5-76.49", label: "75,5 – 76,49", amount: 4000 },
  { value: "76.5-77.49", label: "76,5 – 77,49", amount: 4800 },
  { value: "77.5-78.49", label: "77,5 – 78,49", amount: 5600 },
  { value: "78.5-79.49", label: "78,5 – 79,49", amount: 6400 },
  { value: "79.5-80.49", label: "79,5 – 80,49", amount: 7200 },
  { value: "80.5+", label: "80,5 и выше", amount: 8000 },
];

const KPD_OPTIONS: ReadonlyArray<{ value: KpdTier; label: string; amount: number }> = [
  { value: "100-80", label: "100 – 80", amount: 6000 },
  { value: "79.9-75", label: "79,9 – 75", amount: 5250 },
  { value: "74.99-70", label: "74,99 – 70", amount: 4500 },
  { value: "69.99-65", label: "69,99 – 65", amount: 3750 },
  { value: "64.99-60", label: "64,99 – 60", amount: 3000 },
  { value: "59.99-55", label: "59,99 – 55", amount: 2250 },
  { value: "54.99-50", label: "54,99 – 50", amount: 1500 },
  { value: "lt50", label: "Ниже 50", amount: 0 },
];

const SL_OPTIONS: ReadonlyArray<{ value: SlTier; label: string; multiplier: number }> = [
  { value: "98+", label: "98%+", multiplier: 1 },
  { value: "95-97.99", label: "97,99 – 95%", multiplier: 0.95 },
  { value: "lt95", label: "Ниже 95%", multiplier: 0.9 },
];

const NEXT_REPLY_OPTIONS: ReadonlyArray<{ value: NextReplyTier; label: string; amount: number }> = [
  { value: "lte3m", label: "До 3 мин", amount: 3000 },
  { value: "3-5m", label: "От 3 до 5 мин", amount: 1500 },
  { value: "gt5m", label: "Свыше 5 мин", amount: 0 },
];

const CSAT_OPTIONS: ReadonlyArray<{ value: CsatTier; label: string; multiplier: number }> = [
  { value: "0-2", label: "0 – 2", multiplier: 1 },
  { value: "3-4", label: "3 – 4", multiplier: 0.95 },
  { value: "5+", label: "5+", multiplier: 0.9 },
];

const FIRST_REPLY_OPTIONS: ReadonlyArray<{ value: FirstReplyTier; label: string; amount: number }> = [
  { value: "done", label: "Выполнен", amount: 3000 },
  { value: "not_done", label: "Не выполнен", amount: 0 },
];

const THEMES_OPTIONS: ReadonlyArray<{ value: ThemesTier; label: string; multiplier: number }> = [
  { value: "none", label: "Нет", multiplier: 1 },
  { value: "1", label: "1", multiplier: 0.975 },
  { value: "2", label: "2", multiplier: 0.95 },
  { value: "3", label: "3", multiplier: 0.925 },
  { value: "gt4", label: "Больше 4-х", multiplier: 0.9 },
];

export const PREMIUM_FIELD_OPTIONS = {
  monitoring: MONITORING_OPTIONS,
  kpd: KPD_OPTIONS,
  sl: SL_OPTIONS,
  nextReply: NEXT_REPLY_OPTIONS,
  csat: CSAT_OPTIONS,
  firstReply: FIRST_REPLY_OPTIONS,
  themes: THEMES_OPTIONS,
} as const;

/** Значения по умолчанию для калькулятора. */
export const DEFAULT_PREMIUM_INPUTS: PremiumInputs = {
  monitoring: "80.5+",
  kpd: "74.99-70",
  sl: "98+",
  nextReply: "lte3m",
  csat: "0-2",
  firstReply: "done",
  themes: "none",
  lineHours: 128,
  plannedHours: 160,
  penalty: 0,
};

/** Зафиксированные показатели оператора (позже — из данных руководителя / API). */
export const OPERATOR_PREMIUM_RECORD: PremiumInputs = { ...DEFAULT_PREMIUM_INPUTS };

function pick<T extends { value: string }>(options: readonly T[], value: string): T {
  return options.find((option) => option.value === value) ?? options[0];
}

/** ((C+E+I+M)*G*K*O/R*Q) - P */
export function calculatePremium(inputs: PremiumInputs): PremiumCalculation {
  const monitoring = pick(MONITORING_OPTIONS, inputs.monitoring);
  const kpd = pick(KPD_OPTIONS, inputs.kpd);
  const sl = pick(SL_OPTIONS, inputs.sl);
  const nextReply = pick(NEXT_REPLY_OPTIONS, inputs.nextReply);
  const csat = pick(CSAT_OPTIONS, inputs.csat);
  const firstReply = pick(FIRST_REPLY_OPTIONS, inputs.firstReply);
  const themes = pick(THEMES_OPTIONS, inputs.themes);

  const lineHours = Math.max(0, inputs.lineHours);
  const plannedHours = Math.max(0, inputs.plannedHours);
  const hoursFactor = plannedHours > 0 ? lineHours / plannedHours : 0;
  const penalty = Math.max(0, inputs.penalty);

  const baseSum = monitoring.amount + kpd.amount + nextReply.amount + firstReply.amount;
  const total =
    Math.round(baseSum * sl.multiplier * csat.multiplier * themes.multiplier * hoursFactor) - penalty;

  const rows: PremiumMetricRow[] = [
    {
      id: "monitoring",
      label: "Итоговый мониторинг",
      actualValue: monitoring.label,
      rateValue: monitoring.amount,
      kind: "amount",
      field: "monitoring",
    },
    {
      id: "kpd",
      label: "КПД",
      actualValue: kpd.label,
      rateValue: kpd.amount,
      kind: "amount",
      field: "kpd",
    },
    {
      id: "sl",
      group: "Индивидуальные показатели",
      label: "SL",
      actualValue: sl.label,
      rateValue: sl.multiplier,
      kind: "multiplier",
      field: "sl",
    },
    {
      id: "nextReply",
      label: "Next Reply",
      actualValue: nextReply.label,
      rateValue: nextReply.amount,
      kind: "amount",
      field: "nextReply",
    },
    {
      id: "csat",
      label: "CSAT (низкие оценки)",
      actualValue: csat.label,
      rateValue: csat.multiplier,
      kind: "multiplier",
      field: "csat",
    },
    {
      id: "firstReply",
      group: "Командные показатели",
      label: "First Reply",
      actualValue: firstReply.label,
      rateValue: firstReply.amount,
      kind: "amount",
      field: "firstReply",
    },
    {
      id: "themes",
      label: "Проставление тематик",
      hint: "Недель с незакрытыми тематиками",
      actualValue: themes.label,
      rateValue: themes.multiplier,
      kind: "multiplier",
      field: "themes",
    },
  ];

  return {
    monitoringAmount: monitoring.amount,
    kpdAmount: kpd.amount,
    nextReplyAmount: nextReply.amount,
    firstReplyAmount: firstReply.amount,
    baseSum,
    slMultiplier: sl.multiplier,
    csatMultiplier: csat.multiplier,
    themesMultiplier: themes.multiplier,
    lineHours,
    plannedHours,
    hoursFactor,
    penalty,
    total: Math.max(0, total),
    rows,
  };
}

export function formatPremiumRate(value: number, kind: "amount" | "multiplier"): string {
  if (kind === "amount") {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function formatPremiumRub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
}

export function premiumFieldSelectOptions(field: PremiumMetricField): ReadonlyArray<{ value: string; label: string }> {
  return PREMIUM_FIELD_OPTIONS[field].map((option) => ({
    value: option.value,
    label: option.label,
  }));
}
