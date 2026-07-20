import { useEffect, useMemo, useState } from "react";
import type { KcEmployeeRecord } from "../../lib/kcData";
import type { KcResidenceGeoPoint } from "../../lib/kcData";
import type { KcOfficeLocation } from "../../lib/kcOfficeLocations";
import { formatKcLine } from "../../lib/kcDisplayFormat";
import { normalizeKcCityValue, normalizeKcLineValue } from "../../lib/kcFieldOptions";
import { KC_MAP_FILTER_CITIES } from "../../lib/kcMapCities";
import { KcEmployeesGoogleMap } from "./KcEmployeesGoogleMap";
import { KcEmployeesLeafletMap } from "./KcEmployeesLeafletMap";

type Props = {
  employees: KcEmployeeRecord[];
  points: Record<number, KcResidenceGeoPoint>;
  offices: KcOfficeLocation[];
  loading?: boolean;
  googleMapsApiKey?: string;
  onEmployeeClick: (id: number) => void;
};

function defaultMapCity(employees: KcEmployeeRecord[]): string {
  for (const city of KC_MAP_FILTER_CITIES) {
    if (employees.some((e) => normalizeKcCityValue(e.data.city ?? "") === city)) return city;
  }
  return KC_MAP_FILTER_CITIES[0];
}

export function KcEmployeesMap(props: Props) {
  const apiKey = (props.googleMapsApiKey ?? "").trim();
  const [googleFailed, setGoogleFailed] = useState(false);
  const [lineFilter, setLineFilter] = useState("");
  const [cityFilter, setCityFilter] = useState(() => defaultMapCity(props.employees));

  useEffect(() => {
    setGoogleFailed(false);
  }, [apiKey]);

  const lineOptions = useMemo(() => {
    const values = new Set<string>();
    for (const emp of props.employees) {
      const line = normalizeKcLineValue(emp.data.line ?? "");
      if (line) values.add(line);
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((value) => ({ value, label: formatKcLine(value) ?? value }));
  }, [props.employees]);

  const cityScopedEmployees = useMemo(() => {
    if (!cityFilter) return props.employees;
    return props.employees.filter((e) => normalizeKcCityValue(e.data.city ?? "") === cityFilter);
  }, [props.employees, cityFilter]);

  const filteredEmployees = useMemo(() => {
    if (!lineFilter) return cityScopedEmployees;
    return cityScopedEmployees.filter((e) => normalizeKcLineValue(e.data.line ?? "") === lineFilter);
  }, [cityScopedEmployees, lineFilter]);

  const filteredOffices = useMemo(() => {
    if (!cityFilter) return props.offices;
    return props.offices.filter((o) => o.city === cityFilter);
  }, [props.offices, cityFilter]);

  const mapProps = {
    employees: filteredEmployees,
    points: props.points,
    offices: filteredOffices,
    focusCity: cityFilter,
    loading: props.loading,
    onEmployeeClick: props.onEmployeeClick,
  };

  return (
    <div className="kc-map">
      <div className="kc-map__filters">
        <div className="kc-map__filter">
          <label className="kc-map__filter-label" htmlFor="kc-map-city-filter">
            Город
          </label>
          <select
            id="kc-map-city-filter"
            className="kc-map__filter-select"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          >
            <option value="">Все города</option>
            {KC_MAP_FILTER_CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
        {lineOptions.length > 0 ? (
          <div className="kc-map__filter">
            <label className="kc-map__filter-label" htmlFor="kc-map-line-filter">
              Линия
            </label>
            <select
              id="kc-map-line-filter"
              className="kc-map__filter-select"
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
            >
              <option value="">Все линии</option>
              {lineOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {apiKey && !googleFailed ? (
        <KcEmployeesGoogleMap
          {...mapProps}
          apiKey={apiKey}
          onFallback={() => setGoogleFailed(true)}
        />
      ) : (
        <KcEmployeesLeafletMap {...mapProps} />
      )}
    </div>
  );
}
