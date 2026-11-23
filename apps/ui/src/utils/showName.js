// Show name rules (#217). Mirrors control-panel's ShowNames: the show
// subdomain is the name with whitespace removed, lowercased, and becomes a
// hostname label (<subdomain>.remotefalcon.com). The server is the real
// guard; this only shows the error before the user saves.

const ALLOWED = /^[A-Za-z0-9 -]+$/;
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const SHOW_NAME_RULE = 'Letters, numbers, spaces and hyphens only';

// Error message for an invalid name, or null when the name is valid.
export const showNameError = (name) => {
  if (!name || !ALLOWED.test(name)) return SHOW_NAME_RULE;
  const subdomain = name.replace(/\s/g, '').toLowerCase();
  if (subdomain.length > 63) return 'Show name is too long (63 characters max, not counting spaces)';
  if (!DNS_LABEL.test(subdomain)) return 'Show name cannot start or end with a hyphen';
  return null;
};
