// IndexedDB storage layer for AP WebDB.
// Stores every database as a record in the "databases" object store.
const IDB = {
    DB_NAME: 'apwebdb',
    DB_VERSION: 1,
    STORE: 'databases',
    _conn: null,

    open() {
        if (this._conn) return Promise.resolve(this._conn);
        return new Promise((resolve, reject) => {
            let req;
            try {
                req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }
            req.onupgradeneeded = () => {
                const idb = req.result;
                if (!idb.objectStoreNames.contains(this.STORE)) {
                    idb.createObjectStore(this.STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => {
                this._conn = req.result;
                this._conn.onversionchange = () => {
                    this._conn.close();
                    this._conn = null;
                };
                resolve(this._conn);
            };
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IndexedDB blocked'));
        });
    },

    _tx(mode) {
        return this.open().then((idb) => idb.transaction(this.STORE, mode).objectStore(this.STORE));
    },

    _wrap(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    listDatabases() {
        return this._tx('readonly')
            .then((store) => this._wrap(store.getAll()))
            .then((all) => all.map((d) => ({
                id: d.id,
                name: d.name,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
                tableCount: (d.tables || []).length,
                recordCount: (d.tables || []).reduce((s, tbl) => s + (tbl.records || []).length, 0)
            })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    },

    getDatabase(id) {
        return this._tx('readonly').then((store) => this._wrap(store.get(id)));
    },

    putDatabase(db) {
        return this._tx('readwrite').then((store) => this._wrap(store.put(db)));
    },

    deleteDatabase(id) {
        return this._tx('readwrite').then((store) => this._wrap(store.delete(id)));
    },

    clearAll() {
        return this._tx('readwrite').then((store) => this._wrap(store.clear()));
    },

    // Migrate an old localStorage-only database into IndexedDB once.
    migrateFromLocalStorage() {
        try {
            const raw = localStorage.getItem('apwebdb_database');
            if (!raw) return Promise.resolve(false);
            const db = JSON.parse(raw);
            if (!db || !Array.isArray(db.tables)) {
                localStorage.removeItem('apwebdb_database');
                return Promise.resolve(false);
            }
            if (!db.id) db.id = Utils.uid();
            return this.putDatabase(db).then(() => {
                localStorage.removeItem('apwebdb_database');
                return true;
            }).catch(() => false);
        } catch (e) {
            console.warn('Migration from localStorage failed:', e);
            return Promise.resolve(false);
        }
    }
};
