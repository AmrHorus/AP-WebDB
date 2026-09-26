// Centralized error handling for AP-WebDB.
// Converts raw technical errors (IndexedDB failures, quota exceeded,
// corrupted imports...) into user-friendly localized notifications,
// while always logging full technical details to the console.
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
        if (err === null || err === undefined) return t('genericError');
        // Quota exceeded: name differs across browsers (exception object or DOMException)
        if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            return t('errStorageFull');
        }
        if (err.name === 'DatabaseClosedError' || err.name === 'InvalidStateError') {
            return t('errDbUnavailable');
        }
        if (err.name === 'VersionError' || /blocked|upgrade/i.test(err.message || '')) {
            return t('errDbInit');
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine && /network|fetch/i.test(err.message || '')) {
            return t('errOffline');
        }
        // Errors created with a translation key or a ready-made user message
        if (err.isUserMessage || (err.message && I18N.en[err.message])) {
            return t(err.message);
        }
        if (err.message && String(err.message).trim()) {
            // Only surface short messages; long stack-like text goes to console only
            const msg = String(err.message);
            return msg.length <= 200 ? msg : t('genericError');
        }
        return t('genericError');
    },

    report(err, opts) {
        opts = opts || {};
        console.error('[AP-WebDB]' + (opts.context ? ' ' + opts.context + ':' : ' error:'), err);
        const message = (opts.prefix ? opts.prefix + ' — ' : '') + Errors.friendly(err);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast(message, 'error', 5000);
        } else {
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
