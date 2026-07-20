export type OperatorTopKpiDemo = {
  label: string;
  value: number;
  /** Положительное — рост, отрицательное — падение. */
  changePercent: number;
};

/** Демо-показатели оператора до подключения сервисов. */
export const OPERATOR_DEMO_TOP_KPIS: OperatorTopKpiDemo[] = [
  { label: "Принято звонков", value: 148, changePercent: 5 },
  { label: "Обработано чатов", value: 1001, changePercent: 10 },
  { label: "Обработано запросов", value: 2492, changePercent: 3 },
  { label: "Обработано тикетов", value: 167, changePercent: -5 },
];
