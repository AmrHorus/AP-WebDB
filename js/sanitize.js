// Input sanitization & validation for untrusted content (CSV cells,
// imported JSON records...). AP-WebDB renders user data with textContent,
// but this module adds defense-in-depth: it strips markup/control
// characters and neutralizes formula injection before data is stored.
const Sanitize = {
    // eslint-disable-next-line no-control-regex
    CONTROL_CHARS: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g,

    // Remove control/bidi-override characters, collapse line endings, trim.
    text(value, maxLen = 100000) {
        if (value === null || value === undefined) return '';
        let s = String(value);
        s = s.replace(/\r\n?/g, '\n');
        s = s.replace(Sanitize.CONTROL_CHARS, '');
        if (s.length > maxLen) s = s.slice(0, maxLen);
        return s.trim();
    },

    // Strip any HTML/XML tags from a string (defense in depth).
    stripTags(s) {
        return s.replace(/<[^>]*>/g, '');
    },

    // Neutralize spreadsheet formula injection (=, +, -, @ followed by content).
    csvFormulaSafe(s) {
        if (/^[=+\-@\t].*/.test(s)) return "'" + s;
        return s;
    },

    // Validate that a URL uses a safe scheme (used for `url` fields and hrefs).
    safeUrl(value) {
        const s = Sanitize.text(value);
        if (!s) return '';
        try {
            const u = new URL(s, location.href);
            if (['http:', 'https:', 'mailto:'].indexOf(u.protocol) !== -1) return s;
            return '';
        } catch (e) {
            return '';
        }
    },

    // Escape a string for safe interpolation into innerHTML templates.
    // Prefer building DOM nodes + textContent; use this only when necessary.
    html(value) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
        return Sanitize.text(value).replace(/[&<>"']/g, (c) => map[c]);
    },

    // Deep-sanitize an arbitrary imported record object: every value is
    // converted to a clean primitive (string/boolean/number-ish string).
    record(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
        const clean = {};
        Object.keys(obj).forEach((rawKey) => {
            const key = Sanitize.stripTags(Sanitize.text(rawKey, 200));
            if (!key) return;
            const v = obj[rawKey];
            if (v === null || v === undefined) clean[key] = '';
            else if (typeof v === 'boolean') clean[key] = v;
            else if (typeof v === 'number') clean[key] = String(v);
            else if (typeof v === 'string') clean[key] = Sanitize.stripTags(Sanitize.text(v));
            // nested objects/arrays are rejected: schema has no such field types
        });
        return clean;
    },

    // Guard a parsed JSON payload against prototype pollution / oversized trees.
    plainObject(value, depth = 0) {
        if (depth > 12) return null;
        if (Array.isArray(value)) return value.map((v) => Sanitize.plainObject(v, depth + 1));
        if (value && typeof value === 'object') {
            const out = {};
            for (const k of Object.keys(value)) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                out[k] = Sanitize.plainObject(value[k], depth + 1);
            }
            return out;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) return null;
        return value;
    }
};

export default Sanitize;
export { Sanitize };
if (typeof window !== 'undefined') window.Sanitize = Sanitize;
