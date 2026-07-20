/** Ссылка на поиск адреса в Яндекс.Картах. */
export function yandexMapsSearchUrl(address: string): string {
  const q = (address || "").trim();
  if (!q) return "https://yandex.ru/maps/";
  return `https://yandex.ru/maps/?text=${encodeURIComponent(q)}`;
}

/** Полный адрес для карт: город + адрес проживания, если город не в строке. */
export function buildResidenceMapQuery(city: string, address: string): string {
  const addr = (address || "").trim();
  if (!addr) return "";
  const cityNorm = (city || "").trim();
  if (cityNorm && !addr.toLowerCase().includes(cityNorm.toLowerCase())) {
    return `${cityNorm}, ${addr}`;
  }
  return addr;
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return "—";
  const text = km.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text} км`;
}
