import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type HoroscopeDailyResponse =
  | {
      ok: true;
      forName: string;
      sign: string;
      signRu: string;
      date: string;
      period: string;
      horoscope: string;
    }
  | {
      ok: false;
      reason: "no_birthday" | "invalid_birthday" | "birthday_scope_missing";
      message: string;
    };

export async function fetchHoroscopeDaily(): Promise<HoroscopeDailyResponse> {
  const resp = await fetchWithTimeout(`${getApiBase()}/horoscope/daily`, { headers: authHeaders() }, 60_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Гороскоп: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as HoroscopeDailyResponse;
}

const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** `2026-05-15` → `на 15 мая 2026 года`; при нестандартной строке возвращает исходник с префиксом «на ». */
export function formatHoroscopeDateRu(iso: string): string {
  const s = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s ? `на ${s}` : "";
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return s ? `на ${s}` : "";
  return `на ${d} ${MONTHS_GEN[mo - 1]} ${y} года`;
}

/** Без завершающих точек — многоточие в UI анимируется отдельно. */
export const HOROSCOPE_LOADING_PHRASES = [
  "Консультируемся с Венерой",
  "Сатурн задерживает, но это нам только на пользу",
  "Даём ретроградному Меркурию последний шанс",
  "Сквозь хрустальный шар виднеется",
  "Руны складываются в предсказание",
  "Сверяемся с космосом",
  "Настраиваем астрал",
] as const;

/** Случайная фраза при каждом вызове (например при открытии / перезагрузке блока гороскопа). */
export function pickRandomHoroscopeLoadingPhrase(): string {
  const idx = Math.floor(Math.random() * HOROSCOPE_LOADING_PHRASES.length);
  return HOROSCOPE_LOADING_PHRASES[idx]!;
}
