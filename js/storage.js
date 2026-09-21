// Storage Module - Handles localStorage operations
const Storage = {
    DB_KEY: 'apwebdb_database',
    SETTINGS_KEY: 'apwebdb_settings',

    saveDatabase(database) {
        try {
            localStorage.setItem(this.DB_KEY, JSON.stringify(database));
            return true;
        } catch (e) {
            console.error('Failed to save database:', e);
            return false;
        }
    },

    loadDatabase() {
        try {
            const data = localStorage.getItem(this.DB_KEY);
            if (!data) return null;
            const db = JSON.parse(data);
            // Validate structure
            if (!db || !db.tables) return null;
            return db;
        } catch (e) {
            console.error('Failed to load database:', e);
            return null;
        }
    },

    saveSettings(settings) {
        try {
            localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    },

    loadSettings() {
        try {
            const data = localStorage.getItem(this.SETTINGS_KEY);
            if (!data) return { theme: 'system' };
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to load settings:', e);
            return { theme: 'system' };
        }
    },

    clearAll() {
        try {
            localStorage.removeItem(this.DB_KEY);
            localStorage.removeItem(this.SETTINGS_KEY);
            return true;
        } catch (e) {
            console.error('Failed to clear storage:', e);
            return false;
        }
    },

    hasDatabase() {
        return localStorage.getItem(this.DB_KEY) !== null;
    }
};
