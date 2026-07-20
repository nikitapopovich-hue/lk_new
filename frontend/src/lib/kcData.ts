import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";
import type { KcOfficeLocation } from "./kcOfficeLocations";
import { formatKcCity, formatKcCompany, formatKcLine } from "./kcDisplayFormat";
import type { CareerStep } from "./kcCareerPath";
import { normalizeKcFieldValue } from "./kcFormat";

export type KcEmployeeData = Record<string, string>;

export type KcSubdivisionItem = { id: number; name: string };
export type KcSubdivisionGroup = { department: string; items: KcSubdivisionItem[] };

export type KcEmployeeEdit = {
  department: string;
  subdivision: string;
  line: string;
  company: string;
  city: string;
  fullName: string;
  position: string;
  gradeNew: string;
  emailNew: string;
  phone: string;
  residenceAddress: string;
  telegramUsername: string;
  expressId: string;
  accountNumber: string;
  accountNumberExtra: string;
  telegramId: string;
  onMaternityLeave: boolean;
  isDismissed: boolean;
  birthDate: string;
  firstWorkDay: string;
  accessDate: string;
  photoUrl: string;
  careerPath: CareerStep[];
  extraData: Record<string, string>;
};

export type KcEmployeeRecord = {
  id: number;
  photoUrl: string;
  department: string;
  onMaternityLeave?: boolean;
  isDismissed?: boolean;
  data: KcEmployeeData;
  careerPath?: CareerStep[];
  edit?: KcEmployeeEdit;
};

export type ChromaCardDto = {
  id: number;
  fullName: string;
  city: string;
  line: string;
  position: string;
  telegramUsername: string;
  emailNew: string;
  expressId: string;
  borderColor: string;
  gradient: string;
  image: string;
  department: string;
  subdivision: string;
  onMaternityLeave?: boolean;
  isDismissed?: boolean;
};

export type KcFieldLabel = { key: string; label: string; custom?: boolean };

export type KcDepartmentSection = {
  department: string;
  subdivisions: { name: string; label: string; cards: ChromaCardDto[] }[];
};

export type KcEmployeesResponse = {
  employees: KcEmployeeRecord[];
  cards: ChromaCardDto[];
  fieldLabels: KcFieldLabel[];
  subdivisions: KcSubdivisionGroup[];
  departmentHints: string[];
  subdivisionHints: string[];
  role: string;
  canEdit: boolean;
};

export type KcFieldVisibilityItem = {
  fieldKey: string;
  label: string;
  visibleOperator: boolean;
  visibleSupervisor: boolean;
  custom?: boolean;
};

export type KcCustomFieldDef = {
  fieldKey: string;
  label: string;
};

/** Поля для формы редактирования (суперадмин). */
export const KC_EDIT_FIELDS: {
  key: keyof KcEmployeeEdit;
  label: string;
  kind?: "select-line" | "select-company" | "select-city" | "suggest-department" | "suggest-subdivision" | "text";
}[] = [
  { key: "fullName", label: "ФИО" },
  { key: "department", label: "Отдел", kind: "suggest-department" },
  { key: "subdivision", label: "Подраздел", kind: "suggest-subdivision" },
  { key: "line", label: "Линия", kind: "select-line" },
  { key: "company", label: "Компания", kind: "select-company" },
  { key: "city", label: "Город", kind: "select-city" },
  { key: "position", label: "Должность" },
  { key: "gradeNew", label: "Грейд" },
  { key: "emailNew", label: "E-mail" },
  { key: "phone", label: "Телефон" },
  { key: "residenceAddress", label: "Адрес проживания" },
  { key: "telegramUsername", label: "Имя пользователя в Telegram" },
  { key: "expressId", label: "eXpress id" },
  { key: "accountNumber", label: "Номер счета" },
  { key: "accountNumberExtra", label: "Дополнительный счёт" },
  { key: "telegramId", label: "ID Telegram" },
  { key: "birthDate", label: "Дата рождения" },
  { key: "firstWorkDay", label: "Первый рабочий день" },
  { key: "accessDate", label: "Допуск" },
];

export function formatKcFieldDisplay(key: string, value: string): string {
  const v = normalizeKcFieldValue(key, value);
  if (!v) return "—";
  if (key === "line") return formatKcLine(v) ?? v;
  if (key === "city") return formatKcCity(v) ?? v;
  if (key === "company") return formatKcCompany(v) ?? v;
  if (key === "telegramUsername") {
    return v.startsWith("@") ? v : `@${v.replace(/^@+/, "")}`;
  }
  return v;
}

export type KcResidenceGeoPoint = {
  lat: number;
  lon: number;
  distanceKm: number;
};

export type KcResidenceGeoResult = {
  distances: Record<number, number | null>;
  points: Record<number, KcResidenceGeoPoint>;
  offices: KcOfficeLocation[];
  googleMapsApiKey: string;
};

