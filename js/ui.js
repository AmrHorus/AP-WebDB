// UI helpers: toasts, modal dialogs, confirmations and prompts.
const UI = {
    toast(message, type = 'info', duration = 3200) {
        const container = document.getElementById('toast-container');
        if (!container) return;
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
            titleEl.textContent = typeof titleKey === 'string' && I18N.en[titleKey] ? t(titleKey) : titleKey;
            msgEl.textContent = message;
            okBtn.textContent = t(opts.danger !== false ? 'deleteButton' : 'confirmButton');
            okBtn.className = 'btn ' + (opts.danger !== false ? 'btn-danger' : 'btn-primary');
            cancelBtn.textContent = t('cancel');
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
            titleEl.textContent = typeof titleKey === 'string' && I18N.en[titleKey] ? t(titleKey) : titleKey;
            input.value = value || '';
            input.placeholder = placeholderKey ? t(placeholderKey) : '';
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
    handleError(err, fallbackKey) {
        if (typeof Errors !== 'undefined') {
            const message = fallbackKey ? t(fallbackKey) : Errors.friendly(err);
            console.error('[AP-WebDB] UI.handleError:', err);
            this.toast(message, 'error', 5000);
            return;
        }
        console.error(err);
        const msg = err && err.message && !/^[A-Za-z ]*Error/.test(err.message.split('\n')[0])
            ? err.message
            : t(fallbackKey || 'errUnknown');
        this.toast(msg, 'error');
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
        return keys[type] ? t(keys[type]) : type;
    },

    formatCellValue(field, value) {
        if (value === undefined || value === null || value === '') return '';
        if (field.type === 'boolean') return value ? t('yesValue') : t('noValue');
        return String(value);
    }
};

// ES module exports.
export default UI;
export { UI };
