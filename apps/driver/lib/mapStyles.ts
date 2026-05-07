// Dark map style — high contrast, everything clearly visible
export const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d0d0d0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#3a3a3a" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c0c0c0" }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e0e0e0" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#2a2a2a" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#b0b0b0" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263e33" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8bc34a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#3a3a3a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#4a4a4a" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c8c8c8" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#212121" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry.fill",
    stylers: [{ color: "#484848" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.fill",
    stylers: [{ color: "#555555" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#666666" }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry.fill",
    stylers: [{ color: "#606060" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#b0b0b0" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#333333" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#c0c0c0" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#1a2733" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9dc2" }],
  },
];

// SVG path for car icon (pointing up)
export const carIconPath = "M12 2C8.13 2 5 5.13 5 9c0 3.25 2.67 7.6 6.17 11.37.35.38.96.38 1.31 0C16.98 16.6 19 12.25 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";

// Vehicle icon SVGs as data URIs - Top-down realistic view
export const vehicleIcons = {
  car: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="26" rx="10" ry="18" fill="rgba(0,0,0,0.3)"/><rect x="14" y="6" width="20" height="36" rx="8" fill="#1a1a1a"/><rect x="16" y="8" width="16" height="10" rx="4" fill="#2d2d2d"/><rect x="17" y="14" width="14" height="6" rx="2" fill="#4a9eff" fill-opacity="0.7"/><rect x="17" y="21" width="14" height="8" rx="2" fill="#252525"/><rect x="17" y="30" width="14" height="5" rx="2" fill="#4a9eff" fill-opacity="0.6"/><rect x="16" y="36" width="16" height="4" rx="2" fill="#2d2d2d"/><rect x="16" y="7" width="4" height="2" rx="1" fill="#ffeb3b"/><rect x="28" y="7" width="4" height="2" rx="1" fill="#ffeb3b"/><rect x="16" y="39" width="4" height="2" rx="1" fill="#ef4444"/><rect x="28" y="39" width="4" height="2" rx="1" fill="#ef4444"/><ellipse cx="12" cy="18" rx="2" ry="1.5" fill="#2d2d2d"/><ellipse cx="36" cy="18" rx="2" ry="1.5" fill="#2d2d2d"/></svg>`)}`,
  motorcycle: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="26" rx="6" ry="16" fill="rgba(0,0,0,0.3)"/><ellipse cx="24" cy="38" rx="5" ry="3" fill="#1a1a1a"/><ellipse cx="24" cy="38" rx="3" ry="2" fill="#333"/><ellipse cx="24" cy="10" rx="5" ry="3" fill="#1a1a1a"/><ellipse cx="24" cy="10" rx="3" ry="2" fill="#333"/><rect x="22" y="12" width="4" height="24" fill="#f59e0b"/><ellipse cx="24" cy="28" rx="4" ry="6" fill="#1a1a1a"/><ellipse cx="24" cy="18" rx="5" ry="4" fill="#f59e0b"/><rect x="16" y="11" width="16" height="2" rx="1" fill="#666"/><circle cx="24" cy="8" r="2" fill="#ffeb3b"/><rect x="22" y="40" width="4" height="2" rx="1" fill="#ef4444"/></svg>`)}`,
  bicycle: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="26" rx="5" ry="14" fill="rgba(0,0,0,0.2)"/><circle cx="24" cy="38" r="5" fill="none" stroke="#333" stroke-width="2"/><circle cx="24" cy="38" r="1" fill="#333"/><circle cx="24" cy="10" r="5" fill="none" stroke="#333" stroke-width="2"/><circle cx="24" cy="10" r="1" fill="#333"/><line x1="24" y1="10" x2="24" y2="38" stroke="#3b82f6" stroke-width="2"/><ellipse cx="24" cy="30" rx="3" ry="2" fill="#1a1a1a"/><rect x="18" y="9" width="12" height="2" rx="1" fill="#666"/></svg>`)}`,
  van: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="26" rx="11" ry="19" fill="rgba(0,0,0,0.3)"/><rect x="12" y="4" width="24" height="40" rx="4" fill="#7c3aed"/><rect x="14" y="6" width="20" height="8" rx="2" fill="#4a9eff" fill-opacity="0.7"/><rect x="14" y="16" width="20" height="20" rx="1" fill="#5b21b6"/><line x1="24" y1="16" x2="24" y2="36" stroke="#4c1d95" stroke-width="1"/><rect x="14" y="5" width="4" height="2" rx="1" fill="#ffeb3b"/><rect x="30" y="5" width="4" height="2" rx="1" fill="#ffeb3b"/><rect x="14" y="41" width="4" height="2" rx="1" fill="#ef4444"/><rect x="30" y="41" width="4" height="2" rx="1" fill="#ef4444"/><ellipse cx="10" cy="10" rx="2" ry="1.5" fill="#7c3aed"/><ellipse cx="38" cy="10" rx="2" ry="1.5" fill="#7c3aed"/></svg>`)}`,
  pickup: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="#10b981" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`)}`,
  dropoff: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`)}`,
};
