// IndexedDB storage layer for AP-WebDB (ES Module).
// Every user database is stored as one record in the "databases" object store.
// Modern async/await API with schema versioning and migration support.
import Errors from './errors.js';

const DB_NAME = 'apwebdb';
const STORE = 'databases';

// Schema versions: bump SCHEMA_VERSION and add a migration entry to run
// upgrade logic on existing installs. Migrations receive the IDBDatabase,
// the old/new version numbers and the active upgrade transaction.
const SCHEMA_VERSION = 2;
const MIGRATIONS = {
    // v1 -> v2: add "meta" store for app-level records (schema info)
    2: (idb, tx) => {
        if (!idb.objectStoreNames.contains('meta')) {
            idb.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!idb.objectStoreNames.contains(STORE)) {
            idb.createObjectStore(STORE, { keyPath: 'id' });
        }
        void tx;
    }
};

let _conn = null;
let _opening = null;

function requestToPromise(request, context) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error(context || 'IndexedDB request failed'));
        request.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
}

function transactionDone(tx) {
    // Resolves only after the transaction has durably committed.
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
    });
}

async function open() {
    if (_conn) return _conn;
    if (_opening) return _opening; // deduplicate concurrent opens

    _opening = new Promise((resolve, reject) => {
        let req;
        try {
            req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
        } catch (e) {
            reject(e);
            return;
        }
        req.onupgradeneeded = (event) => {
            const idb = req.result;
            const tx = req.transaction;
            const oldVersion = event.oldVersion || 0;
            for (let v = oldVersion + 1; v <= SCHEMA_VERSION; v++) {
                const migrate = MIGRATIONS[v];
                if (migrate) {
                    try {
                        migrate(idb, tx);
                    } catch (e) {
                        tx.abort();
                        reject(e);
                        return;
                    }
                } else if (!idb.objectStoreNames.contains(STORE)) {
                    idb.createObjectStore(STORE, { keyPath: 'id' });
                }
            }
        };
        req.onsuccess = () => {
            _conn = req.result;
            _conn.onversionchange = () => {
                _conn.close();
                _conn = null;
            };
            _conn.onclose = () => { _conn = null; };
            _opening = null;
            resolve(_conn);
        };
        req.onerror = () => {
            _opening = null;
            reject(req.error || new Error('Failed to open IndexedDB'));
        };
        req.onblocked = () => {
            _opening = null;
            reject(new Error('IndexedDB blocked by another connection'));
        };
    });
    return _opening;
}

// Run a single-store operation inside its own transaction and wait for commit.
async function withStore(mode, fn) {
    const idb = await open();
    const tx = idb.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await transactionDone(tx);
    return result;
}

const IDB = {
    DB_NAME,
    DB_VERSION: SCHEMA_VERSION,
    STORE,

    open,

    async listDatabases() {
        try {
            const all = await withStore('readonly', (store) => requestToPromise(store.getAll(), 'listDatabases'));
            return (all || [])
                .map((d) => ({
                    id: d.id,
                    name: d.name,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt,
                    tableCount: (d.tables || []).length,
                    recordCount: (d.tables || []).reduce((s, tbl) => s + (tbl.records || []).length, 0)
                }))
                .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        } catch (err) {
            Errors.report(err, { context: 'IDB.listDatabases' });
            throw err;
        }
    },

    async getDatabase(id) {
        try {
            return await withStore('readonly', (store) => requestToPromise(store.get(id), 'getDatabase'));
        } catch (err) {
            Errors.report(err, { context: 'IDB.getDatabase' });
            throw err;
        }
    },

    async putDatabase(db) {
        try {
            await withStore('readwrite', (store) => requestToPromise(store.put(db), 'putDatabase'));
            return db;
        } catch (err) {
            Errors.report(err, { context: 'IDB.putDatabase' });
            throw err;
        }
    },

    async deleteDatabase(id) {
        try {
            await withStore('readwrite', (store) => requestToPromise(store.delete(id), 'deleteDatabase'));
        } catch (err) {
            Errors.report(err, { context: 'IDB.deleteDatabase' });
            throw err;
        }
    },

    async clearAll() {
        try {
            await withStore('readwrite', (store) => requestToPromise(store.clear(), 'clearAll'));
        } catch (err) {
            Errors.report(err, { context: 'IDB.clearAll' });
            throw err;
        }
    },

    // Approximate free/used browser storage, when the Storage Manger API exists.
    async estimateUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            try { return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
        }
        return null;
    },

    // Migrate an old localStorage-only database into IndexedDB once.
    async migrateFromLocalStorage() {
        try {
            const raw = localStorage.getItem('apwebdb_database');
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            const db = SanitizeGuard(parsed);
            if (!db || !Array.isArray(db.tables)) {
                localStorage.removeItem('apwebdb_database');
                return false;
            }
            if (!db.id) db.id = Utils.uid();
            await IDB.putDatabase(db);
            localStorage.removeItem('apwebdb_database');
            return true;
        } catch (e) {
            console.warn('Migration from localStorage failed:', e);
            return false;
        }
    }
};

// Prototype-pollution guard applied before storing any externally-sourced object.
function SanitizeGuard(value) {
    if (typeof Sanitize !== 'undefined' && Sanitize.plainObject) return Sanitize.plainObject(value);
    return value;
}

export default IDB;
export { IDB, open, SCHEMA_VERSION };
if (typeof window !== 'undefined') window.IDB = IDB;
