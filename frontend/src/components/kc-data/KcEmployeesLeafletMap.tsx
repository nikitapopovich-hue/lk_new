import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { KcEmployeeRecord } from "../../lib/kcData";
import type { KcOfficeLocation } from "../../lib/kcOfficeLocations";
import type { KcResidenceGeoPoint } from "../../lib/kcData";
import {
  bindEmployeePopupButton,
  buildEmployeeMapPopupHtml,
  buildOfficeMapPopupHtml,
  employeeMarkerLabel,
} from "../../lib/kcMapPopup";
import { KC_MAP_CITY_ZOOM, resolveMapCityCenter } from "../../lib/kcMapCities";
import "./KcEmployeesMap.css";

/** Esri Dark Gray — тёмная подложка без ссылки на openstreetmap.org (у OSM в атрибуции отображается флаг). */
const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION = "© Esri, HERE, Garmin, OpenStreetMap contributors, GIS user community";

const MARKER_LABEL_OPTS: L.TooltipOptions = {
  permanent: true,
  direction: "top",
  offset: [0, -8],
  className: "kc-map-marker-label",
};

type Props = {
  employees: KcEmployeeRecord[];
  points: Record<number, KcResidenceGeoPoint>;
  offices: KcOfficeLocation[];
  focusCity?: string;
  loading?: boolean;
  onEmployeeClick: (id: number) => void;
};

function employeeMarker(lat: number, lon: number): L.CircleMarker {
  return L.circleMarker([lat, lon], {
    radius: 7,
    color: "#00c7b1",
    weight: 2,
    fillColor: "#00c7b1",
    fillOpacity: 0.85,
  });
}

function officeMarker(lat: number, lon: number): L.CircleMarker {
  return L.circleMarker([lat, lon], {
    radius: 10,
    color: "#c4a0ff",
    weight: 2,
    fillColor: "#753bbd",
    fillOpacity: 0.95,
  });
}

export function KcEmployeesLeafletMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const mappedCount = props.employees.filter((e) => props.points[e.id]).length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initialCenter = resolveMapCityCenter(props.offices, props.focusCity ?? "");
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
    }).setView(
      initialCenter ? [initialCenter.lat, initialCenter.lon] : [47.2271164, 39.6954978],
      initialCenter ? KC_MAP_CITY_ZOOM : 5,
    );

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 16,
    }).addTo(map);

    map.attributionControl.setPrefix(false);
    map.on("click", () => {
      map.closePopup();
    });

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    for (const office of props.offices) {
      const m = officeMarker(office.lat, office.lon);
      m.on("click", (e) => L.DomEvent.stopPropagation(e));
      m.bindTooltip("Офис", MARKER_LABEL_OPTS);
      m.bindPopup(buildOfficeMapPopupHtml(office));
      m.addTo(layer);
      bounds.push([office.lat, office.lon]);
    }

    for (const emp of props.employees) {
      const pt = props.points[emp.id];
      if (!pt) continue;
      const m = employeeMarker(pt.lat, pt.lon);
      const label = employeeMarkerLabel(emp);
      m.on("click", (e) => L.DomEvent.stopPropagation(e));
      m.bindTooltip(label, MARKER_LABEL_OPTS);
      m.bindPopup(buildEmployeeMapPopupHtml(emp, pt));
      m.on("popupopen", () => {
        const popupEl = m.getPopup()?.getElement();
        if (!popupEl) return;
        bindEmployeePopupButton(popupEl, emp.id, () => props.onEmployeeClick(emp.id));
      });
      m.addTo(layer);
      bounds.push([pt.lat, pt.lon]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
      return;
    }
    const center = resolveMapCityCenter(props.offices, props.focusCity ?? "");
    if (center) {
      map.setView([center.lat, center.lon], KC_MAP_CITY_ZOOM);
    }
  }, [props.employees, props.points, props.offices, props.focusCity, props.onEmployeeClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    window.setTimeout(() => map.invalidateSize(), 80);
  }, [props.loading]);

  return (
    <>
      <div className="kc-map__legend">
        <span className="kc-map__legend-item">
          <span className="kc-map__dot kc-map__dot--employee" aria-hidden />
          Сотрудник ({mappedCount})
        </span>
        <span className="kc-map__legend-item">
          <span className="kc-map__dot kc-map__dot--office" aria-hidden />
          Офис
        </span>
        {props.loading ? <span className="kc-map__legend-hint">Геокодирование адресов…</span> : null}
        {!props.loading && mappedCount < props.employees.filter((e) => (e.data.residenceAddress ?? "").trim()).length ? (
          <span className="kc-map__legend-hint">Часть адресов не найдена на карте</span>
        ) : null}
      </div>
      <div ref={containerRef} className="kc-map__canvas" role="application" aria-label="Карта адресов сотрудников" />
    </>
  );
}
