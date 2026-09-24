// Landing page logic: recent databases, create/open/import, demo data.
const Home = {
    init() {
        Prefs.applyTheme();
        Prefs.applyLang();

        this.bind('btn-create-db', () => UI.openModal('modal-new-db'));
        this.bind('btn-open-db', () => this.openOpenDbModal());
        this.bind('btn-import-home', () => document.getElementById('file-import').click());
        this.bind('btn-demo', () => this.loadDemo());
        this.bind('btn-theme', () => {
            Prefs.cycleTheme();
        });
        document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                Prefs.setLang(btn.dataset.langBtn);
                this.renderRecent();
            });
        });
        document.querySelectorAll('[data-theme-pref]').forEach((btn) => {
            btn.addEventListener('click', () => Prefs.setTheme(btn.dataset.themePref));
        });

        const form = document.getElementById('form-new-db');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createDatabase();
        });

        document.getElementById('file-import').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importFile(file);
            e.target.value = '';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !e.target.closest('input, textarea, select')) UI.closeModal();
        });

        IDB.migrateFromLocalStorage().then((migrated) => {
            if (migrated) console.info('Migrated legacy localStorage database into IndexedDB.');
        }).finally(() => this.renderRecent());
    },

    bind(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    },

    renderRecent() {
        const list = document.getElementById('recent-list');
        const empty = document.getElementById('recent-empty');
        list.innerHTML = '';
        IDB.listDatabases().then((dbs) => {
            empty.hidden = dbs.length > 0;
            dbs.forEach((meta) => {
                const card = document.createElement('article');
                card.className = 'db-card';

                const head = document.createElement('div');
                head.className = 'db-card-head';
                const icon = document.createElement('img');
                icon.src = 'assets/Logo.png';
                icon.alt = '';
                icon.className = 'db-card-icon';
                const titleWrap = document.createElement('div');
                const h3 = document.createElement('h3');
                h3.textContent = meta.name || t('untitled');
                const sub = document.createElement('p');
                sub.className = 'db-card-meta';
                sub.textContent = meta.tableCount + ' ' + t('tablesWord') +
                    ' · ' + meta.recordCount + ' ' + t('recordsWord') +
                    ' · ' + formatRelativeTime(meta.updatedAt);
                titleWrap.appendChild(h3);
                titleWrap.appendChild(sub);
                head.appendChild(icon);
                head.appendChild(titleWrap);

                const actions = document.createElement('div');
                actions.className = 'db-card-actions';

                const openBtn = document.createElement('button');
                openBtn.className = 'btn btn-primary btn-sm';
                openBtn.textContent = t('openInWorkspace');
                openBtn.addEventListener('click', () => this.goToWorkspace(meta.id));
                actions.appendChild(openBtn);

                const exportBtn = document.createElement('button');
                exportBtn.className = 'btn btn-ghost btn-sm';
                exportBtn.textContent = t('export');
                exportBtn.addEventListener('click', () => {
                    IDB.getDatabase(meta.id).then((db) => {
                        if (db) Backup.downloadDatabases([db]);
                        UI.toast(t('toastExported'), 'success');
                    });
                });
                actions.appendChild(exportBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-danger-ghost btn-sm';
                delBtn.textContent = t('delete');
                delBtn.addEventListener('click', () => {
                    UI.confirm('confirmDeleteDbTitle', t('confirmDeleteDbMsg', { name: meta.name }))
                        .then((ok) => {
                            if (!ok) return;
                            IDB.deleteDatabase(meta.id).then(() => {
                                UI.toast(t('toastDbDeleted'), 'success');
                                this.renderRecent();
                            });
                        });
                });
                actions.appendChild(delBtn);

                card.appendChild(head);
                card.appendChild(actions);
                list.appendChild(card);
            });
        }).catch((e) => {
            console.error(e);
            empty.hidden = false;
        });
    },

    createDatabase() {
        const input = document.getElementById('new-db-name');
        const name = input.value.trim();
        if (!name) {
            UI.toast(t('errEnterDbName'), 'error');
            input.focus();
            return;
        }
        const db = Engine.newDatabase(name);
        IDB.putDatabase(db).then(() => {
            UI.closeModal();
            input.value = '';
            this.goToWorkspace(db.id);
        }).catch(UI.handleError);
    },

    openOpenDbModal() {
        IDB.listDatabases().then((dbs) => {
            if (!dbs.length) {
                UI.toast(t('errNoDbImport'), 'info');
                return;
            }
            UI.openModal('modal-open-db');
            const select = document.getElementById('open-db-select');
            select.innerHTML = '';
            dbs.forEach((d) => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.name + ' (' + d.tableCount + ' ' + t('tablesWord') + ')';
                select.appendChild(opt);
            });
            const form = document.getElementById('form-open-db');
            form.onsubmit = (e) => {
                e.preventDefault();
                this.goToWorkspace(select.value);
            };
        });
    },

    goToWorkspace(dbId) {
        window.location.href = 'dbCenter.html?db=' + encodeURIComponent(dbId);
    },

    importFile(file) {
        Backup.readFile(file).then((text) => {
            const dbs = Backup.parse(text);
            return Backup.importDatabases(dbs).then(() => {
                UI.toast(t('toastImported', { n: dbs.length }), 'success');
                this.renderRecent();
            });
        }).catch((e) => UI.handleError(e, 'errImportFile'));
    },

    loadDemo() {
        const db = Engine.newDatabase(t('demoDbName'));
        const usersId = Utils.uid();
        const ordersId = Utils.uid();
        db.tables = [
            {
                id: usersId,
                name: 'Users',
                fields: [
                    { name: 'ID', type: 'auto_id', required: true, primaryKey: true },
                    { name: 'Name', type: 'text', required: true, primaryKey: false },
                    { name: 'Email', type: 'email', required: false, primaryKey: false },
                    { name: 'Joined', type: 'date', required: false, primaryKey: false },
                    { name: 'Active', type: 'boolean', required: false, primaryKey: false }
                ],
                records: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: ordersId,
                name: 'Orders',
                fields: [
                    { name: 'ID', type: 'auto_id', required: true, primaryKey: true },
                    { name: 'user_id', type: 'integer', required: true, primaryKey: false },
                    { name: 'Product', type: 'text', required: true, primaryKey: false },
                    { name: 'Quantity', type: 'integer', required: false, primaryKey: false },
                    { name: 'Price', type: 'decimal', required: false, primaryKey: false },
                    { name: 'Ordered At', type: 'datetime', required: false, primaryKey: false },
                    { name: 'Shipped', type: 'boolean', required: false, primaryKey: false }
                ],
                records: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];
        db.relationships = [{
            id: Utils.uid(),
            sourceTableId: usersId, sourceField: 'ID',
            targetTableId: ordersId, targetField: 'user_id',
            createdAt: new Date().toISOString()
        }];
        const users = [
            ['Ahmed Ali', 'ahmed@example.com', '2024-01-15', true],
            ['Sara Hassan', 'sara@example.com', '2024-03-02', true],
            ['John Doe', 'john@example.com', '2024-06-21', false]
        ];
        users.forEach((u, i) => {
            db.tables[0].records.push({
                ID: String(i + 1), Name: u[0], Email: u[1], Joined: u[2], Active: u[3],
                _created: new Date().toISOString()
            });
        });
        const orders = [
            ['1', 'Keyboard', '2', '49.99', '2024-07-01 10:30:00', true],
            ['2', 'Monitor', '1', '199.50', '2024-07-05 14:12:00', false],
            ['3', 'Mouse', '1', '19.99', '2024-08-11 09:00:00', true],
            ['2', 'Webcam', '3', '35.00', '2024-09-02 17:45:00', false]
        ];
        orders.forEach((o, i) => {
            db.tables[1].records.push({
                ID: String(i + 1), user_id: o[0], Product: o[1], Quantity: o[2],
                Price: o[3], 'Ordered At': o[4], Shipped: o[5] === 'true',
                _created: new Date().toISOString()
            });
        });
        IDB.putDatabase(db).then(() => {
            UI.toast(t('toastDemoLoaded'), 'success');
            this.goToWorkspace(db.id);
        }).catch(UI.handleError);
    }
};

document.addEventListener('DOMContentLoaded', () => Home.init());
