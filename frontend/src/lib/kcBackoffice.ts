/** Ссылка на карточку клиента в backoffice. */
export function kcBackofficeClientUrl(accountNumber: string): string | null {
  const n = (accountNumber || "").trim();
  if (!n) return null;
  return `https://backoffice.pbsvc.bz/clients/${encodeURIComponent(n)}/general`;
}
