// UI Module - User interface utilities
const UI = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Modal close handlers
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        document.querySelectorAll('.modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        document.getElementById('modal-overlay').addEventListener('click', () => {
            this.closeAllModals();
        });

        // Theme toggle
        document.getElementById('btn-theme-toggle').addEventListener('click', () => this.toggleTheme());

        // Settings modal
        document.getElementById('btn-app-settings').addEventListener('click', () => this.openSettings());
        document.getElementById('btn-clear-local-data').addEventListener('click', () => this.clearLocalData());

        // Theme options in settings
        document.querySelectorAll('.theme-option-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                this.setTheme(theme);
            });
        });

        // Mobile menu toggle
        document.getElementById('btn-menu-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                document.getElementById('global-search').focus();
            }
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    openModal(modalId) {
        document.getElementById('modal-overlay').classList.add('active');
        document.getElementById(modalId).classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        if (!document.querySelector('.modal.active')) {
            document.getElementById('modal-overlay').classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('modal-overlay').classList.remove('active');
        document.body.style.overflow = '';
    },

    showConfirm(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        const confirmBtn = document.getElementById('btn-confirm-action');
        confirmBtn.onclick = () => {
            this.closeAllModals();
            onConfirm();
        };
        
        this.openModal('modal-confirm');
    },

    setTheme(theme) {
        localStorage.setItem('apwebdb_theme', theme);
        
        let actualTheme = theme;
        if (theme === 'system') {
            actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        document.documentElement.setAttribute('data-theme', actualTheme);
        
        // Update active state on theme buttons
        document.querySelectorAll('.theme-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        
        // Save the explicit choice (not system)
        localStorage.setItem('apwebdb_theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    },

    openSettings() {
        const savedTheme = localStorage.getItem('apwebdb_theme') || 'system';
        
        document.querySelectorAll('.theme-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === savedTheme);
        });
        
        this.openModal('modal-settings');
    },

    clearLocalData() {
        this.showConfirm(
            'Clear All Data?',
            'This will permanently delete all databases and settings. This action cannot be undone.',
            () => {
                Storage.clearAll();
                location.reload();
            }
        );
    },

    updateSaveStatus(status) {
        const el = document.getElementById('save-status');
        if (!el) return;
        
        el.textContent = status;
        el.style.color = status === 'Saved' ? 'var(--success)' : 'var(--text-muted)';
    }
};
