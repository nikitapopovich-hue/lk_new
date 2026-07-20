/** Тёмная подложка в духе дашборда ЛК. */
export const KC_GOOGLE_MAP_DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1538" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b93b0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0f24" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a3358" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#122a2a" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2444" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2a3358" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#243056" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#060b22" }] },
];
