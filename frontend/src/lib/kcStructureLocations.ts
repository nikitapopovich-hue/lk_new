export const KC_STRUCTURE_LOCATION_CITIES = [
  "Ростов-на-Дону",
  "Серпухов",
  "Нижний Новгород",
  "Орёл",
] as const;

export type KcStructureLocationCity = (typeof KC_STRUCTURE_LOCATION_CITIES)[number];

const COAT_BY_CITY: Record<string, string> = {
  "Ростов-на-Дону": "/kc-structure/coats/rostov.png",
  Серпухов: "/kc-structure/coats/serpukhov.png",
  "Нижний Новгород": "/kc-structure/coats/nizhny-novgorod.png",
  Орёл: "/kc-structure/coats/orel.svg",
};

/** PNG/SVG в public/kc-structure/coats/ — имя файла без расширения. */
export function coatUrlForCity(city: string): string | null {
  const key = city.trim();
  return COAT_BY_CITY[key] ?? null;
}

export function normalizeLocationCity(raw: string): KcStructureLocationCity {
  const v = raw.trim();
  if ((KC_STRUCTURE_LOCATION_CITIES as readonly string[]).includes(v)) {
    return v as KcStructureLocationCity;
  }
  return "Ростов-на-Дону";
}
