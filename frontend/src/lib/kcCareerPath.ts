import { formatKcDateString, normalizeKcFieldValue } from "./kcFormat";

export type CareerStep = {
  id: string;
  date: string;
  title: string;
  department: string;
  subdivision: string;
  note: string;
};

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : `s${Date.now().toString(36)}`;
}

export function emptyCareerStep(): CareerStep {
  return { id: newId(), date: "", title: "", department: "", subdivision: "", note: "" };
}

function parseDateKey(date: string): number {
  const text = formatKcDateString(date);
  const parts = text.split(".");
  if (parts.length !== 3) return Number.MAX_SAFE_INTEGER;
  const [d, mo, y] = parts.map((p) => Number(p));
  if (!y || !mo || !d) return Number.MAX_SAFE_INTEGER;
  return y * 10000 + mo * 100 + d;
}

function isEmptyDate(date: string): boolean {
  return !formatKcDateString(date).trim();
}

/** Просмотр: последний переход сверху. */
export function sortCareerStepsNewestFirst(steps: CareerStep[]): CareerStep[] {
  return [...steps].sort((a, b) => parseDateKey(b.date) - parseDateKey(a.date));
}

/** Редактирование: от раннего к позднему; пустые этапы всегда внизу, без «прыжков». */
export function sortCareerStepsForEdit(steps: CareerStep[]): CareerStep[] {
  return steps
    .map((s, index) => ({ s, index }))
    .sort((a, b) => {
      const aEmpty = isEmptyDate(a.s.date);
      const bEmpty = isEmptyDate(b.s.date);
      if (aEmpty && bEmpty) return a.index - b.index;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const diff = parseDateKey(a.s.date) - parseDateKey(b.s.date);
      if (diff !== 0) return diff;
      return a.index - b.index;
    })
    .map(({ s }) => s);
}

/** @deprecated use sortCareerStepsNewestFirst */
export function sortCareerSteps(steps: CareerStep[]): CareerStep[] {
  return sortCareerStepsNewestFirst(steps);
}

export function normalizeCareerStep(raw: Partial<CareerStep>): CareerStep | null {
  const date = formatKcDateString(raw.date ?? "");
  const title = (raw.title ?? "").trim();
  const department = (raw.department ?? "").trim();
  const subdivision = (raw.subdivision ?? "").trim();
  const note = (raw.note ?? "").trim();
  if (!date && !title && !department && !subdivision && !note) return null;
  return {
    id: (raw.id ?? "").trim() || newId(),
    date,
    title,
    department,
    subdivision,
    note,
  };
}

export function normalizeCareerSteps(steps: CareerStep[]): CareerStep[] {
  const out: CareerStep[] = [];
  for (const s of steps) {
    const n = normalizeCareerStep(s);
    if (n) out.push(n);
  }
  return out;
}

/** Просмотр: новые этапы сверху (обратный порядок хранения: ранний → поздний). */
export function careerStepsForView(steps: CareerStep[]): CareerStep[] {
  if (steps.length <= 1) return [...steps];
  return [...steps].reverse();
}

export function reorderCareerSteps(steps: CareerStep[], fromId: string, toId: string): CareerStep[] {
  const fromIdx = steps.findIndex((s) => s.id === fromId);
  const toIdx = steps.findIndex((s) => s.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return steps;
  const next = [...steps];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function parseCareerPathFromEmployee(
  careerPath: CareerStep[] | undefined,
  legacyDate?: string,
): CareerStep[] {
  if (careerPath?.length) {
    return careerPath
      .map((s) => normalizeCareerStep(s))
      .filter((s): s is CareerStep => s != null);
  }
  const legacy = legacyDate ? formatKcDateString(legacyDate) : "";
  if (!legacy) return [];
  return [
    {
      id: newId(),
      date: legacy,
      title: "Переход / повышение",
      department: "",
      subdivision: "",
      note: "",
    },
  ];
}

/** Подсказка для поля даты в форме */
export function formatCareerDateInput(value: string): string {
  return normalizeKcFieldValue("birthDate", value);
}
