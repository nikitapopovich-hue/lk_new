import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  detailBody?: string | null;
  createdAt: string;
  read: boolean;
};

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const resp = await fetchWithTimeout(`${getApiBase()}/notifications`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Оповещения: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { items?: NotificationItem[] };
  return data.items ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/notifications/read`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Не удалось отметить прочитанным: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/notifications/read-all`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Не удалось отметить все: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteArchivedNotifications(ids: string[]): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/notifications/archive/delete`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Не удалось удалить: ${resp.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteAllArchivedNotifications(): Promise<void> {
  const resp = await fetchWithTimeout(
    `${getApiBase()}/notifications/archive/delete-all`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    },
    15_000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Не удалось удалить все: ${resp.status} ${text.slice(0, 200)}`);
  }
}
