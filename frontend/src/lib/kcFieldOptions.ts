/** Значения и подписи для выпадающих списков в карточке сотрудника. */

export const KC_LINE_OPTIONS = [
  { value: "", label: "Отсутствует" },
  { value: "1 линия", label: "1 линия" },
  { value: "2.1 линия", label: "2.1 линия" },
  { value: "2 линия", label: "2 линия" },
  { value: "3 линия", label: "3 линия" },
] as const;

export const KC_COMPANY_OPTIONS = [
  { value: "", label: "—" },
  { value: "Пари", label: "Пари" },
  { value: "Сквилла", label: "Сквилла" },
  { value: "Воксис", label: "Воксис" },
] as const;

export const KC_CITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "Ростов-на-Дону", label: "Ростов-на-Дону" },
  { value: "Серпухов", label: "Серпухов" },
  { value: "Нижний Новгород", label: "Нижний Новгород" },
  { value: "Орёл", label: "Орёл" },
] as const;

const LINE_LEGACY: Record<string, string> = {
  "": "",
  "1": "1 линия",
  "2": "2 линия",
  "2.1": "2.1 линия",
  "3": "3 линия",
};

export function normalizeKcLineValue(raw: string): string {
  const v = raw.trim().replace(",", ".");
  if (!v || v.toLowerCase() === "отсутствует") return "";
  if (KC_LINE_OPTIONS.some((o) => o.value === v)) return v;
  return LINE_LEGACY[v] ?? v;
}

const COMPANY_LEGACY: Record<string, string> = {
  p: "Пари",
  пари: "Пари",
  с: "Сквилла",
  сквилла: "Сквилла",
  в: "Воксис",
  воксис: "Воксис",
};

export function normalizeKcCompanyValue(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (KC_COMPANY_OPTIONS.some((o) => o.value === v)) return v;
  return COMPANY_LEGACY[v.toLowerCase()] ?? v;
}

const CITY_LEGACY: Record<string, string> = {
  с: "Серпухов",
  серпухов: "Серпухов",
  р: "Ростов-на-Дону",
  ростов: "Ростов-на-Дону",
  "ростов-на-дону": "Ростов-на-Дону",
  н: "Нижний Новгород",
  "нижний новгород": "Нижний Новгород",
  о: "Орёл",
  орел: "Орёл",
  "орёл": "Орёл",
};

export function normalizeKcCityValue(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (KC_CITY_OPTIONS.some((o) => o.value === v)) return v;
  return CITY_LEGACY[v.toLowerCase()] ?? v;
}
