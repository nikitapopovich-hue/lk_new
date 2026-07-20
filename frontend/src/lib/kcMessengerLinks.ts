/** Ссылки на мессенджеры для карточки сотрудника. */

export function telegramProfileUrl(username: string): string | null {
  const raw = username.trim().replace(/^@+/, "");
  if (!raw) return null;
  return `https://t.me/${encodeURIComponent(raw)}`;
}

export function expressProfileUrl(expressId: string): string | null {
  const id = expressId.trim();
  if (!id) return null;
  return `https://xlnk.ms/open/profile/${encodeURIComponent(id)}`;
}

/** Открывает черновик письма в Gmail в браузере (mailto в SPA часто не срабатывает). */
export function gmailComposeUrl(email: string): string | null {
  const addr = email.trim();
  if (!addr || !addr.includes("@")) return null;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(addr)}`;
}
