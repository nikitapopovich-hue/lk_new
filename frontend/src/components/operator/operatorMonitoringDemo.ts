import type { MonitoringMonthSlide } from "./OperatorMonitoringCard";

function mskMonthSlots(limit = 12): Array<{ year: number; month: number }> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  let year = Number.parseInt(get("year"), 10);
  let month = Number.parseInt(get("month"), 10);
  const out: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < limit; i += 1) {
    out.push({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

/** Демо-карусель мониторинга до подключения API. */
export function buildOperatorMonitoringDemoMonths(): MonitoringMonthSlide[] {
  const base = [81.5, 83.2, 79.8, 85.1, 82.4, 80.6, 84.0, 78.9, 86.2, 81.0, 83.7, 80.2];
  return mskMonthSlots().map((slot, idx) => {
    const points = base[idx % base.length] ?? 81.5;
    const grade = points >= 90 ? "A+" : points >= 82 ? "A" : points >= 74 ? "B" : "C";
    return {
      year: slot.year,
      month: slot.month,
      points,
      grade,
      empty: false,
    };
  });
}
