import { useEffect, useRef } from "react";
import type { KcEmployeeRecord } from "../../lib/kcData";
import type { KcOfficeLocation } from "../../lib/kcOfficeLocations";
import type { KcResidenceGeoPoint } from "../../lib/kcData";
import { KC_GOOGLE_MAP_DARK_STYLES } from "../../lib/kcGoogleMapStyle";
import { loadGoogleMapsApi } from "../../lib/googleMapsLoader";
import {
  bindEmployeePopupButton,
  buildEmployeeMapPopupHtml,
  buildOfficeMapPopupHtml,
  employeeMarkerLabel,
} from "../../lib/kcMapPopup";
import { KC_MAP_CITY_ZOOM, resolveMapCityCenter } from "../../lib/kcMapCities";
import "./KcEmployeesMap.css";

type Props = {
  apiKey: string;
  employees: KcEmployeeRecord[];
  points: Record<number, KcResidenceGeoPoint>;
  offices: KcOfficeLocation[];
  focusCity?: string;
  loading?: boolean;
  onEmployeeClick: (id: number) => void;
  onFallback?: () => void;
};

function focusGoogleMap(
  map: google.maps.Map,
  offices: KcOfficeLocation[],
  bounds: google.maps.LatLngBounds,
  hasBounds: boolean,
  focusCity: string,
): void {
  if (hasBounds) {
    map.fitBounds(bounds, 48);
    const listener = google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      const zoom = map.getZoom();
      if (zoom != null && zoom > 12) map.setZoom(12);
    });
    void listener;
    return;
  }
  const center = resolveMapCityCenter(offices, focusCity);
  if (center) {
    map.setCenter({ lat: center.lat, lng: center.lon });
    map.setZoom(KC_MAP_CITY_ZOOM);
  }
}

const MARKER_LABEL_STYLE: Pick<google.maps.MarkerLabel, "className" | "fontSize" | "fontWeight"> = {
  className: "kc-gmap-marker-label",
  fontSize: "11px",
  fontWeight: "600",
};

export function KcEmployeesGoogleMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const popupEmployeeIdRef = useRef<number | null>(null);

  const mappedCount = props.employees.filter((e) => props.points[e.id]).length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    void loadGoogleMapsApi(props.apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const initialCenter = resolveMapCityCenter(props.offices, props.focusCity ?? "");
        const map = new google.maps.Map(el, {
          center: initialCenter
            ? { lat: initialCenter.lat, lng: initialCenter.lon }
            : { lat: 47.2271164, lng: 39.6954978 },
          zoom: initialCenter ? KC_MAP_CITY_ZOOM : 5,
          styles: KC_GOOGLE_MAP_DARK_STYLES,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        mapRef.current = map;
        const info = new google.maps.InfoWindow();
        info.addListener("domready", () => {
          const employeeId = popupEmployeeIdRef.current;
          if (employeeId == null) return;
          bindEmployeePopupButton(document, employeeId, () => props.onEmployeeClick(employeeId));
        });
        map.addListener("click", () => {
          info.close();
          popupEmployeeIdRef.current = null;
        });
        infoRef.current = info;
      })
      .catch(() => {
        mapRef.current = null;
        props.onFallback?.();
      });

    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (map) google.maps.event.trigger(map, "resize");
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      infoRef.current?.close();
      infoRef.current = null;
      mapRef.current = null;
    };
  }, [props.apiKey, props.onEmployeeClick]);

  useEffect(() => {
    const map = mapRef.current;
    const info = infoRef.current;
    if (!map || !info) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    for (const office of props.offices) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: office.lat, lng: office.lon },
        title: `Офис — ${office.city}`,
        label: {
          ...MARKER_LABEL_STYLE,
          text: "Офис",
          color: "#e8d4ff",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#753bbd",
          fillOpacity: 0.95,
          strokeColor: "#c4a0ff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        popupEmployeeIdRef.current = null;
        info.setContent(buildOfficeMapPopupHtml(office));
        info.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition()!);
      hasBounds = true;
    }

    for (const emp of props.employees) {
      const pt = props.points[emp.id];
      if (!pt) continue;
      const labelText = employeeMarkerLabel(emp);
      const marker = new google.maps.Marker({
        map,
        position: { lat: pt.lat, lng: pt.lon },
        title: labelText,
        label: {
          ...MARKER_LABEL_STYLE,
          text: labelText,
          color: "#b8fff5",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#00c7b1",
          fillOpacity: 0.85,
          strokeColor: "#00c7b1",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        popupEmployeeIdRef.current = emp.id;
        info.setContent(buildEmployeeMapPopupHtml(emp, pt));
        info.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition()!);
      hasBounds = true;
    }

    focusGoogleMap(map, props.offices, bounds, hasBounds, props.focusCity ?? "");
    return undefined;
  }, [props.employees, props.points, props.offices, props.focusCity, props.onEmployeeClick]);

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
        <span className="kc-map__legend-hint">Карта: Google Maps</span>
        {props.loading ? <span className="kc-map__legend-hint">Геокодирование адресов…</span> : null}
        {!props.loading && mappedCount < props.employees.filter((e) => (e.data.residenceAddress ?? "").trim()).length ? (
          <span className="kc-map__legend-hint">Часть адресов не найдена на карте</span>
        ) : null}
      </div>
      <div ref={containerRef} className="kc-map__canvas kc-map__canvas--google" role="application" aria-label="Карта адресов сотрудников (Google Maps)" />
    </>
  );
}
