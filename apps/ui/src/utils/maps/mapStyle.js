// Provider-agnostic basemap style resolution for the public shows map
// (PRD FR-35: tile provider swappable via env vars, no code changes).
//
// Precedence per theme mode:
//   1. VITE_MAP_STYLE_LIGHT / VITE_MAP_STYLE_DARK — a complete MapLibre style
//      URL, used verbatim. This is the switch for the future self-hosted
//      Protomaps/PMTiles-on-R2 stack: point these at our own style JSONs and
//      nothing else changes.
//   2. VITE_PROTOMAPS_API_KEY — builds the Protomaps hosted API style URL
//      (api.protomaps.com, free for non-commercial use; the v1 provider).
//      Glyphs, sprites, and OSM/Protomaps attribution come pre-wired.
//   3. MapLibre demo tiles — keyless, low-detail world map. Dev fallback only,
//      so the page renders without any provisioning; never intended for prod.
const PROTOMAPS_STYLE_URL = 'https://api.protomaps.com/styles/v5';
const DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

export const getMapStyleUrl = (mode) => {
  const explicit = mode === 'light' ? import.meta.env.VITE_MAP_STYLE_LIGHT : import.meta.env.VITE_MAP_STYLE_DARK;
  if (explicit) {
    return explicit;
  }
  const protomapsKey = import.meta.env.VITE_PROTOMAPS_API_KEY;
  if (protomapsKey) {
    const flavor = mode === 'light' ? 'light' : 'dark';
    return `${PROTOMAPS_STYLE_URL}/${flavor}/en.json?key=${protomapsKey}`;
  }
  return DEMO_STYLE_URL;
};

// Symbol layers (cluster counts) can only use fontstacks present in the active
// style's glyphs endpoint. Protomaps styles (and the protomaps-basemaps assets
// a future self-hosted style would use) ship Noto Sans; the MapLibre demo
// fallback only has Open Sans.
export const getMapTextFont = (mode) => {
  const explicit = mode === 'light' ? import.meta.env.VITE_MAP_STYLE_LIGHT : import.meta.env.VITE_MAP_STYLE_DARK;
  if (explicit || import.meta.env.VITE_PROTOMAPS_API_KEY) {
    return ['Noto Sans Medium'];
  }
  return ['Open Sans Semibold'];
};

export default getMapStyleUrl;
