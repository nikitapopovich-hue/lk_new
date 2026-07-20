import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

/** Текущий календарный месяц по МСК: с 1-го 00:00 до последнего дня 23:59:59 (для предстоящих событий в месяце). */
export function mskCalendarMonthWindow(): { from: string; to: string } {
  const dtf = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(new Date());
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  const y = get("year");
  const mo = get("month");
  const yNum = parseInt(y, 10);
  const moNum = parseInt(mo, 10);
  const lastDay = new Date(yNum, moNum, 0).getDate();
  const ld = String(lastDay).padStart(2, "0");
  const from = `${y}-${mo}-01T00:00:00+03:00`;
  const to = `${y}-${mo}-${ld}T23:59:59+03:00`;
  return { from, to };
}

/** Максимум событий за один запрос (совпадает с бэкендом `max_results`, верхняя граница API — 50). */
export const CALENDAR_MAX_EVENTS = 25;

export type CalendarEventItem = {
  id: string;
  title: string;
  dateLabel: string;
  start: string;
  end: string;
  htmlLink: string;
  location: string;
};

export async function fetchCalendarEvents(input: {
  from: string;
  to: string;
}): Promise<{ items: CalendarEventItem[]; total: number; hasGoogleCalendar: boolean }> {
  const params = new URLSearchParams({
    time_min: input.from,
    time_max: input.to,
    max_results: String(CALENDAR_MAX_EVENTS),
  });
  const resp = await fetchWithTimeout(
    `${getApiBase()}/calendar/events?${params.toString()}`,
    { headers: authHeaders(), cache: "no-store" },
    30_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      // keep raw text
    }
    throw new Error(`Календарь: ${resp.status} ${detail}`);
  }
  return (await resp.json()) as {
    items: CalendarEventItem[];
    total: number;
    hasGoogleCalendar: boolean;
  };
}
