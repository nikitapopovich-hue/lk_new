/** Расшифровка значений полей Л / Г / К для отображения. */

import { normalizeKcCityValue, normalizeKcCompanyValue, normalizeKcLineValue } from "./kcFieldOptions";

const LINE_DISPLAY: Record<string, string> = {
  "1 линия": "Линия 1",
  "2 линия": "Линия 2",
  "2.1 линия": "Линия 2.1",
  "3 линия": "Линия 3",
  "1": "Линия 1",
  "2": "Линия 2",
  "2.1": "Линия 2.1",
  "3": "Линия 3",
};

export function formatKcLine(line: string): string | null {
  const normalized = normalizeKcLineValue(line);
  if (!normalized) return null;
  if (LINE_DISPLAY[normalized]) return LINE_DISPLAY[normalized];
  if (/^линия\s/i.test(normalized)) return normalized;
  return LINE_DISPLAY[normalized.replace(",", ".")] ?? `Линия ${normalized}`;
}

export function formatKcCity(city: string): string | null {
  const raw = normalizeKcCityValue(city);
  if (!raw) return null;
  return raw;
}

export function formatKcCompany(company: string): string | null {
  const raw = normalizeKcCompanyValue(company);
  if (!raw) return null;
  return raw;
}

export function formatKcTelegram(username: string): string | null {
  const raw = username.trim();
  if (!raw) return null;
  return raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
}

export type KcCardCaption = {
  fullName: string;
  cityLine: string | null;
  positionLine: string | null;
  lineLine: string | null;
};

export function buildKcCardCaption(params: {
  fullName: string;
  city?: string;
  position?: string;
  line?: string;
}): KcCardCaption {
  return {
    fullName: params.fullName.trim() || "—",
    cityLine: params.city ? formatKcCity(params.city) : null,
    positionLine: params.position?.trim() || null,
    lineLine: params.line ? formatKcLine(params.line) : null,
  };
}
