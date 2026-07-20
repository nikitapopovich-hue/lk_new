import type { KcEmployeeRecord } from "./kcData";
import type { KcResidenceGeoPoint } from "./kcData";
import type { KcOfficeLocation } from "./kcOfficeLocations";
import { buildResidenceMapQuery, formatDistanceKm, yandexMapsSearchUrl } from "./kcMaps";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function employeeMarkerLabel(emp: KcEmployeeRecord): string {
  const name = (emp.data.fullName ?? "").trim();
  return name || "Сотрудник";
}

export function buildEmployeeMapPopupHtml(
  emp: KcEmployeeRecord,
  pt: KcResidenceGeoPoint,
): string {
  const address = emp.data.residenceAddress ?? "";
  const city = emp.data.city ?? "";
  const mapUrl = yandexMapsSearchUrl(buildResidenceMapQuery(city, address) || address);
  const dist = formatDistanceKm(pt.distanceKm);
  const name = escapeHtml(emp.data.fullName || "—");
  const cityHtml = city ? `${escapeHtml(city)}<br/>` : "";
  const addressHtml = address ? `<span>${escapeHtml(address)}</span><br/>` : "";

  return (
    `<div class="kc-map-popup">` +
    `<strong class="kc-map-popup__title">${name}</strong>` +
    `${cityHtml}` +
    `${addressHtml}` +
    `<span class="kc-map-popup__meta">До офиса: ${escapeHtml(dist)}</span>` +
    `<div class="kc-map-popup__actions">` +
    `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer" class="kc-map-popup__link">Яндекс.Карты</a>` +
    `<button type="button" class="kc-map-popup__btn" data-kc-open-employee="${emp.id}">Открыть карточку сотрудника</button>` +
    `</div>` +
    `</div>`
  );
}

export function buildOfficeMapPopupHtml(office: KcOfficeLocation): string {
  return (
    `<div class="kc-map-popup">` +
    `<strong class="kc-map-popup__title">Офис — ${escapeHtml(office.city)}</strong>` +
    `<span>${escapeHtml(office.address)}</span>` +
    `</div>`
  );
}

export function bindEmployeePopupButton(root: ParentNode, employeeId: number, onOpen: () => void): void {
  const btn = root.querySelector<HTMLButtonElement>(`[data-kc-open-employee="${employeeId}"]`);
  if (!btn || btn.dataset.kcBound === "1") return;
  btn.dataset.kcBound = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  });
}