type KcResidenceDistancesResponse = {
  distances?: Record<string, number | null>;
  points?: Record<string, KcResidenceGeoPoint>;
  offices?: KcOfficeLocation[];
  maps?: { provider?: string; apiKey?: string };
};

export async function fetchKcResidenceGeo(
  items: { employeeId: number; city: string; address: string }[],
): Promise<KcResidenceGeoResult> {
  if (items.length === 0) {
    return { distances: {}, points: {}, offices: [], googleMapsApiKey: "" };
  }
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/employees/residence-distances`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ items }),
    },
    120_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Геоданные адресов: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as KcResidenceDistancesResponse;
  const distances: Record<number, number | null> = {};
  const points: Record<number, KcResidenceGeoPoint> = {};
  for (const [id, km] of Object.entries(data.distances ?? {})) {
    distances[Number(id)] = km;
  }
  for (const [id, pt] of Object.entries(data.points ?? {})) {
    points[Number(id)] = pt;
  }
  return {
    distances,
    points,
    offices: data.offices ?? [],
    googleMapsApiKey: (data.maps?.apiKey ?? "").trim(),
  };
}

export async function fetchKcEmployees(query = ""): Promise<KcEmployeesResponse> {
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const resp = await fetchWithTimeout(`${getApiBase()}/kc-data/employees${qs}`, { headers: authHeaders() }, 20_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Данные КЦ: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as KcEmployeesResponse;
}

export async function deleteKcEmployees(ids: number[]): Promise<number> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/employees/bulk-delete`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ids }),
    },
    20_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удаление: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { deleted?: number };
  return data.deleted ?? ids.length;
}

export async function createKcEmployee(body: KcEmployeeEdit): Promise<KcEmployeeRecord> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/employees`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    20_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Создание: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as KcEmployeeRecord;
}

export async function updateKcEmployee(id: number, body: KcEmployeeEdit): Promise<KcEmployeeRecord> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/employees/${id}`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    20_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Сохранение: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as KcEmployeeRecord;
}

export async function uploadKcEmployeePhoto(id: number, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/employees/${id}/photo`,
    { method: "POST", headers: authHeaders(), body: form },
    60_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Фото: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { photoUrl: string };
  return data.photoUrl;
}

export async function fetchKcFieldVisibility(): Promise<{ items: KcFieldVisibilityItem[]; canEdit: boolean }> {
  const resp = await fetchWithTimeout(`${getApiBase()}/kc-data/field-visibility`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Настройки полей: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as { items: KcFieldVisibilityItem[]; canEdit: boolean };
}

export async function updateKcFieldVisibility(items: KcFieldVisibilityItem[]): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/field-visibility`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ items }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Настройки полей: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function fetchKcCustomFields(): Promise<KcCustomFieldDef[]> {
  const resp = await fetchWithTimeout(`${getApiBase()}/kc-data/custom-fields`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Поля: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { items: KcCustomFieldDef[] };
  return data.items;
}

export async function createKcCustomField(label: string): Promise<KcCustomFieldDef> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/custom-fields`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ label }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Создание поля: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as KcCustomFieldDef;
}

export function groupKcCardsByDepartment(cards: ChromaCardDto[]): KcDepartmentSection[] {
  const deptMap = new Map<string, Map<string, ChromaCardDto[]>>();
  for (const card of cards) {
    const dept = card.department.trim() || "Без отдела";
    const sub = card.subdivision?.trim() || "";
    const subMap = deptMap.get(dept) ?? new Map<string, ChromaCardDto[]>();
    const list = subMap.get(sub) ?? [];
    list.push(card);
    subMap.set(sub, list);
    deptMap.set(dept, subMap);
  }

  return [...deptMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([department, subMap]) => {
      const entries = [...subMap.entries()].sort(([a], [b]) => {
        if (!a) return -1;
        if (!b) return 1;
        return a.localeCompare(b, "ru");
      });
      return {
        department,
        subdivisions: entries.map(([name, deptCards]) => ({
          name,
          label: name || "Без подраздела",
          cards: deptCards,
        })),
      };
    });
}

export async function fetchKcSubdivisions(): Promise<{ groups: KcSubdivisionGroup[]; canEdit: boolean }> {
  const resp = await fetchWithTimeout(`${getApiBase()}/kc-data/subdivisions`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Подразделы: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as { groups: KcSubdivisionGroup[]; canEdit: boolean };
}

export async function createKcSubdivision(department: string, name: string): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/subdivisions`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ department, name }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Создание подраздела: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteKcSubdivision(id: number): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/subdivisions/${id}`,
    { method: "DELETE", headers: authHeaders() },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удаление подраздела: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteKcCustomField(fieldKey: string): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/kc-data/custom-fields/${encodeURIComponent(fieldKey)}`,
    { method: "DELETE", headers: authHeaders() },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Удаление поля: ${resp.status} ${text.slice(0, 200)}`);
  }
}
