import type { ChromaCardDto, KcEmployeeRecord } from "./kcData";
import { formatKcFieldDisplay } from "./kcData";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreHaystack(hay: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (hay === token) score += 120;
    else if (hay.startsWith(token)) score += 80;
    else if (hay.split(" ").some((w) => w.startsWith(token))) score += 55;
    else if (hay.includes(token)) score += 30;
  }
  return score;
}

function employeeHaystack(emp: KcEmployeeRecord): string {
  const parts = [
    emp.data.fullName,
    emp.department,
    emp.data.subdivision,
    emp.data.line,
    emp.data.company,
    emp.data.city,
    emp.data.position,
    emp.data.emailNew,
    emp.data.phone,
    emp.data.telegramUsername,
    emp.data.expressId,
    ...Object.values(emp.data),
  ];
  return normalize(parts.filter(Boolean).join(" "));
}

export function rankEmployeesByQuery(
  employees: KcEmployeeRecord[],
  query: string,
): KcEmployeeRecord[] {
  const q = normalize(query);
  if (!q) return employees;
  const tokens = q.split(" ").filter(Boolean);
  return [...employees]
    .map((emp) => ({ emp, score: scoreHaystack(employeeHaystack(emp), tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.emp.data.fullName.localeCompare(b.emp.data.fullName, "ru"))
    .map((x) => x.emp);
}

export function filterCardsByEmployeeIds(cards: ChromaCardDto[], ids: Set<number>): ChromaCardDto[] {
  return cards.filter((c) => ids.has(c.id));
}

export function getCellSortValue(emp: KcEmployeeRecord, key: string): string {
  if (key === "department") return emp.department;
  const raw = emp.data[key] ?? "";
  return formatKcFieldDisplay(key, raw).replace(/—/g, "");
}
