export type RiskLevel = "critical" | "medium" | "low";
export type RiskFilter = "all" | RiskLevel;

export type TriggerTag = {
  id: string;
  label: string;
  tone: "red" | "amber" | "neutral";
};

export type AtRiskEmployee = {
  id: string;
  name: string;
  initials: string;
  role: string;
  location: string;
  calls: number;
  qualityScore: number;
  qualityDelta: number;
  riskLevel: RiskLevel;
  riskPercent: number;
  triggers: TriggerTag[];
  actionLabel: string;
  actionTone: "red" | "amber" | "teal";
};

export type RetentionRecommendation = {
  id: string;
  level: RiskLevel;
  title: string;
  bullets: string[];
};

export type ReplacementCostItem = {
  id: string;
  label: string;
  amount: number;
  highlight?: boolean;
};

/** KPI сводка (демо). potentialLossRub = сумма REPLACEMENT_COSTS (стоимость замены). */
export const TRIGGERS_SUMMARY = {
  operators: 6,
  atRisk: 3,
  critical: 1,
  avgQuality: 80.5,
  callsToday: 1120,
} as const;

/** Сотрудники с рисками — по макету «Обзор команды». */
export const AT_RISK_EMPLOYEES: AtRiskEmployee[] = [
  {
    id: "1",
    name: "Александр Быстров",
    initials: "АБ",
    role: "1 линия — оператор",
    location: "Ростов-на-Дону",
    calls: 85,
    qualityScore: 58,
    qualityDelta: -14,
    riskLevel: "critical",
    riskPercent: 92,
    triggers: [
      { id: "t1", label: "Падение звонков −35%", tone: "red" },
      { id: "t2", label: "Низкая активность в чате", tone: "amber" },
    ],
    actionLabel: "Срочно",
    actionTone: "red",
  },
  {
    id: "2",
    name: "Анастасия Кузьмина",
    initials: "АК",
    role: "1 линия — оператор",
    location: "Серпухов",
    calls: 95,
    qualityScore: 68,
    qualityDelta: -8,
    riskLevel: "medium",
    riskPercent: 68,
    triggers: [{ id: "t3", label: "Снижение по мониторингу", tone: "amber" }],
    actionLabel: "Чекин",
    actionTone: "amber",
  },
  {
    id: "3",
    name: "Дмитрий Орлов",
    initials: "ДО",
    role: "1 линия — оператор",
    location: "Нижний Новгород",
    calls: 110,
    qualityScore: 75,
    qualityDelta: -5,
    riskLevel: "medium",
    riskPercent: 62,
    triggers: [{ id: "t4", label: "Снижение качества −12%", tone: "amber" }],
    actionLabel: "Чекин",
    actionTone: "amber",
  },
  {
    id: "4",
    name: "Елена Смирнова",
    initials: "ЕС",
    role: "1 линия — оператор",
    location: "Ростов-на-Дону",
    calls: 102,
    qualityScore: 72,
    qualityDelta: -6,
    riskLevel: "medium",
    riskPercent: 58,
    triggers: [{ id: "t5", label: "Рост времени ответа +18%", tone: "amber" }],
    actionLabel: "Чекин",
    actionTone: "amber",
  },
  {
    id: "5",
    name: "Мария Волкова",
    initials: "МВ",
    role: "1 линия — оператор",
    location: "Серпухов",
    calls: 125,
    qualityScore: 88,
    qualityDelta: 3,
    riskLevel: "low",
    riskPercent: 18,
    triggers: [],
    actionLabel: "OK",
    actionTone: "teal",
  },
  {
    id: "6",
    name: "Сергей Морозов",
    initials: "СМ",
    role: "1 линия — оператор",
    location: "Нижний Новгород",
    calls: 118,
    qualityScore: 92,
    qualityDelta: 5,
    riskLevel: "low",
    riskPercent: 12,
    triggers: [],
    actionLabel: "OK",
    actionTone: "teal",
  },
];

export const RETENTION_RECOMMENDATIONS: RetentionRecommendation[] = [
  {
    id: "r1",
    level: "critical",
    title: "Александр Быстров — высокий риск",
    bullets: [
      "Провести 1:1 в течение 24 часов",
      "Обсудить перегруз и падение звонков",
      "Согласовать план восстановления KPI на 2 недели",
    ],
  },
  {
    id: "r2",
    level: "medium",
    title: "Средний риск — группа из 3 человек",
    bullets: [
      "Проверить распределение задач",
      "Предложить ротацию на менее нагруженную линию",
      "Запланировать чекин через 5 рабочих дней",
    ],
  },
];

/** Стоимость замены — лист «Стоимость замены» (демо, с НДС как в макете). */
export const REPLACEMENT_COSTS: ReplacementCostItem[] = [
  { id: "c1", label: "Подбор и рекрутинг", amount: 45_000 },
  { id: "c2", label: "Обучение", amount: 28_000 },
  { id: "c3", label: "Адаптация", amount: 18_000 },
  { id: "c4", label: "Переработки команды", amount: 70_312, highlight: true },
  { id: "c5", label: "Время руководителя", amount: 35_000 },
  { id: "c6", label: "Прочие расходы", amount: 11_000 },
];

/** Увольнения по месяцам, чел. (демо). */
export const CHURN_BY_MONTH = [
  { month: "Янв", value: 1 },
  { month: "Фев", value: 2 },
  { month: "Мар", value: 1 },
  { month: "Апр", value: 3 },
  { month: "Май", value: 2 },
  { month: "Июн", value: 4 },
] as const;

export function replacementCostTotal(items: ReplacementCostItem[]) {
  return items.reduce((sum, i) => sum + i.amount, 0);
}

export function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);
}

export function formatRubInteger(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}
