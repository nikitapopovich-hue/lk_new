import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type ProfileRemoteWork = {
  homeAddress: string;
  internetProvider: string;
  patchCordLength: string;
  hasPcLaptop: string;
  canWorkProgramsHome: string;
  internetAccess: string;
  hasHeadset: string;
};

export type ProfileSubscriptions = {
  bonuses: boolean;
  overtime: boolean;
  newFines: boolean;
  recalculations: boolean;
  monitoring: boolean;
  kpd: boolean;
  all: boolean;
};

export type EmployeeProfile = {
  email: string;
  remoteWork: ProfileRemoteWork;
  subscriptions: ProfileSubscriptions;
};

export const PROFILE_SELECT_OPTIONS = [
  { value: "", label: "Выберите" },
  { value: "yes", label: "Да" },
  { value: "no", label: "Нет" },
] as const;

export const INTERNET_ACCESS_OPTIONS = [
  { value: "wifi", label: "Wi-Fi" },
  { value: "cable", label: "Кабель" },
  { value: "no", label: "Нет" },
] as const;

export type ProfileSelectOption = { value: string; label: string };

/** Поля раздела «Удалённая работа» в профиле (порядок как на экране). */
export const REMOTE_WORK_FIELDS: {
  key: keyof ProfileRemoteWork;
  label: string;
  kind: "text" | "select";
  options?: readonly ProfileSelectOption[];
}[] = [
  { key: "homeAddress", label: "Домашний адрес", kind: "text" },
  { key: "internetProvider", label: "Провайдер", kind: "text" },
  { key: "patchCordLength", label: "Длина шнура (патчкорд)", kind: "text" },
  { key: "hasPcLaptop", label: "Наличие дома ПК/ноутбука", kind: "select" },
  { key: "canWorkProgramsHome", label: "Возможность работы на рабочих программах дома с ПК", kind: "select" },
  {
    key: "internetAccess",
    label: "Возможность доступа в интернет (Wi-Fi/кабель)",
    kind: "select",
    options: INTERNET_ACCESS_OPTIONS,
  },
  { key: "hasHeadset", label: "Наличие гарнитуры для работы на линии", kind: "select" },
];

export type RemoteWorkStatus = "empty" | "filled" | "stale";

export type RemoteWorkListItem = {
  email: string;
  fullName: string;
  department: string;
  remoteWork: ProfileRemoteWork;
  updatedAt: string | null;
  status: RemoteWorkStatus;
};

export function remoteWorkStatusLabel(status: RemoteWorkStatus): string {
  if (status === "filled") return "Заполнено";
  if (status === "stale") return "Требуется актуализация";
  return "Не заполнено";
}

export function remoteWorkStatusClass(status: RemoteWorkStatus): string {
  if (status === "filled") return "bg-pari-500/20 text-pari-200";
  return "bg-red-500/20 text-red-200";
}

export function formatProfileSelectValue(value: string, options: readonly ProfileSelectOption[] = PROFILE_SELECT_OPTIONS): string {
  const hit = options.find((o) => o.value === value);
  if (hit && hit.value) return hit.label;
  return value.trim() || "—";
}

export function isRemoteWorkFieldFilled(_key: keyof ProfileRemoteWork, value: string): boolean {
  return value.trim() !== "";
}

export function getRemoteWorkMissingFields(remoteWork: ProfileRemoteWork): string[] {
  return REMOTE_WORK_FIELDS.filter((f) => !isRemoteWorkFieldFilled(f.key, remoteWork[f.key])).map((f) => f.label);
}

export function isRemoteWorkComplete(remoteWork: ProfileRemoteWork): boolean {
  return getRemoteWorkMissingFields(remoteWork).length === 0;
}

export function formatRemoteWorkFieldValue(key: keyof ProfileRemoteWork, value: string): string {
  const field = REMOTE_WORK_FIELDS.find((f) => f.key === key);
  if (field?.kind === "select" && field.options) {
    return formatProfileSelectValue(value, field.options);
  }
  if (field?.kind === "select") {
    return formatProfileSelectValue(value);
  }
  return value.trim() || "—";
}

export async function fetchRemoteWorkList(): Promise<RemoteWorkListItem[]> {
  const resp = await fetchWithTimeout(`${getApiBase()}/profile/remote-work`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удалённая работа: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { items: RemoteWorkListItem[] };
  return data.items ?? [];
}

export async function fetchEmployeeProfile(): Promise<EmployeeProfile> {
  const resp = await fetchWithTimeout(`${getApiBase()}/profile`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Профиль: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as EmployeeProfile;
}

export async function updateEmployeeProfile(patch: {
  remoteWork?: ProfileRemoteWork;
  subscriptions?: ProfileSubscriptions;
}): Promise<EmployeeProfile> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/profile`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Профиль: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as EmployeeProfile;
}
