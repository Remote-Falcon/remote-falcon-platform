export const JWT_API = {
  secret: 'secret',
  timeout: '30 days'
};

export const BASE_PATH = '';

export const CONTROL_PANEL_PATH = '/control-panel';

export const VERSION = import.meta.env.VITE_VERSION;

const config = {
  fontFamily: `'Roboto', sans-serif`,
  borderRadius: 8,
  outlinedFilled: false,
  navType: 'dark',
  presetColor: 'theme3',
  locale: 'en',
  rtlLayout: false,
  container: true,
  // v2 dashboard sidebar — collapsed = 72px icon rail, expanded = 248px.
  // Persisted via the ConfigContext localStorage key (`rf-config`).
  sidebarCollapsed: false
};

export default config;
