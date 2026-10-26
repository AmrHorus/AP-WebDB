// UI helpers: toasts, modal dialogs, confirmations and prompts.

import { I18N } from './i18n.js';
import { t as translateKey } from './theme.js';
// NOTE: errors.js is NOT statically imported here. ui.js ← engine.js/errors.js
// form an import cycle; importing back would re-introduce temporal-dead-zone
// crashes during bootstrap. window.Errors (assigned when errors.js finishes
// evaluating) is used lazily instead.

// Minimal built-in error strings so a notification can ALWAYS be shown, even
// if the i18n dictionary has not finished loading (early-bootstrap failures).
const FALLBACK_EN = {
    genericError: 'Something went wrong. Please try again.',
    errUnknown: 'Something went wrong. Please try again.'
};

// Safe translation lookup: falls back to the dictionary directly, then to the
// key itself, so a half-initialized i18n layer can never throw while we are
// trying to report an error.
function translateSafe(key) {
    try {
        if (typeof translateKey === 'function') return translateKey(key);
    } catch (_) { /* mid-bootstrap: bindings may be uninitialized */ }
    const dict = (typeof I18N !== 'undefined' && I18N && I18N.en) ||
        ((typeof window !== 'undefined' && window.I18N && window.I18N.en) || null);
    if (dict && dict[key]) return dict[key];
    return FALLBACK_EN[key] || String(key);
}

// Ensure #toast-container exists even on pages that predate it or where the
// markup failed to load — otherwise toast() would silently drop messages.
function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    return container;
}

const UI = {
    toast(message, type = 'info', duration = 3200) {
        const container = getToastContainer();
        const el = document.createElement('div');
        el.className = 'toast toast-' + type;
        el.setAttribute('role', 'status');
        el.textContent = message;
        container.appendChild(el);
        // keep max 4 toasts visible
        while (container.children.length > 4) container.removeChild(container.firstChild);
        setTimeout(() => {
            el.classList.add('hide');
            setTimeout(() => el.remove(), 350);
        }, duration);
    },

    _activeModal: null,
    _lastFocus: null,

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        this.closeModal();
        this._lastFocus = document.activeElement;
        modal.hidden = false;
        modal.classList.add('open');
        document.body.classList.add('modal-open');
        this._activeModal = modal;
        const focusable = modal.querySelector('input:not([disabled]), select, textarea, button:not([disabled])');
        if (focusable) setTimeout(() => focusable.focus(), 60);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) UI.closeModal();
        });
    },

    closeModal() {
        if (!this._activeModal) return;
        this._activeModal.classList.remove('open');
        this._activeModal.hidden = true;
        this._activeModal = null;
        if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
        if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus();
    },

    // Confirmation dialog returning a Promise<boolean>
    confirm(titleKey, message, opts) {
        opts = opts || {};
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm');
            const titleEl = modal.querySelector('.modal-title');
            const msgEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('btn-confirm-ok');
            const cancelBtn = document.getElementById('btn-confirm-cancel');
            titleEl.textContent = typeof titleKey === 'string' ? translateSafe(titleKey) : titleKey;
            msgEl.textContent = message;
            okBtn.textContent = translateSafe(opts.danger !== false ? 'deleteButton' : 'confirmButton');
            okBtn.className = 'btn ' + (opts.danger !== false ? 'btn-danger' : 'btn-primary');
            cancelBtn.textContent = translateSafe('cancel');
            const prevHandler = modal._handler;
            if (prevHandler) {
                okBtn.removeEventListener('click', prevHandler.ok);
                cancelBtn.removeEventListener('click', prevHandler.cancel);
            }
            const ok = () => { cleanup(); resolve(true); };
            const cancel = () => { cleanup(); resolve(false); };
            function cleanup() {
                okBtn.removeEventListener('click', ok);
                cancelBtn.removeEventListener('click', cancel);
                UI.closeModal();
            }
            okBtn.addEventListener('click', ok);
            cancelBtn.addEventListener('click', cancel);
            modal._handler = { ok, cancel };
            UI.openModal('modal-confirm');
        });
    },

    // Prompt dialog with one text input; resolves to string or null
    prompt(titleKey, value, placeholderKey) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-prompt');
            const titleEl = modal.querySelector('.modal-title');
            const input = document.getElementById('prompt-input');
            const okBtn = document.getElementById('btn-prompt-ok');
            const cancelBtn = document.getElementById('btn-prompt-cancel');
            const form = document.getElementById('prompt-form');
            titleEl.textContent = typeof titleKey === 'string' ? translateSafe(titleKey) : titleKey;
            input.value = value || '';
            input.placeholder = placeholderKey ? translateSafe(placeholderKey) : '';
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                form.onsubmit = null;
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                UI.closeModal();
                resolve(val);
            };
            okBtn.onclick = () => finish(input.value.trim() || null);
            cancelBtn.onclick = () => finish(null);
            form.onsubmit = (e) => { e.preventDefault(); finish(input.value.trim() || null); };
            UI.openModal('modal-prompt');
        });
    },

    // Generic error display for thrown errors during user actions.
    // Delegates message selection to the centralized Errors utility so every
    // failure path (IndexedDB, import, CSV...) produces a friendly toast.
    // Never throws: if translation lookup fails mid-bootstrap we fall back to
    // built-in strings, so notification problems can't crash DB operations.
    handleError(err, fallbackKey) {
        const errors = (typeof window !== 'undefined' && window.Errors) || null;
        let message;
        try {
            if (errors && typeof errors.friendly === 'function') {
                message = fallbackKey ? translateSafe(fallbackKey) : errors.friendly(err);
            } else if (fallbackKey) {
                message = translateSafe(fallbackKey);
            } else {
                message = (err && err.isUserMessage && err.message)
                    ? translateSafe(err.message)
                    : FALLBACK_EN.genericError;
            }
        } catch (_) {
            message = FALLBACK_EN.genericError;
        }
        console.error('[AP-WebDB] UI.handleError:', err);
        this.toast(message || FALLBACK_EN.genericError, 'error', 5000);
    },

    fieldTypeLabel(type) {
        const keys = {
            auto_id: 'typeAutoId',
            text: 'typeText',
            long_text: 'typeLongText',
            integer: 'typeInteger',
            decimal: 'typeDecimal',
            number: 'typeNumber',
            boolean: 'typeBoolean',
            date: 'typeDate',
            datetime: 'typeDateTime',
            email: 'typeEmail',
            url: 'typeUrl'
        };
        return keys[type] ? translateSafe(keys[type]) : type;
    },

    formatCellValue(field, value) {
        if (value === undefined || value === null || value === '') return '';
        if (field.type === 'boolean') return value ? translateSafe('yesValue') : translateSafe('noValue');
        return String(value);
    }
};

// ES module exports.
export default UI;
export { UI };

if (typeof window !== 'undefined') window.UI = UI;
