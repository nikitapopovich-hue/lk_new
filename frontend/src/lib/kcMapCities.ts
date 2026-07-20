import type { KcOfficeLocation } from "./kcOfficeLocations";

/** Города для фильтра на карте Данных КЦ. */
export const KC_MAP_FILTER_CITIES = [
  "Ростов-на-Дону",
  "Серпухов",
  "Нижний Новгород",
] as const;

export type KcMapFilterCity = (typeof KC_MAP_FILTER_CITIES)[number];

export const KC_MAP_CITY_ZOOM = 11;

export const KC_MAP_CITY_CENTERS: Record<KcMapFilterCity, { lat: number; lon: number }> = {
  "Ростов-на-Дону": { lat: 47.2271164, lon: 39.6954978 },
  Серпухов: { lat: 54.9153065, lon: 37.4141958 },
  "Нижний Новгород": { lat: 56.3390486, lon: 43.9475408 },
};

export function resolveMapCityCenter(
  offices: KcOfficeLocation[],
  city: string,
): { lat: number; lon: number } | undefined {
  if (!city) return undefined;
  const office = offices.find((o) => o.city === city);
  if (office) return { lat: office.lat, lon: office.lon };
  if (city in KC_MAP_CITY_CENTERS) {
    return KC_MAP_CITY_CENTERS[city as KcMapFilterCity];
  }
  return undefined;
}
