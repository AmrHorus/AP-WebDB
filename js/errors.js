// Centralized error handling for AP-WebDB.
// Converts raw technical errors (IndexedDB failures, quota exceeded,
// corrupted imports...) into user-friendly localized notifications,
// while always logging full technical details to the console.

// Lazy circular-dependency-safe accessors. ui.js imports this module and
// vice-versa, so we must never assume UI / I18N globals exist yet when an
// error is reported during early bootstrap; fall back gracefully instead of
// throwing "Cannot read properties of undefined (reading 'toast')".
function getUI() {
    return (typeof UI !== 'undefined' && UI) ||
        (typeof window !== 'undefined' && window.UI) || null;
}
function getI18N() {
    return (typeof I18N !== 'undefined' && I18N) ||
        (typeof window !== 'undefined' && window.I18N) || null;
}
function translate(key) {
    if (typeof t === 'function') return t(key);
    const i18n = getI18N();
    if (i18n && i18n.en && i18n.en[key]) return i18n.en[key];
    return String(key);
}

const Errors = {
    // Wrap an async operation with graceful failure handling.
    // Returns a promise that never rejects; on failure it resolves to null
    // after showing a toast (and optionally calling onError).
    guard(fn, opts) {
        opts = opts || {};
        return Promise.resolve()
            .then(fn)
            .catch((err) => {
                Errors.report(err, opts);
                if (typeof opts.onError === 'function') opts.onError(err);
                return null;
            });
    },

    // Turn any thrown value into a friendly, translated message.
    friendly(err) {
        if (err === null || err === undefined) return translate('genericError');
        // Quota exceeded: name differs across browsers (exception object or DOMException)
        if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            return translate('errStorageFull');
        }
        if (err.name === 'DatabaseClosedError' || err.name === 'InvalidStateError') {
            return translate('errDbUnavailable');
        }
        if (err.name === 'VersionError' || /blocked|upgrade/i.test(err.message || '')) {
            return translate('errDbInit');
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine && /network|fetch/i.test(err.message || '')) {
            return translate('errOffline');
        }
        // Errors created with a translation key or a ready-made user message
        const i18n = getI18N();
        if (err.isUserMessage || (err.message && i18n && i18n.en && i18n.en[err.message])) {
            return translate(err.message);
        }
        if (err.message && String(err.message).trim()) {
            // Only surface short messages; long stack-like text goes to console only
            const msg = String(err.message);
            return msg.length <= 200 ? msg : translate('genericError');
        }
        return translate('genericError');
    },

    report(err, opts) {
        opts = opts || {};
        console.error('[AP-WebDB]' + (opts.context ? ' ' + opts.context + ':' : ' error:'), err);
        const message = (opts.prefix ? opts.prefix + ' — ' : '') + Errors.friendly(err);
        const ui = getUI();
        if (ui && typeof ui.toast === 'function') {
            ui.toast(message, 'error', 5000);
        } else if (typeof alert === 'function') {
            alert(message); // last-resort fallback before UI module is ready
        }
    },

    // Install global catchers so no unexpected failure passes silently.
    install() {
        window.addEventListener('unhandledrejection', (e) => {
            Errors.report(e.reason, { context: 'unhandled promise rejection' });
        });
        window.addEventListener('error', (e) => {
            if (e.error) Errors.report(e.error, { context: 'window error' });
        });
    }
};

// Export as ES module and expose globally for legacy consumers.
export default Errors;
export { Errors };
if (typeof window !== 'undefined') window.Errors = Errors;
