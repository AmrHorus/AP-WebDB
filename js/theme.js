// Theme, language (i18n + RTL) and small preference helpers.
// Preferences live in localStorage; database content lives in IndexedDB.
const Prefs = {
    THEME_KEY: 'apwebdb_theme',
    LANG_KEY: 'apwebdb_lang',

    getTheme() {
        return localStorage.getItem(this.THEME_KEY) || 'system';
    },

    resolveTheme(pref) {
        const p = pref || this.getTheme();
        if (p === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return p;
    },

    applyTheme() {
        const resolved = this.resolveTheme();
        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.style.colorScheme = resolved;
        this.updateThemeButtons();
    },

    setTheme(pref) {
        localStorage.setItem(this.THEME_KEY, pref);
        this.applyTheme();
    },

    cycleTheme() {
        const order = ['light', 'dark', 'system'];
        const cur = this.getTheme();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        this.setTheme(next);
        return next;
    },

    updateThemeButtons() {
        const pref = this.getTheme();
        document.querySelectorAll('[data-theme-pref]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.themePref === pref);
            btn.setAttribute('aria-pressed', String(btn.dataset.themePref === pref));
        });
        const cycle = document.getElementById('btn-theme');
        if (cycle) {
            const labelKey = pref === 'light' ? 'lightMode' : pref === 'dark' ? 'darkMode' : 'systemMode';
            cycle.title = t('themeCycleTitle') + ' — ' + t(labelKey);
            cycle.setAttribute('aria-label', cycle.title);
            const icon = cycle.querySelector('.theme-icon');
            if (icon) {
                const resolved = this.resolveTheme();
                icon.src = resolved === 'dark' ? 'assets/Moon.png' : 'assets/Sun.png';
                icon.alt = resolved === 'dark' ? t('darkMode') : t('lightMode');
            }
        }
    },

    getLang() {
        const saved = localStorage.getItem(this.LANG_KEY);
        if (saved && I18N[saved]) return saved;
        return 'en';
    },

    setLang(code) {
        if (!I18N[code]) return;
        localStorage.setItem(this.LANG_KEY, code);
        this.applyLang();
    },

    applyLang() {
        const lang = this.getLang();
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.body.classList.toggle('lang-ar', lang === 'ar');
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            el.title = t(el.dataset.i18nTitle);
            el.setAttribute('aria-label', t(el.dataset.i18nTitle));
        });
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            el.setAttribute('aria-label', t(el.dataset.i18nAria));
        });
        document.title = t(document.body.dataset.titleKey || 'appTitle');
        // language buttons
        document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.langBtn === lang);
            btn.setAttribute('aria-pressed', String(btn.dataset.langBtn === lang));
        });
        this.updateThemeButtons();
    }
};

// Translate a key with optional params: {name: 'X'}
function t(key, params) {
    const lang = Prefs.getLang();
    let str = (I18N[lang] && I18N[lang][key]) || (I18N.en[key]) || key;
    if (params) {
        Object.keys(params).forEach((p) => {
            str = str.split('{' + p + '}').join(params[p]);
        });
    }
    return str;
}

// Pick singular/plural form from "one | many" strings
function tp(key, count, params) {
    const lang = Prefs.getLang();
    let str = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    const parts = str.split('|').map((s) => s.trim());
    let chosen;
    if (parts.length > 1) {
        if (lang === 'ar') {
            chosen = count === 1 ? parts[0] : parts[1];
        } else {
            chosen = count === 1 ? parts[0] : (parts[1] || parts[0]);
        }
    } else {
        chosen = parts[0];
    }
    const merged = Object.assign({ n: count }, params || {});
    return chosen.replace(/\{(\w+)\}/g, (_, k) => (merged[k] !== undefined ? merged[k] : '{' + k + '}'));
}

function formatRelativeTime(iso) {
    if (!iso) return t('never');
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('justNow');
    if (mins < 60) return t('minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('hoursAgo', { n: hours });
    return t('daysAgo', { n: Math.floor(hours / 24) });
}

(function initThemeEarly() {
    // Applied as early as possible to avoid a flash of the wrong theme.
    const style = document.createElement('style');
    style.id = 'theme-boot';
    document.head.appendChild(style);
})();

window.addEventListener('matchMedia', () => {});
if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
        if (Prefs.getTheme() === 'system') Prefs.applyTheme();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
}
