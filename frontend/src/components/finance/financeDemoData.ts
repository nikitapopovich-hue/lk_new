export type OvertimeRow = { date: string; hours: number; amount: number };
export type ReasonAmountRow = { date: string; reason: string; amount: number };

export type ReferralRow = {
  name: string;
  dept: string;
  maxReward: number;
  /** Фактически начислено за выполненные условия. */
  earnedReward: number;
  done: string[];
  pending: string[];
};

export const DEMO_OVERTIME: OvertimeRow[] = [
  { date: "15.05.2026", hours: 4, amount: 1600 },
  { date: "12.05.2026", hours: 3, amount: 1200 },
  { date: "07.05.2026", hours: 2, amount: 800 },
  { date: "03.05.2026", hours: 4, amount: 1600 },
  { date: "01.05.2026", hours: 1, amount: 400 },
];

export const DEMO_BONUSES: ReasonAmountRow[] = [
  { date: "10.05.2026", reason: "Банк идей", amount: 10000 },
  { date: "05.05.2026", reason: "Помог с переездом", amount: 2000 },
  { date: "02.05.2026", reason: "Квартальный тест", amount: 2000 },
  { date: "01.05.2025", reason: "За подготовку транспаранта к 1 Мая", amount: 3000 },
];

export const DEMO_RECALCULATIONS: ReasonAmountRow[] = [
  { date: "08.05.2026", reason: "Перерасчёт премии за апрель", amount: 1500 },
  { date: "03.05.2026", reason: "Корректировка KPI (март)", amount: -800 },
  { date: "28.04.2026", reason: "Доначисление за переработку", amount: 400 },
];

export const DEMO_FINES: ReasonAmountRow[] = [
  { date: "14.05.2026", reason: "Опоздал на смену", amount: -1000 },
  { date: "06.05.2026", reason: "Пропустил звонок", amount: -500 },
  { date: "04.05.2026", reason: "Опоздал на смену", amount: -500 },
  { date: "03.05.2026", reason: "Курил вейп в слип-боксе", amount: -300 },
];

export const DEMO_REFERRALS: ReferralRow[] = [
  {
    name: "Бондарь Есения",
    dept: "Служба поддержки",
    maxReward: 10000,
    earnedReward: 10000,
    done: ["Сдал итоговый тест на 75+ баллов", "Отработал 3 месяца"],
    pending: ["Прошёл испытательный срок"],
  },
  {
    name: "Будникова Таисия",
    dept: "Служба поддержки",
    maxReward: 5000,
    earnedReward: 5000,
    done: ["Сдал итоговый тест на 75+ баллов"],
    pending: ["Отработал 3 месяца", "Прошёл испытательный срок"],
  },
  {
    name: "Киселева Ксения",
    dept: "Служба поддержки",
    maxReward: 5000,
    earnedReward: 0,
    done: [],
    pending: ["Сдал итоговый тест на 75+ баллов", "Отработал 3 месяца", "Прошёл испытательный срок"],
  },
];

export const LIST_PREVIEW_LIMIT = 3;
