/** Канонический список типов нарушений (совпадает с модалкой «Суммы штрафов»). */
export const VIOLATION_FINE_CATALOG: { type: string; amount: number }[] = [
  { type: "Опоздание", amount: 750 },
  { type: "Звонок (пропущенный)", amount: 750 },
  { type: "Тикет (просроченный)", amount: 750 },
  { type: "Смена (некорректное завершение)", amount: 750 },
  { type: "Запрос (без ответа)", amount: 750 },
  { type: "Запрос (галка)", amount: 750 },
  { type: "СММ (нарушение регламента)", amount: 750 },
  { type: "Телефон (использование)", amount: 750 },
  { type: "Обед (не закрыт: тикет/запрос)", amount: 750 },
  { type: "Перекур (некорректный)", amount: 750 },
  { type: "Бронь (отсутствует)", amount: 750 },
  { type: "Ответственный за ЦУПИС/АФ/ и тд", amount: 750 },
  { type: "Уснул", amount: 1500 },
  { type: "Посторонний контент", amount: 750 },
  { type: "Другое (указать в комментарии)", amount: 500 },
];

export const OTHER_VIOLATION_TYPE = "Другое (указать в комментарии)";

export const VIOLATION_FINE_TYPE_NAMES = VIOLATION_FINE_CATALOG.map((r) => r.type);

export function fineAmountForViolationType(name: string): number | null {
  const row = VIOLATION_FINE_CATALOG.find((r) => r.type === name);
  return row ? row.amount : null;
}
