// Shared helpers for standalone ESP/HTML generators.
// Ensures both sides (HTML frontend running on ESP captive page and ESP8266/ESP32
// webserver routes) never drift apart on id formatting, endpoint naming, or
// HTML escaping.

/**
 * Sanitize a widget id so it is safe to embed in C identifiers, JS object keys,
 * function names, HTML element ids, and URL path segments.
 * Replaces any character that is NOT [a-zA-Z0-9_-] with underscore.
 *
 * @param {string|number} id
 * @returns {string}
 */
export const sanitizeWidgetId = (id) =>
  String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Build the canonical endpoint URL for a widget.
 * Both HTML generator and ESP generator MUST call this so the client-side
 * fetch URL matches the server.on() route exactly.
 *
 * @param {{type: string, id: string|number}} ctrl
 * @returns {string}  e.g. "/joystick_full/w_1712345678_42"
 */
export const widgetEndpoint = (ctrl) => {
  const safeId = sanitizeWidgetId(ctrl.id);
  return `/${ctrl.type}/${safeId}`;
};

/**
 * Escape a string so it can be safely embedded inside HTML text or an
 * HTML attribute value (double-quoted).
 *
 * @param {*} s
 * @returns {string}
 */
export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
