export type KpdMoodKey = "excellent" | "good" | "neutral" | "bad" | "veryBad";

export type KpdMood = {
  key: KpdMoodKey;
  label: string;
  color: string;
  ringColor: string;
};

const MOODS: KpdMood[] = [
  { key: "excellent", label: "Отлично", color: "#00c7b1", ringColor: "#00c7b1" },
  { key: "good", label: "Хорошо", color: "#34d399", ringColor: "#2dd4bf" },
  { key: "neutral", label: "Нейтрально", color: "#fbbf24", ringColor: "#f59e0b" },
  { key: "bad", label: "Плохо", color: "#fb923c", ringColor: "#f97316" },
  { key: "veryBad", label: "Очень плохо", color: "#f87171", ringColor: "#ef4444" },
];

export function kpdMoodFromPercent(percent: number): KpdMood {
  if (percent >= 90) return MOODS[0];
  if (percent >= 75) return MOODS[1];
  if (percent >= 60) return MOODS[2];
  if (percent >= 40) return MOODS[3];
  return MOODS[4];
}

/** Доля заполнения кольца мониторинга по категории (A+ … D). */
export function monitoringGradeProgress(grade: string): number {
  const g = grade.trim().toUpperCase();
  if (g === "A+") return 100;
  if (g === "A") return 85;
  if (g === "B") return 65;
  if (g === "C") return 45;
  if (g === "D") return 25;
  return 70;
}

/**
 * Цвет кольца мониторинга: A+ — бирюза (как на сайте), ниже — плавный уход в тёплый красный.
 * A+ выше похвал; A — отлично; B — неплохо; C — плохо; D — ужасно.
 */
export function monitoringGradeColor(grade: string | null | undefined, empty = false): string {
  if (empty) return "rgba(255, 255, 255, 0.14)";
  const g = (grade ?? "D").trim().toUpperCase();
  if (g === "A+") return "#00c7b1";
  if (g === "A") return "#1dbfaa";
  if (g === "B") return "#6fbf7d";
  if (g === "C") return "#e8954a";
  if (g === "D") return "#e0636f";
  return "#94a3b8";
}
