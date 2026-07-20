export type KpdRunStatus = "success" | "failed";
export type KpdRunMode = "auto" | "hybrid" | "manual";

export type KpdCalculationRow = {
  id: string;
  period: string;
  isLatest?: boolean;
  status: KpdRunStatus;
  mode: KpdRunMode;
  pipeline: string;
  completedAt: string;
  operators: number;
  version: string;
};

export const KPD_MOCK_CALCULATIONS: KpdCalculationRow[] = [
  {
    id: "1",
    period: "Май 2026",
    isLatest: true,
    status: "failed",
    mode: "auto",
    pipeline: "strict",
    completedAt: "01.06.2026 04:38",
    operators: 0,
    version: "",
  },
  {
    id: "2",
    period: "Апрель 2026",
    status: "success",
    mode: "hybrid",
    pipeline: "lenient",
    completedAt: "01.05.2026 05:12",
    operators: 59,
    version: "",
  },
  {
    id: "3",
    period: "Март 2026",
    status: "success",
    mode: "manual",
    pipeline: "strict",
    completedAt: "01.04.2026 04:55",
    operators: 51,
    version: "",
  },
  {
    id: "4",
    period: "Февраль 2026",
    status: "success",
    mode: "auto",
    pipeline: "lenient",
    completedAt: "01.03.2026 05:01",
    operators: 62,
    version: "",
  },
  {
    id: "5",
    period: "Январь 2026",
    status: "success",
    mode: "hybrid",
    pipeline: "strict",
    completedAt: "01.02.2026 04:47",
    operators: 58,
    version: "",
  },
];

export type KpdUploadSlot = {
  id: string;
  label: string;
  hint: string;
};

export const KPD_UPLOAD_SLOTS: KpdUploadSlot[] = [
  { id: "uis-incoming", label: "uis/incoming", hint: ".csv" },
  { id: "usedesk-smm", label: "usedesk/smm", hint: ".csv" },
  { id: "anysvc-part1", label: "anysvc/part1", hint: ".xlsx" },
  { id: "anysvc-part2", label: "anysvc/part2", hint: ".xlsx" },
  { id: "hr-attendance", label: "hr/attendance", hint: ".csv" },
  { id: "quality-scores", label: "quality/scores", hint: ".xlsx" },
  { id: "refs/operators", label: "refs/operators", hint: ".csv" },
];
