import { getEmail } from "./identity";

export type KcTableLayoutPrefs = {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
};

export const KC_TABLE_DEFAULT_COL_WIDTH = 132;
export const KC_TABLE_MIN_COL_WIDTH = 64;
export const KC_TABLE_MAX_COL_WIDTH = 960;

function storageKey(email: string): string {
  const id = (email || "anonymous").trim().toLowerCase();
  return `kc-table-layout:${id}`;
}

export function loadKcTableLayout(email = getEmail()): KcTableLayoutPrefs | null {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return null;
    const data = JSON.parse(raw) as KcTableLayoutPrefs;
    if (!data || typeof data !== "object") return null;
    return {
      order: Array.isArray(data.order) ? data.order.filter((k) => typeof k === "string") : [],
      widths:
        data.widths && typeof data.widths === "object"
          ? Object.fromEntries(
              Object.entries(data.widths).filter(
                ([k, v]) => typeof k === "string" && typeof v === "number" && Number.isFinite(v),
              ),
            )
          : {},
      hidden: Array.isArray(data.hidden) ? data.hidden.filter((k) => typeof k === "string") : [],
    };
  } catch {
    return null;
  }
}

export function saveKcTableLayout(prefs: KcTableLayoutPrefs, email = getEmail()): void {
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(prefs));
  } catch {
    // private mode
  }
}

export function mergeColumnLayout(
  columnKeys: string[],
  prefs: KcTableLayoutPrefs | null,
): { order: string[]; widths: Record<string, number>; hidden: Set<string> } {
  const keySet = new Set(columnKeys);
  const order: string[] = [];
  const seen = new Set<string>();

  for (const key of prefs?.order ?? []) {
    if (keySet.has(key) && !seen.has(key)) {
      order.push(key);
      seen.add(key);
    }
  }
  for (const key of columnKeys) {
    if (!seen.has(key)) {
      order.push(key);
      seen.add(key);
    }
  }

  const widths: Record<string, number> = {};
  for (const key of columnKeys) {
    const saved = prefs?.widths?.[key];
    widths[key] = clampWidth(saved ?? KC_TABLE_DEFAULT_COL_WIDTH);
  }

  const hidden = new Set((prefs?.hidden ?? []).filter((k) => keySet.has(k)));
  const visibleCount = order.filter((k) => !hidden.has(k)).length;
  if (visibleCount === 0 && order.length > 0) {
    hidden.delete(order[0]);
  }

  return { order, widths, hidden };
}

export function clampWidth(value: number): number {
  return Math.min(KC_TABLE_MAX_COL_WIDTH, Math.max(KC_TABLE_MIN_COL_WIDTH, Math.round(value)));
}

/** Отступы: padding ячейки + элементы заголовка (ручка, иконка сортировки). */
const AUTO_FIT_CELL_PADDING = 28;
const AUTO_FIT_HEADER_CHROME = 54;

let measureRoot: HTMLDivElement | null = null;

function getMeasureRoot(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (!measureRoot) {
    measureRoot = document.createElement("div");
    measureRoot.setAttribute("aria-hidden", "true");
    measureRoot.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;z-index:-1;";
    document.body.appendChild(measureRoot);
  }
  return measureRoot;
}

function measureStyledText(
  text: string,
  style: Partial<CSSStyleDeclaration>,
): number {
  const root = getMeasureRoot();
  if (!root || !text) return 0;
  const el = document.createElement("span");
  el.textContent = text;
  el.style.whiteSpace = "nowrap";
  el.style.display = "inline-block";
  Object.assign(el.style, style);
  root.appendChild(el);
  const width = el.getBoundingClientRect().width;
  root.removeChild(el);
  return width;
}

function bodyFontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function measureHeaderLabel(label: string): number {
  const labelWidth = measureStyledText(label, {
    fontSize: "0.68rem",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: bodyFontFamily(),
  });
  const sortWidth = measureStyledText("↕", {
    fontSize: "0.65rem",
    fontFamily: bodyFontFamily(),
  });
  return labelWidth + sortWidth + 6;
}

function measureCellText(text: string): number {
  return measureStyledText(text, {
    fontSize: "0.8rem",
    fontFamily: bodyFontFamily(),
  });
}

/** Подбирает ширину столбцов по заголовку и содержимому видимых строк. */
export function measureAutoFitWidths(
  columnKeys: string[],
  columnLabels: Record<string, string>,
  cellTexts: Record<string, string[]>,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const key of columnKeys) {
    const label = columnLabels[key] ?? key;
    let headerWidth = measureHeaderLabel(label) + AUTO_FIT_HEADER_CHROME;
    let cellWidth = 0;
    for (const text of cellTexts[key] ?? []) {
      const trimmed = (text || "").trim();
      if (!trimmed || trimmed === "—") continue;
      cellWidth = Math.max(cellWidth, measureCellText(trimmed) + AUTO_FIT_CELL_PADDING);
    }
    widths[key] = clampWidth(Math.ceil(Math.max(headerWidth, cellWidth, KC_TABLE_MIN_COL_WIDTH)));
  }
  return widths;
}
