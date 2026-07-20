export type KpiPeriodKey = "day" | "week" | "month" | "year";

export const KPI_PERIOD_OPTIONS: { value: KpiPeriodKey; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

function mskNowParts() {
  const dtf = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function mskWeekdayIndex(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", weekday: "short" }).format(new Date());
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

function addDaysYmd(y: number, mo: number, d: number, delta: number): { y: number; mo: number; d: number } {
  const utc = Date.UTC(y, mo - 1, d + delta);
  const dt = new Date(utc);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Интервал по МСК для верхних KPI-плиток оператора. */
export function mskKpiPeriod(key: KpiPeriodKey): { from: string; to: string; tz: string; label: string } {
  const p = mskNowParts();
  const y = Number.parseInt(p.year, 10);
  const mo = Number.parseInt(p.month, 10);
  const d = Number.parseInt(p.day, 10);
  const to = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+03:00`;

  if (key === "day") {
    return {
      from: `${p.year}-${p.month}-${p.day}T00:00:00+03:00`,
      to,
      tz: "Europe/Moscow",
      label: "за сегодня",
    };
  }

  if (key === "week") {
    const monday = addDaysYmd(y, mo, d, -mskWeekdayIndex());
    return {
      from: `${monday.y}-${pad2(monday.mo)}-${pad2(monday.d)}T00:00:00+03:00`,
      to,
      tz: "Europe/Moscow",
      label: "за неделю",
    };
  }

  if (key === "year") {
    return {
      from: `${p.year}-01-01T00:00:00+03:00`,
      to,
      tz: "Europe/Moscow",
      label: "за год",
    };
  }

  return {
    from: `${p.year}-${p.month}-01T00:00:00+03:00`,
    to,
    tz: "Europe/Moscow",
    label: "за месяц",
  };
}

/** Текущий календарный месяц по МСК (остальные блоки дашборда). */
export function mskMonthToDatePeriod() {
  const p = mskNowParts();
  const from = `${p.year}-${p.month}-01T00:00:00+03:00`;
  const to = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+03:00`;
  return { from, to, tz: "Europe/Moscow", label: `${p.month}.${p.year} (МСК)` };
}
