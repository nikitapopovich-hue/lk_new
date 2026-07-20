/** Форматирование значений полей карточки сотрудника для отображения и ввода. */

const DATE_KEYS = new Set(["birthDate", "firstWorkDay", "accessDate"]);
const INTEGER_LIKE_KEYS = new Set(["accountNumber", "accountNumberExtra", "telegramId"]);
const GRADE_KEYS = new Set(["gradeNew"]);
const ISO_DATETIME_GRADE = /^\d{4}-\d{1,2}-\d{1,2}(\s|T)/;

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const DMY_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/;
const TRAILING_ZERO = /^\d+\.0+$/;

export function formatKcDateString(raw: string): string {
  let text = raw.trim();
  if (!text) return "";
  if (text.includes(" ")) text = text.split(" ", 1)[0] ?? text;
  if (text.includes("T")) text = text.split("T", 1)[0] ?? text;

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    return `${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`;
  }

  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const y = Number(dmy[3]);
    return `${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`;
  }

  return text;
}

export function formatGradeString(raw: string): string {
  const text = raw.trim().replace(",", ".");
  if (!text) return "";
  if (ISO_DATETIME_GRADE.test(text)) return "";
  return text;
}

export function stripIntegerDecimalNoise(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (TRAILING_ZERO.test(text)) return text.split(".", 1)[0] ?? text;
  return text;
}

export function normalizeKcFieldValue(fieldKey: string, value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (DATE_KEYS.has(fieldKey)) return formatKcDateString(text);
  if (INTEGER_LIKE_KEYS.has(fieldKey)) return stripIntegerDecimalNoise(text);
  if (GRADE_KEYS.has(fieldKey)) return formatGradeString(text);
  return text;
}
