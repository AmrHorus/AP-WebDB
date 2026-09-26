// Database Center controller for dbCenter.html.
// Handles top bar, sidebar navigation, table views (design / datasheet / info),
// relationships, query builder, forms, CSV and JSON import/export.
// All database logic is shared with the rest of the app through Engine / IDB /
// Backup / Csv / RecordForm — this module only wires them to the UI.
const DbCenter = {
    currentTableId: null,
    view: 'overview',      // overview | designer | data | relationships | queries | forms | csvimport
    searchQuery: '',
    sortColumn: null,
    sortDirection: 'asc',
    filters: [],
    pageSize: 20,
    currentPage: 1,

    /* ================= init ================= */
    init() {
        Prefs.applyTheme();
        Prefs.applyLang();
        this.bindStaticEvents();

        const params = new URLSearchParams(window.location.search);
        const dbId = params.get('db');
        IDB.migrateFromLocalStorage().then(() => {
            return IDB.listDatabases().then((list) => {
                let target = dbId;
                if (!target || !list.some((d) => d.id === target)) {
                    target = list.length ? list[0].id : null;
                }
                if (!target) {
                    this.renderNoDatabase();
                    return null;
                }
                return IDB.getDatabase(target).then((db) => {
                    if (!db) {
                        this.renderNoDatabase();
                        return;
                    }
                    Engine.open(db);
                    this.renderApp();
                    // remember last opened db for the landing page shortcut
                    localStorage.setItem('apwebdb_last_db', db.id);
                });
            });
        }).catch((e) => {
            console.error(e);
            UI.toast(t('errUnknown'), 'error');
            this.renderNoDatabase();
        });
    },

    renderNoDatabase() {
        document.getElementById('no-database-state').hidden = false;
        document.getElementById('workspace-main').hidden = true;
        document.getElementById('sidebar-tables').innerHTML = '';
        const bindHome = () => { window.location.href = 'index.html'; };
        const b1 = document.getElementById('btn-nodb-home');
        const b2 = document.getElementById('btn-nodb-create');
        if (b1) b1.onclick = bindHome;
        if (b2) b2.onclick = bindHome;
    },

    bindStaticEvents() {
        const on = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(ev, fn);
        };

        on('btn-back-home', 'click', () => { window.location.href = 'index.html'; });
        const homeLink = document.querySelector('.topbar a.brand');
        if (homeLink) homeLink.setAttribute('title', t('home'));
        on('btn-switch-db', 'click', () => this.switchDatabase());
        on('btn-new-db-ws', 'click', () => this.createDatabaseFlow());
        on('btn-save', 'click', () => {
            if (!Engine.db) return;
            Engine.persist().then(() => UI.toast(t('toastSaved'), 'success'));
        });
        on('btn-undo', 'click', () => this.doUndo());
        on('btn-redo', 'click', () => this.doRedo());
        on('btn-export-json', 'click', () => this.exportCurrentDatabase());
        on('btn-import-json', 'click', () => document.getElementById('file-import-json').click());
        on('btn-theme', 'click', () => Prefs.cycleTheme());
        on('btn-lang', 'click', () => this.toggleLanguage());
        on('btn-settings', 'click', () => this.openSettings());
        // Ctrl+F focuses the record search box from anywhere on the page.
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                const box = document.getElementById('table-search');
                if (!box || box.offsetParent === null) return;
                e.preventDefault();
                box.focus();
                box.select();
            }
        });

        on('btn-menu', 'click', () => {
            document.body.classList.toggle('nav-open');
        });
        on('sidebar-backdrop', 'click', () => {
            document.body.classList.remove('nav-open');
        });

        on('form-new-db', 'submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('new-db-name').value.trim();
            if (!name) { UI.toast(t('errEnterDbName'), 'error'); return; }
            const db = Engine.newDatabase(name);
            IDB.putDatabase(db).then(() => {
                UI.closeModal();
                document.getElementById('new-db-name').value = '';
                Engine.open(db);
                this.renderApp();
                UI.toast(t('toastDbCreated', { name }), 'success');
            }).catch(UI.handleError);
        });
        on('btn-new-db-modal', 'click', () => this.createDatabaseFlow());

        document.getElementById('file-import-json').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importJsonFile(file);
            e.target.value = '';
        });

        // record modal buttons
        on('btn-record-save', 'click', () => RecordForm.submit());
        on('btn-record-cancel', 'click', () => UI.closeModal());
        on('btn-confirm-cancel', 'click', () => UI.closeModal());
        on('btn-prompt-cancel', 'click', () => UI.closeModal());

        // sidebar tool buttons
        on('nav-overview', 'click', () => this.showView('overview'));
        on('nav-info', 'click', () => this.showView('info'));
        on('nav-new-table', 'click', () => this.openDesigner(null));
        on('nav-relationships', 'click', () => this.showView('relationships'));
        on('btn-table-info', 'click', () => this.showView('info'));
        on('nav-queries', 'click', () => this.showView('queries'));
        on('nav-forms', 'click', () => this.showView('forms'));
        on('nav-import-csv', 'click', () => this.showView('csvimport'));
        on('nav-export-csv', 'click', () => this.exportCsvFlow());
        on('nav-settings', 'click', () => this.openSettings());
        on('btn-overview-new-table', 'click', () => this.openDesigner(null));
        on('btn-info-back', 'click', () => {
            if (this.currentTableId && Engine.getTable(this.currentTableId)) this.selectTable(this.currentTableId);
            else this.showView('overview');
        });

        // designer buttons
        on('btn-add-field', 'click', () => this.designerAddField());
        on('btn-designer-save', 'click', () => this.designerSave());
        on('btn-designer-cancel', 'click', () => {
            if (this.editingTableId && Engine.getTable(this.editingTableId)) this.selectTable(this.editingTableId);
            else this.showView('overview');
        });

        // data toolbar
        on('btn-add-record', 'click', () => this.addRecord());
        on('table-search', 'input', Utils.debounce((e) => {
            this.searchQuery = e.target.value;
            this.currentPage = 1;
            this.renderDataRows();
        }, 200));
        on('btn-clear-filters', 'click', () => {
            this.filters = [];
            this.searchQuery = '';
            document.getElementById('table-search').value = '';
            this.renderFilterChips();
            this.renderDataRows();
        });
        on('btn-apply-filter', 'click', () => this.addFilter());
        on('btn-data-export-csv', 'click', () => this.exportTableCsv(this.currentTableId));
        on('btn-data-import-csv', 'click', () => {
            this.pendingCsvTableId = this.currentTableId;
            document.getElementById('file-import-csv').click();
        });
        on('btn-rename-table', 'click', () => this.renameTableFlow(this.currentTableId));
        on('btn-delete-table', 'click', () => this.deleteTableFlow(this.currentTableId));
        on('btn-add-column', 'click', () => this.addColumnFlow());
        on('btn-first-page', 'click', () => { this.currentPage = 1; this.renderDataRows(); });
        on('btn-prev-page', 'click', () => { this.currentPage--; this.renderDataRows(); });
        on('btn-next-page', 'click', () => { this.currentPage++; this.renderDataRows(); });
        on('btn-last-page', 'click', () => {
            this.currentPage = Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize));
            this.renderDataRows();
        });
        on('page-size-select', 'change', (e) => {
            this.pageSize = parseInt(e.target.value, 10) || 20;
            this.currentPage = 1;
            this.renderDataRows();
        });

        document.getElementById('file-import-csv').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.importCsvIntoTable(file);
            e.target.value = '';
        });

        // relationships
        on('btn-create-rel', 'click', () => this.createRelationship());

        // query builder
        on('qb-table', 'change', () => this.qbTableChanged());
        on('qb-add-condition', 'click', () => this.qbAddCondition());
        on('qb-run', 'click', () => this.qbRun());
        on('qb-clear', 'click', () => this.showView('queries'));

        // forms view
        on('form-table-select', 'change', () => this.renderFormsView());
        on('form-edit-select', 'change', () => this.renderFormEditor());
        on('btn-form-new', 'click', () => this.formNewRecord());
        on('btn-form-update', 'click', () => this.formUpdateRecord());
        on('btn-form-reset', 'click', () => this.renderFormEditor());

        document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                Prefs.setLang(btn.dataset.langBtn);
                if (Engine.db) this.refreshCurrentView();
            });
        });

        // every "✕" button inside a modal closes it
        document.querySelectorAll('.modal [data-close]').forEach((btn) => {
            btn.addEventListener('click', () => UI.closeModal());
        });

        // language buttons (top bar + settings modal)
        document.querySelectorAll('.topbar [data-lang-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                Prefs.setLang(btn.dataset.langBtn);
                if (Engine.db) this.refreshCurrentView();
            });
        });

        // language buttons inside the settings modal
        document.querySelectorAll('#modal-settings [data-lang-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                Prefs.setLang(btn.dataset.langBtn);
                if (Engine.db) this.refreshCurrentView();
            });
        });

        // settings modal
        on('btn-close-settings', 'click', () => UI.closeModal());
        on('btn-rename-db', 'click', () => this.renameDatabaseFlow());
        on('btn-delete-db', 'click', () => this.deleteDatabaseFlow());
        on('btn-export-all', 'click', () => this.exportAllDatabases());
        on('btn-import-file-btn', 'click', () => document.getElementById('file-import-json').click());

        // keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            const inField = e.target.matches('input, textarea, select');
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (Engine.db) Engine.persist().then(() => UI.toast(t('toastSaved'), 'success'));
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inField) {
                e.preventDefault();
                this.doUndo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !inField) {
                e.preventDefault();
                this.doRedo();
            } else if (e.key === 'Escape') {
                document.body.classList.remove('nav-open');
                if (!e.target.closest('.modal')) UI.closeModal();
            }
        });

        Engine.on('history', () => this.updateHistoryButtons());
        Engine.on('structure-changed', () => {
            this.renderSidebarTables();
            if (this.view === 'data' && this.currentTableId) this.renderDataTable(true);
            if (this.view === 'relationships') this.renderRelationships();
            if (this.view === 'overview') this.renderOverview();
        });
    },

    doUndo() {
        const keepTable = this.currentTableId;
        if (Engine.undo()) {
            if (keepTable && Engine.getTable(keepTable)) {
                this.currentTableId = keepTable;
            } else {
                this.currentTableId = null;
                this.showView('overview');
            }
            this.refreshCurrentView();
        }
    },

    doRedo() {
        const keepTable = this.currentTableId;
        if (Engine.redo()) {
            if (keepTable && Engine.getTable(keepTable)) {
                this.currentTableId = keepTable;
            } else {
                this.currentTableId = null;
                this.showView('overview');
            }
            this.refreshCurrentView();
        }
    },

    refreshCurrentView() {
        this.renderSidebarTables();
        if (this.view === 'data' && this.currentTableId) this.renderDataTable(true);
        else if (this.view === 'relationships') this.renderRelationships();
        else if (this.view === 'queries') this.setupQueryBuilder();
        else if (this.view === 'forms') this.setupForms();
        else if (this.view === 'csvimport') this.setupCsvImport();
        else this.renderOverview();
        this.updateHistoryButtons();
    },

    updateHistoryButtons() {
        const u = document.getElementById('btn-undo');
        const r = document.getElementById('btn-redo');
        if (u) u.disabled = !Engine.canUndo();
        if (r) r.disabled = !Engine.canRedo();
    },

    /* ================= app shell ================= */
    renderApp() {
        document.getElementById('no-database-state').hidden = true;
        document.getElementById('workspace-main').hidden = false;
        document.getElementById('db-name-display').textContent = Engine.db.name;
        this.renderSidebarTables();
        this.updateHistoryButtons();
        Engine.setSaveStatus('saved');
        this.showView('overview');
    },

    showView(view) {
        this.view = view;
        document.body.classList.remove('nav-open');
        const map = {
            overview: 'panel-overview',
            designer: 'panel-designer',
            data: 'panel-data',
            relationships: 'panel-relationships',
            queries: 'panel-queries',
            forms: 'panel-forms',
            csvimport: 'panel-csvimport',
            info: 'panel-info'
        };
        Object.values(map).forEach((p) => { document.getElementById(p).hidden = true; });
        document.getElementById(map[view]).hidden = false;

        document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
            b.classList.toggle('active', b.dataset.view === view);
        });

        if (view === 'overview') this.renderOverview();
        if (view === 'relationships') this.renderRelationships();
        if (view === 'queries') this.setupQueryBuilder();
        if (view === 'forms') this.setupForms();
        if (view === 'csvimport') this.setupCsvImport();
        if (view === 'info' && this.currentTableId) this.renderTableInfo();
        if (view === 'data' && this.currentTableId) this.renderDataTable(true);
        this.updateStatus();
    },

    selectTable(tableId) {
        this.currentTableId = tableId;
        this.searchQuery = '';
        this.filters = [];
        this.sortColumn = null;
        this.currentPage = 1;
        const s = document.getElementById('table-search');
        if (s) s.value = '';
        this.renderSidebarTables();
        this.showView('data');
    },

    /* ================= sidebar ================= */
    renderSidebarTables() {
        const list = document.getElementById('sidebar-tables');
        if (!list) return;
        list.innerHTML = '';
        const tables = Engine.tables();
        if (!tables.length) {
            const li = document.createElement('li');
            li.className = 'sidebar-empty';
            li.textContent = t('noTablesYet');
            list.appendChild(li);
            return;
        }
        tables.forEach((tbl) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-item nav-table' + (tbl.id === this.currentTableId && this.view === 'data' ? ' active' : '');
            btn.type = 'button';

            const icon = document.createElement('span');
            icon.className = 'nav-icon' ;
            icon.textContent = '▦';
            const label = document.createElement('span');
            label.className = 'nav-label';
            label.textContent = tbl.name;
            const count = document.createElement('span');
            count.className = 'nav-count';
            count.textContent = tbl.records.length;
            btn.appendChild(icon);
            btn.appendChild(label);
            btn.appendChild(count);
            btn.addEventListener('click', () => this.selectTable(tbl.id));
            li.appendChild(btn);
            list.appendChild(li);
        });
    },

    updateStatus() {
        const dbEl = document.getElementById('status-db');
        const tableEl = document.getElementById('status-table');
        const recEl = document.getElementById('status-records');
        if (!Engine.db) return;
        dbEl.textContent = Engine.db.name;
        const table = this.currentTableId ? Engine.getTable(this.currentTableId) : null;
        tableEl.textContent = table ? table.name : '—';
        recEl.textContent = table ? String(table.records.length) : '—';
    },

    /* ================= overview ================= */
    renderOverview() {
        const stats = Engine.stats();
        document.getElementById('stat-tables').textContent = stats.tables;
        document.getElementById('stat-records').textContent = stats.records;
        document.getElementById('stat-fields').textContent = stats.fields;
        document.getElementById('stat-relations').textContent = stats.relationships;
        document.getElementById('db-created').textContent = new Date(Engine.db.createdAt).toLocaleString();
        document.getElementById('db-updated').textContent = formatRelativeTime(Engine.db.updatedAt);

        const grid = document.getElementById('tables-grid');
        const empty = document.getElementById('tables-empty');
        grid.innerHTML = '';
        const tables = Engine.tables();
        empty.hidden = tables.length > 0;
        tables.forEach((tbl) => {
            const card = document.createElement('article');
            card.className = 'table-card';

            const h = document.createElement('h3');
            h.textContent = tbl.name;
            const meta = document.createElement('p');
            meta.className = 'table-card-meta';
            const pk = Engine.pkFields(tbl).map((f) => f.name).join(', ');
            meta.textContent = tp('fieldsCount', tbl.fields.length, { n: tbl.fields.length }) +
                ' · ' + tp('recordsCount', tbl.records.length, { n: tbl.records.length }) +
                (pk ? ' · ' + t('primaryKey') + ': ' + pk : '');
            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const mkBtn = (label, cls, fn) => {
                const b = document.createElement('button');
                b.className = cls;
                b.type = 'button';
                b.textContent = label;
                b.addEventListener('click', fn);
                return b;
            };
            actions.appendChild(mkBtn(t('open'), 'btn btn-primary btn-sm', () => this.selectTable(tbl.id)));
            actions.appendChild(mkBtn(t('designTab'), 'btn btn-ghost btn-sm', () => this.openDesigner(tbl.id)));
            actions.appendChild(mkBtn(t('rename'), 'btn btn-ghost btn-sm', () => this.renameTableFlow(tbl.id)));
            actions.appendChild(mkBtn(t('delete'), 'btn btn-danger-ghost btn-sm', () => this.deleteTableFlow(tbl.id)));

            card.appendChild(h);
            card.appendChild(meta);
            card.appendChild(actions);
            grid.appendChild(card);
        });
    },

    /* ================= designer ================= */
    openDesigner(tableId) {
        this.editingTableId = tableId;
        const table = tableId ? Engine.getTable(tableId) : null;
        document.getElementById('designer-title').textContent = table
            ? t('tableDesigner') + ' — ' + table.name
            : t('newTableBtn');
        document.getElementById('designer-table-name').value = table ? table.name : '';
        this.designerFields = table
            ? Utils.deepClone(table.fields)
            : [{ name: t('idFieldDefault'), type: 'auto_id', required: true, primaryKey: true }];
        this.renderDesignerFields();
        this.showView('designer');
    },

    renderDesignerFields() {
        const tbody = document.getElementById('designer-fields-body');
        tbody.innerHTML = '';
        this.designerFields.forEach((field, index) => {
            const tr = document.createElement('tr');

            // name
            const tdName = document.createElement('td');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'input-field input-sm';
            nameInput.value = field.name;
            nameInput.setAttribute('aria-label', t('fieldName'));
            nameInput.addEventListener('input', () => { this.designerFields[index].name = nameInput.value; });
            tdName.appendChild(nameInput);

            // type
            const tdType = document.createElement('td');
            const typeSel = document.createElement('select');
            typeSel.className = 'input-field input-sm';
            typeSel.setAttribute('aria-label', t('type'));
            Engine.FIELD_TYPES.forEach((type) => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = UI.fieldTypeLabel(type);
                if (type === field.type) opt.selected = true;
                typeSel.appendChild(opt);
            });
            typeSel.addEventListener('change', () => {
                this.designerFields[index].type = typeSel.value;
                if (typeSel.value === 'auto_id') {
                    this.designerFields[index].primaryKey = true;
                    this.designerFields[index].required = true;
                }
                this.renderDesignerFields();
            });
            tdType.appendChild(typeSel);

            // PK
            const tdPk = document.createElement('td');
            tdPk.className = 'cell-center';
            const pkCb = document.createElement('input');
            pkCb.type = 'checkbox';
            pkCb.checked = !!field.primaryKey;
            pkCb.disabled = field.type === 'auto_id';
            pkCb.setAttribute('aria-label', t('primaryKey'));
            pkCb.addEventListener('change', () => {
                this.designerFields[index].primaryKey = pkCb.checked;
                if (pkCb.checked) this.designerFields[index].required = true;
            });
            tdPk.appendChild(pkCb);

            // Required
            const tdReq = document.createElement('td');
            tdReq.className = 'cell-center';
            const reqCb = document.createElement('input');
            reqCb.type = 'checkbox';
            reqCb.checked = !!field.required;
            reqCb.disabled = !!field.primaryKey || field.type === 'auto_id';
            reqCb.setAttribute('aria-label', t('required'));
            reqCb.addEventListener('change', () => { this.designerFields[index].required = reqCb.checked; });
            tdReq.appendChild(reqCb);

            // actions
            const tdAct = document.createElement('td');
            tdAct.className = 'cell-center cell-actions';
            const up = this.iconBtn('↑', t('add'), () => this.moveDesignerField(index, -1));
            const down = this.iconBtn('↓', t('add'), () => this.moveDesignerField(index, 1));
            const del = this.iconBtn('✕', t('delete'), () => {
                this.designerFields.splice(index, 1);
                this.renderDesignerFields();
            }, 'icon-btn-danger');
            tdAct.appendChild(up);
            tdAct.appendChild(down);
            tdAct.appendChild(del);

            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tr.appendChild(tdPk);
            tr.appendChild(tdReq);
            tr.appendChild(tdAct);
            tbody.appendChild(tr);
        });
    },

    iconBtn(char, label, fn, extraCls) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-btn' + (extraCls ? ' ' + extraCls : '');
        b.textContent = char;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.addEventListener('click', fn);
        return b;
    },

    moveDesignerField(index, dir) {
        const to = index + dir;
        if (to < 0 || to >= this.designerFields.length) return;
        const tmp = this.designerFields[index];
        this.designerFields[index] = this.designerFields[to];
        this.designerFields[to] = tmp;
        this.renderDesignerFields();
    },

    designerAddField() {
        this.designerFields.push({ name: '', type: 'text', required: false, primaryKey: false });
        this.renderDesignerFields();
        const inputs = document.querySelectorAll('#designer-fields-body input[type="text"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
    },

    designerSave() {
        const name = document.getElementById('designer-table-name').value;
        try {
            const saved = Engine.saveTableStructure(this.editingTableId, name, this.designerFields);
            UI.toast(t(saved && this.editingTableId ? 'toastTableUpdated' : 'toastTableCreated', { name: saved.name }), 'success');
            this.currentTableId = saved.id;
            this.showView('data');
        } catch (e) {
            UI.handleError(e);
        }
    },

    /* ================= table rename/delete flows ================= */
    renameTableFlow(tableId) {
        const table = Engine.getTable(tableId);
        if (!table) return;
        UI.prompt('renameTableTitle', table.name, 'newTableNamePlaceholder').then((name) => {
            if (!name) return;
            try {
                const res = Engine.renameTable(tableId, name);
                UI.toast(t('toastTableRenamed', { name: res.newName }), 'success');
            } catch (e) {
                UI.handleError(e);
            }
        });
    },

    deleteTableFlow(tableId) {
        const table = Engine.getTable(tableId);
        if (!table) return;
        UI.confirm('confirmDeleteTableTitle', t('confirmDeleteTableMsg', { name: table.name })).then((ok) => {
            if (!ok) return;
            Engine.deleteTable(tableId);
            if (this.currentTableId === tableId) this.currentTableId = null;
            UI.toast(t('toastTableDeleted', { name: table.name }), 'success');
            this.showView('overview');
        });
    },

    /* ================= datasheet ================= */
    visibleFields(table) {
        return table.fields;
    },

    filteredRecords() {
        const table = Engine.getTable(this.currentTableId);
        if (!table) return [];
        let rows = table.records.map((rec, i) => ({ rec, index: i }));
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            rows = rows.filter(({ rec }) =>
                table.fields.some((f) => String(rec[f.name] ?? '').toLowerCase().includes(q)));
        }
        this.filters.forEach((flt) => {
            const field = table.fields.find((f) => f.name === flt.field);
            if (!field) return;
            rows = rows.filter(({ rec }) => this.matchFilter(field, rec[field.name], flt));
        });
        if (this.sortColumn) {
            const dir = this.sortDirection === 'asc' ? 1 : -1;
            rows.sort((a, b) => {
                const va = a.rec[this.sortColumn], vb = b.rec[this.sortColumn];
                return this.compareValues(va, vb) * dir;
            });
        }
        return rows;
    },

    compareValues(a, b) {
        const ea = a === undefined || a === null || a === '';
        const eb = b === undefined || b === null || b === '';
        if (ea && eb) return 0;
        if (ea) return 1;
        if (eb) return -1;
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    },

    matchFilter(field, value, flt) {
        const empty = value === undefined || value === null || value === '';
        switch (flt.op) {
            case 'is_empty': return empty;
            case 'is_not_empty': return !empty;
            default: break;
        }
        if (empty) return false;
        const target = flt.value;
        const isNum = ['integer', 'decimal', 'number', 'auto_id'].indexOf(field.type) !== -1;
        if (isNum && !isNaN(Number(target))) {
            const cmp = Number(value) - Number(target);
            switch (flt.op) {
                case 'equals': return cmp === 0;
                case 'not_equals': return cmp !== 0;
                case 'greater_than': return cmp > 0;
                case 'less_than': return cmp < 0;
                case 'greater_equal': return cmp >= 0;
                case 'less_equal': return cmp <= 0;
                default: break;
            }
        }
        const sa = String(value).toLowerCase();
        const sb = String(target).toLowerCase();
        switch (flt.op) {
            case 'equals': return sa === sb;
            case 'not_equals': return sa !== sb;
            case 'contains': return sa.includes(sb);
            case 'starts_with': return sa.startsWith(sb);
            case 'ends_with': return sa.endsWith(sb);
            case 'greater_than': return sa > sb;
            case 'less_than': return sa < sb;
            case 'greater_equal': return sa >= sb;
            case 'less_equal': return sa <= sb;
            default: return true;
        }
    },

    addFilter() {
        const colSel = document.getElementById('filter-column');
        const opSel = document.getElementById('filter-operator');
        const valInput = document.getElementById('filter-value');
        if (!colSel.value) { UI.toast(t('errSelectTableFirst'), 'error'); return; }
        const needsValue = ['is_empty', 'is_not_empty'].indexOf(opSel.value) === -1;
        if (needsValue && !valInput.value.trim()) { UI.toast(t('errFilterValue'), 'error'); return; }
        this.filters.push({ field: colSel.value, op: opSel.value, value: valInput.value.trim() });
        valInput.value = '';
        this.currentPage = 1;
        this.renderFilterChips();
        this.renderDataRows();
    },

    renderFilterChips() {
        const wrap = document.getElementById('active-filters');
        wrap.innerHTML = '';
        this.filters.forEach((flt, i) => {
            const chip = document.createElement('span');
            chip.className = 'filter-chip';
            const txt = document.createElement('span');
            txt.textContent = flt.field + ' ' + t('op_' + flt.op) + (['is_empty', 'is_not_empty'].indexOf(flt.op) === -1 ? ' "' + flt.value + '"' : '');
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'chip-x';
            x.textContent = '✕';
            x.setAttribute('aria-label', t('remove'));
            x.addEventListener('click', () => {
                this.filters.splice(i, 1);
                this.renderFilterChips();
                this.renderDataRows();
            });
            chip.appendChild(txt);
            chip.appendChild(x);
            wrap.appendChild(chip);
        });
        document.getElementById('btn-clear-filters').hidden = !this.filters.length && !this.searchQuery;
    },

    renderDataTable(full) {
        const table = Engine.getTable(this.currentTableId);
        if (!table) { this.showView('overview'); return; }
        document.getElementById('data-table-name').textContent = table.name;
        if (full) {
            this.renderFilterChips();
            const colSel = document.getElementById('filter-column');
            colSel.innerHTML = '';
            table.fields.forEach((f) => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.name;
                colSel.appendChild(opt);
            });
        }
        this.renderDataHead(table);
        this.renderDataRows();
        this.updateStatus();
    },

    renderDataHead(table) {
        const thead = document.getElementById('data-head');
        thead.innerHTML = '';
        const tr = document.createElement('tr');

        const thIdx = document.createElement('th');
        thIdx.className = 'col-rownum';
        thIdx.scope = 'col';
        thIdx.textContent = '#';
        tr.appendChild(thIdx);

        table.fields.forEach((field) => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.dataset.field = field.name;
            const inner = document.createElement('button');
            inner.type = 'button';
            inner.className = 'th-sort';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = field.name;
            inner.appendChild(nameSpan);
            if (field.primaryKey) {
                const badge = document.createElement('span');
                badge.className = 'badge badge-pk';
                badge.textContent = 'PK';
                badge.title = t('primaryKey');
                inner.appendChild(badge);
            }
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            if (this.sortColumn === field.name) {
                arrow.textContent = this.sortDirection === 'asc' ? '▲' : '▼';
                th.classList.add('sorted');
            }
            inner.appendChild(arrow);
            inner.title = t('ariaSortByColumn') + ' — ' + UI.fieldTypeLabel(field.type);
            inner.addEventListener('click', () => {
                if (this.sortColumn === field.name) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortColumn = field.name;
                    this.sortDirection = 'asc';
                }
                this.renderDataHead(table);
                this.renderDataRows();
            });
            inner.addEventListener('dblclick', (e) => {
                e.preventDefault();
                UI.prompt('renameColumnTitle', field.name, 'newColumnNamePlaceholder').then((nn) => {
                    if (!nn) return;
                    try {
                        Engine.renameField(table.id, field.name, nn);
                        if (this.sortColumn === field.name) this.sortColumn = nn;
                        this.filters.forEach((f) => { if (f.field === field.name) f.field = nn; });
                        UI.toast(t('renameColumnTitle') + ' → ' + nn, 'success');
                    } catch (err) { UI.handleError(err); }
                });
            });
            th.appendChild(inner);
            tr.appendChild(th);
        });

        const thAct = document.createElement('th');
        thAct.scope = 'col';
        thAct.textContent = t('actions');
        thAct.className = 'col-actions';
        tr.appendChild(thAct);
        thead.appendChild(tr);
    },

    renderDataRows() {
        const table = Engine.getTable(this.currentTableId);
        if (!table) return;
        const tbody = document.getElementById('data-body');
        tbody.innerHTML = '';
        const rows = this.filteredRecords();
        const totalPages = Math.max(1, Math.ceil(rows.length / this.pageSize));
        this.currentPage = Math.min(Math.max(1, this.currentPage), totalPages);
        const start = (this.currentPage - 1) * this.pageSize;
        const pageRows = rows.slice(start, start + this.pageSize);

        pageRows.forEach(({ rec, index }, displayIdx) => {
            const tr = document.createElement('tr');
            const tdIdx = document.createElement('td');
            tdIdx.className = 'col-rownum';
            tdIdx.textContent = start + displayIdx + 1;
            tr.appendChild(tdIdx);

            table.fields.forEach((field) => {
                const td = document.createElement('td');
                const value = rec[field.name];
                if (field.type === 'boolean') {
                    const span = document.createElement('span');
                    span.className = 'bool-pill' + (value ? ' bool-true' : ' bool-false');
                    span.textContent = value ? t('yesValue') : t('noValue');
                    td.appendChild(span);
                } else if (Engine.isValueEmpty(value)) {
                    td.className = 'cell-empty';
                    td.textContent = '—';
                } else {
                    td.textContent = String(value);
                    td.title = String(value);
                }
                tr.appendChild(td);
            });

            const tdAct = document.createElement('td');
            tdAct.className = 'col-actions cell-actions';
            const editBtn = this.iconBtn('✎', t('edit'), () => this.editRecord(index));
            const delBtn = this.iconBtn('🗑', t('delete'), () => this.deleteRecordFlow(index), 'icon-btn-danger');
            tdAct.appendChild(editBtn);
            tdAct.appendChild(delBtn);
            tr.appendChild(tdAct);
            tbody.appendChild(tr);
        });

        // empty states row
        const stateBox = document.getElementById('data-empty-state');
        if (rows.length === 0) {
            stateBox.hidden = false;
            const msg = table.records.length === 0 ? t('noRecordsYet') : t('noSearchResults');
            stateBox.querySelector('.empty-text').textContent = msg;
            const cta = stateBox.querySelector('.empty-action');
            cta.hidden = table.records.length !== 0;
            cta.textContent = t('addRecord');
            cta.onclick = () => this.addRecord();
        } else {
            stateBox.hidden = true;
        }

        // pagination
        const from = rows.length ? start + 1 : 0;
        const to = Math.min(start + this.pageSize, rows.length);
        document.getElementById('pagination-info').textContent =
            t('showingRecords', { from, to, total: rows.length });
        document.getElementById('btn-prev-page').disabled = this.currentPage <= 1;
        document.getElementById('btn-first-page').disabled = this.currentPage <= 1;
        document.getElementById('btn-next-page').disabled = this.currentPage >= totalPages;
        document.getElementById('btn-last-page').disabled = this.currentPage >= totalPages;
        document.getElementById('btn-clear-filters').hidden = !this.filters.length && !this.searchQuery;
        this.updateStatus();
    },

    addRecord() {
        RecordForm.open(this.currentTableId, null, () => {
            this.renderDataRows();
            this.renderSidebarTables();
        });
    },

    editRecord(recordIndex) {
        RecordForm.open(this.currentTableId, recordIndex, () => {
            this.renderDataRows();
            this.renderSidebarTables();
        });
    },

    deleteRecordFlow(recordIndex) {
        UI.confirm('confirmDeleteRecordTitle', t('confirmDeleteRecordMsg')).then((ok) => {
            if (!ok) return;
            Engine.deleteRecord(this.currentTableId, recordIndex);
            UI.toast(t('toastRecordDeleted'), 'success');
            this.renderDataRows();
            this.renderSidebarTables();
        });
    },

    /* ================= live column ops from datasheet ================= */
    addColumnFlow() {
        const table = Engine.getTable(this.currentTableId);
        if (!table) return;
        UI.prompt('addColumnBtn', '', 'columnNamePrompt').then((name) => {
            if (!name) return;
            UI.prompt('columnTypePrompt', 'text', null).then((typeAns) => {
                const type = Engine.FIELD_TYPES.indexOf((typeAns || 'text').trim()) !== -1
                    ? (typeAns || 'text').trim() : 'text';
                try {
                    Engine.addField(table.id, { name, type, required: false, primaryKey: false });
                    UI.toast(t('toastFieldAdded', { name }), 'success');
                } catch (e) { UI.handleError(e); }
            });
        });
    },

    /* ================= table info ================= */
    renderTableInfo() {
        const table = Engine.getTable(this.currentTableId);
        if (!table) { this.showView('overview'); return; }
        document.getElementById('info-title').textContent = t('tableInformation') + ' — ' + table.name;
        document.getElementById('info-created').textContent = new Date(table.createdAt || Date.now()).toLocaleString();
        document.getElementById('info-updated').textContent = formatRelativeTime(table.updatedAt);
        document.getElementById('info-field-count').textContent = table.fields.length;
        document.getElementById('info-record-count').textContent = table.records.length;
        const pks = Engine.pkFields(table).map((f) => f.name).join(', ') || t('none');
        document.getElementById('info-pk').textContent = pks;
        const rels = Engine.getRelationships().filter(
            (r) => r.sourceTableId === table.id || r.targetTableId === table.id);
        document.getElementById('info-rel-count').textContent = rels.length;

        const tbody = document.getElementById('info-fields-body');
        tbody.innerHTML = '';
        table.fields.forEach((f) => {
            const tr = document.createElement('tr');
            const mk = (txt, cls) => {
                const td = document.createElement('td');
                td.textContent = txt;
                if (cls) td.className = cls;
                return td;
            };
            tr.appendChild(mk(f.name));
            tr.appendChild(mk(UI.fieldTypeLabel(f.type)));
            tr.appendChild(mk(f.primaryKey ? t('yesValue') : t('noValue'), f.primaryKey ? 'cell-strong' : ''));
            tr.appendChild(mk(f.required ? t('yesValue') : t('noValue')));
            const filled = table.records.filter((r) => !Engine.isValueEmpty(r[f.name])).length;
            tr.appendChild(mk(filled + ' / ' + table.records.length));
            tbody.appendChild(tr);
        });
    },

    /* ================= relationships ================= */
    renderRelationships() {
        const rels = Engine.getRelationships();
        const list = document.getElementById('relationships-list');
        const empty = document.getElementById('relationships-empty');
        list.innerHTML = '';
        empty.hidden = rels.length > 0;

        rels.forEach((rel) => {
            const src = Engine.getTable(rel.sourceTableId);
            const tgt = Engine.getTable(rel.targetTableId);
            const row = document.createElement('div');
            row.className = 'relationship-card';

            const line = document.createElement('div');
            line.className = 'rel-line';
            const parentChip = document.createElement('span');
            parentChip.className = 'rel-node rel-parent';
            parentChip.textContent = (src ? src.name : '?') + '.' + rel.sourceField;
            const arrow = document.createElement('span');
            arrow.className = 'rel-arrow';
            arrow.textContent = '⟶';
            arrow.setAttribute('aria-hidden', 'true');
            const childChip = document.createElement('span');
            childChip.className = 'rel-node rel-child';
            childChip.textContent = (tgt ? tgt.name : '?') + '.' + rel.targetField;
            line.appendChild(parentChip);
            line.appendChild(arrow);
            line.appendChild(childChip);

            const check = Engine.checkIntegrity(rel);
            const meta = document.createElement('p');
            meta.className = 'rel-meta';
            meta.textContent = check.total === 0
                ? t('integrityOk')
                : (check.missing === 0
                    ? t('integrityOk') + ' (' + check.matched + '/' + check.total + ')'
                    : t('integrityIssues', { n: check.missing }));
            if (check.missing > 0) meta.classList.add('rel-warning');

            const actions = document.createElement('div');
            actions.className = 'card-actions';
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-danger-ghost btn-sm';
            delBtn.textContent = t('delete');
            delBtn.addEventListener('click', () => {
                UI.confirm('confirmDeleteRelTitle', t('confirmDeleteRelMsg')).then((ok) => {
                    if (!ok) return;
                    Engine.deleteRelationship(rel.id);
                    UI.toast(t('toastRelDeleted'), 'success');
                    this.renderRelationships();
                });
            });
            actions.appendChild(delBtn);

            row.appendChild(line);
            row.appendChild(meta);
            row.appendChild(actions);
            list.appendChild(row);
        });

        this.populateRelSelectors();
    },

    populateRelSelectors() {
        const tables = Engine.tables();
        const selects = [
            ['rel-source-table', 'rel-source-field', 'source'],
            ['rel-target-table', 'rel-target-field', 'target']
        ];
        selects.forEach(([tblId, fldId]) => {
            const sel = document.getElementById(tblId);
            const prev = sel.value;
            sel.innerHTML = '<option value="">' + t('selectTableOption') + '</option>';
            tables.forEach((tbl) => {
                const opt = document.createElement('option');
                opt.value = tbl.id;
                opt.textContent = tbl.name;
                sel.appendChild(opt);
            });
            if (tables.some((x) => x.id === prev)) sel.value = prev;
            this.fillRelFields(fldId, sel.value);
            sel.onchange = () => this.fillRelFields(fldId, sel.value);
        });
    },

    fillRelFields(fieldSelId, tableId) {
        const sel = document.getElementById(fieldSelId);
        sel.innerHTML = '<option value="">' + t('none') + '</option>';
        const table = Engine.getTable(tableId);
        if (!table) return;
        table.fields.forEach((f) => {
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.textContent = f.name + (f.primaryKey ? ' (PK)' : '');
            sel.appendChild(opt);
        });
    },

    createRelationship() {
        try {
            Engine.createRelationship(
                document.getElementById('rel-source-table').value,
                document.getElementById('rel-source-field').value,
                document.getElementById('rel-target-table').value,
                document.getElementById('rel-target-field').value
            );
            UI.toast(t('toastRelCreated'), 'success');
            this.renderRelationships();
        } catch (e) {
            UI.handleError(e);
        }
    },

    /* ================= query builder ================= */
    setupQueryBuilder() {
        const sel = document.getElementById('qb-table');
        const prev = sel.value;
        sel.innerHTML = '<option value="">' + t('selectTableOption') + '</option>';
        Engine.tables().forEach((tbl) => {
            const opt = document.createElement('option');
            opt.value = tbl.id;
            opt.textContent = tbl.name;
            sel.appendChild(opt);
        });
        if (Engine.getTable(prev)) sel.value = prev;
        this.qbPopulateSortFields();
        this.qbConditions = [];
        this.qbFields = null;
        this.qbRenderFields();
        this.qbRenderConditions();
        document.getElementById('qb-results').innerHTML = '';
        document.getElementById('qb-result-count').textContent = '';
        document.getElementById('qb-empty-state').hidden = false;
    },

    qbTableChanged() {
        this.qbPopulateSortFields();
        this.qbConditions = [];
        this.qbFields = null;
        this.qbRenderFields();
        this.qbRenderConditions();
    },

    qbPopulateSortFields() {
        const sortSel = document.getElementById('qb-sort-field');
        if (!sortSel) return;
        const prev = sortSel.value;
        const table = Engine.getTable(document.getElementById('qb-table').value);
        sortSel.innerHTML = '<option value="">' + t('none') + '</option>';
        if (table) {
            table.fields.forEach((f) => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.name;
                sortSel.appendChild(opt);
            });
        }
        if (prev && (!table || table.fields.some((f) => f.name === prev))) sortSel.value = prev;
    },

    qbRenderFields() {
        const wrap = document.getElementById('qb-fields');
        wrap.innerHTML = '';
        const table = Engine.getTable(document.getElementById('qb-table').value);
        if (!table) return;
        table.fields.forEach((f) => {
            const label = document.createElement('label');
            label.className = 'checkbox-control';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !this.qbFields || this.qbFields.indexOf(f.name) !== -1;
            cb.addEventListener('change', () => {
                if (!this.qbFields) this.qbFields = table.fields.map((x) => x.name);
                if (cb.checked) {
                    if (this.qbFields.indexOf(f.name) === -1) this.qbFields.push(f.name);
                } else {
                    this.qbFields = this.qbFields.filter((n) => n !== f.name);
                }
            });
            const span = document.createElement('span');
            span.textContent = f.name;
            label.appendChild(cb);
            label.appendChild(span);
            wrap.appendChild(label);
        });
    },

    qbRenderConditions() {
        const wrap = document.getElementById('qb-conditions');
        wrap.innerHTML = '';
        const table = Engine.getTable(document.getElementById('qb-table').value);
        if (!table) return;
        (this.qbConditions || []).forEach((cond, i) => {
            const row = document.createElement('div');
            row.className = 'condition-row';

            const logic = document.createElement('select');
            logic.className = 'input-field';
            [['AND', t('logicAnd')], ['OR', t('logicOr')]].forEach(([v, l]) => {
                const o = document.createElement('option');
                o.value = v; o.textContent = l;
                if (cond.logic === v) o.selected = true;
                logic.appendChild(o);
            });
            logic.disabled = i === 0;
            logic.onchange = () => { cond.logic = logic.value; };

            const fieldSel = document.createElement('select');
            fieldSel.className = 'input-field';
            table.fields.forEach((f) => {
                const o = document.createElement('option');
                o.value = f.name; o.textContent = f.name;
                if (cond.field === f.name) o.selected = true;
                fieldSel.appendChild(o);
            });
            fieldSel.onchange = () => { cond.field = fieldSel.value; };

            const opSel = document.createElement('select');
            opSel.className = 'input-field';
            ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with',
             'greater_than', 'greater_equal', 'less_than', 'less_equal',
             'is_empty', 'is_not_empty'].forEach((op) => {
                const o = document.createElement('option');
                o.value = op; o.textContent = t('op_' + op);
                if (cond.op === op) o.selected = true;
                opSel.appendChild(o);
            });
            opSel.onchange = () => {
                cond.op = opSel.value;
                valueInput.hidden = ['is_empty', 'is_not_empty'].indexOf(cond.op) !== -1;
            };

            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.className = 'input-field';
            valueInput.placeholder = t('filterValue');
            valueInput.value = cond.value || '';
            valueInput.hidden = ['is_empty', 'is_not_empty'].indexOf(cond.op) !== -1;
            valueInput.oninput = () => { cond.value = valueInput.value; };

            const rm = this.iconBtn('✕', t('remove'), () => {
                this.qbConditions.splice(i, 1);
                this.qbRenderConditions();
            }, 'icon-btn-danger');

            [logic, fieldSel, opSel, valueInput, rm].forEach((el) => row.appendChild(el));
            wrap.appendChild(row);
        });
    },

    qbAddCondition() {
        const table = Engine.getTable(document.getElementById('qb-table').value);
        if (!table) { UI.toast(t('errSelectTableFirst'), 'error'); return; }
        this.qbConditions.push({ logic: 'AND', field: table.fields[0].name, op: 'equals', value: '' });
        this.qbRenderConditions();
    },

    qbRun() {
        const table = Engine.getTable(document.getElementById('qb-table').value);
        if (!table) { UI.toast(t('errSelectTable'), 'error'); return; }
        const fields = (this.qbFields && this.qbFields.length ? this.qbFields : table.fields.map((f) => f.name));
        if (!fields.length) { UI.toast(t('errSelectTable'), 'error'); return; }

        let rows = table.records.slice();
        let result = null;
        (this.qbConditions || []).forEach((cond, i) => {
            const field = table.fields.find((f) => f.name === cond.field);
            if (!field) return;
            const test = (rec) => this.matchFilter(field, rec[field.name], cond);
            if (i === 0) result = rows.filter(test);
            else if (cond.logic === 'OR') result = result.concat(rows.filter((r) => test(r) && result.indexOf(r) === -1));
            else result = result.filter(test);
        });
        if (!result) result = rows;

        const sortField = document.getElementById('qb-sort-field').value;
        const sortDir = document.getElementById('qb-sort-dir').value;
        if (sortField) {
            result.sort((a, b) => this.compareValues(a[sortField], b[sortField]) * (sortDir === 'desc' ? -1 : 1));
        }

        document.getElementById('qb-empty-state').hidden = true;
        document.getElementById('qb-result-count').textContent =
            tp('resultsCount', result.length, { n: result.length });
        this.renderResultTable('qb-results', table, fields, result);
    },

    renderResultTable(containerId, table, fieldNames, records) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!records.length) {
            const p = document.createElement('p');
            p.className = 'muted center';
            p.textContent = t('noResults');
            container.appendChild(p);
            return;
        }
        const scroll = document.createElement('div');
        scroll.className = 'table-scroll';
        const tbl = document.createElement('table');
        tbl.className = 'data-table compact';
        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        fieldNames.forEach((fn) => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = fn;
            htr.appendChild(th);
        });
        thead.appendChild(htr);
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        records.forEach((rec) => {
            const tr = document.createElement('tr');
            fieldNames.forEach((fn) => {
                const td = document.createElement('td');
                const field = table.fields.find((f) => f.name === fn);
                if (field && field.type === 'boolean') {
                    td.textContent = rec[fn] ? t('yesValue') : t('noValue');
                } else {
                    td.textContent = Engine.isValueEmpty(rec[fn]) ? '—' : String(rec[fn]);
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        scroll.appendChild(tbl);
        container.appendChild(scroll);
    },

    /* ================= forms view ================= */
    setupForms() {
        const sel = document.getElementById('form-table-select');
        const prev = sel.value;
        sel.innerHTML = '<option value="">' + t('selectTableOption') + '</option>';
        Engine.tables().forEach((tbl) => {
            const opt = document.createElement('option');
            opt.value = tbl.id;
            opt.textContent = tbl.name;
            sel.appendChild(opt);
        });
        if (Engine.getTable(prev)) sel.value = prev;
        this.renderFormsView();
    },

    renderFormsView() {
        const tableId = document.getElementById('form-table-select').value;
        const area = document.getElementById('forms-area');
        area.innerHTML = '';
        const table = Engine.getTable(tableId);
        if (!table) {
            const hint = document.createElement('p');
            hint.className = 'muted center form-hint';
            hint.textContent = t('selectTableForForm');
            area.appendChild(hint);
            return;
        }
        const editSel = document.getElementById('form-edit-select');
        editSel.innerHTML = '<option value="">' + t('newRecord') + '</option>';
        table.records.forEach((rec, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            const pk = Engine.pkFields(table)[0];
            const label = pk && rec[pk.name] ? '#' + rec[pk.name] : '#' + (i + 1);
            const firstText = table.fields.find((f) => f.type === 'text' && rec[f.name]);
            opt.textContent = label + (firstText ? ' — ' + String(rec[firstText.name]).slice(0, 40) : '');
            editSel.appendChild(opt);
        });
        editSel.value = this._formEditIndex !== undefined ? String(this._formEditIndex) : '';
        this.renderFormEditor();
    },

    currentFormIndex() {
        const v = document.getElementById('form-edit-select').value;
        return v === '' ? null : parseInt(v, 10);
    },

    renderFormEditor() {
        const tableId = document.getElementById('form-table-select').value;
        const table = Engine.getTable(tableId);
        const body = document.getElementById('inline-form-fields');
        body.innerHTML = '';
        if (!table) return;
        const idx = this.currentFormIndex();
        const record = idx !== null ? table.records[idx] : null;
        this._formEditIndex = idx === null ? undefined : idx;

        document.getElementById('btn-form-update').textContent =
            idx !== null ? t('updateRecord') : t('createRecord');

        table.fields.forEach((field) => {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            const inputId = 'inline-f-' + Utils.uid();
            label.setAttribute('for', inputId);
            label.textContent = field.name + (field.required ? ' *' : '') +
                (field.type === 'auto_id' && idx === null ? ' ' + t('autoGenerated') : '');
            const input = RecordForm.buildInput(field, record ? record[field.name] : undefined);
            input.id = inputId;
            input.dataset.fieldName = field.name;
            group.appendChild(label);
            group.appendChild(input);
            const err = document.createElement('p');
            err.className = 'field-error';
            err.hidden = true;
            group.appendChild(err);
            body.appendChild(group);
        });
    },

    collectInlineForm(table) {
        const record = {};
        const groups = document.querySelectorAll('#inline-form-fields .form-group');
        let hasError = false;
        table.fields.forEach((field, i) => {
            const group = groups[i];
            const input = group.querySelector('[data-field-name]');
            let value;
            if (field.type === 'boolean') {
                value = input.querySelector('input[type="checkbox"]').checked;
            } else if (field.type === 'datetime') {
                value = input.value ? input.value.replace('T', ' ') + ':00' : '';
            } else if (field.type === 'auto_id') {
                value = '';
            } else {
                value = input.value;
            }
            record[field.name] = value;
            const errEl = group.querySelector('.field-error');
            const errKey = Engine.validateFieldValue(field, value);
            if (errKey) {
                errEl.hidden = false;
                errEl.textContent = t(errKey, { field: field.name });
                hasError = true;
            } else {
                errEl.hidden = true;
            }
        });
        return { record, hasError };
    },

    formNewRecord() {
        const tableId = document.getElementById('form-table-select').value;
        const table = Engine.getTable(tableId);
        if (!table) { UI.toast(t('errSelectTable'), 'error'); return; }
        const { record, hasError } = this.collectInlineForm(table);
        if (hasError) return;
        try {
            Engine.addRecord(tableId, record);
            UI.toast(t('toastRecordAdded'), 'success');
            this.renderFormsView();
            this.renderSidebarTables();
        } catch (e) { UI.handleError(e); }
    },

    formUpdateRecord() {
        const tableId = document.getElementById('form-table-select').value;
        const table = Engine.getTable(tableId);
        if (!table) return;
        const idx = this.currentFormIndex();
        if (idx === null) {
            this.formNewRecord();
            return;
        }
        const { record, hasError } = this.collectInlineForm(table);
        if (hasError) return;
        try {
            Engine.updateRecord(tableId, idx, record);
            UI.toast(t('toastRecordUpdated'), 'success');
            this.renderFormsView();
        } catch (e) { UI.handleError(e); }
    },

    /* ================= CSV import/export ================= */
    exportCsvFlow() {
        const tables = Engine.tables();
        if (!tables.length) { UI.toast(t('errNoTablesExport'), 'error'); return; }
        const table = this.currentTableId ? Engine.getTable(this.currentTableId) : tables[0];
        this.exportTableCsv(table.id);
    },

    exportTableCsv(tableId) {
        const table = Engine.getTable(tableId);
        if (!table) { UI.toast(t('errSelectTable'), 'error'); return; }
ap-webdb-repository-rebuild-8bb47
        Promise.resolve(Csv.exportTableAsync(table)).then((content) => {
            Csv.download(Csv.slugify(table.name) + '.csv', content, 'text/csv');
            UI.toast(t('toastExported'), 'success');
        }).catch((e) => UI.handleError(e, 'errUnknown'));

        Csv.download(Csv.slugify(table.name) + '.csv', Csv.exportTable(table), 'text/csv');
        UI.toast(t('toastExported'), 'success');
 main
    },

    importCsvIntoTable(file) {
        const tableId = this.pendingCsvTableId || document.getElementById('csv-target-table').value;
        const table = Engine.getTable(tableId);
        if (!table) { UI.toast(t('errSelectTableFirst'), 'error'); return; }
 ap-webdb-repository-rebuild-8bb47
        Csv.readFile(file).then(async (text) => {
            const parsed = await Csv.parse(text);

        Csv.readFile(file).then((text) => {
            const parsed = Csv.parse(text);
 main
            const known = table.fields.map((f) => f.name.toLowerCase());
            const missing = parsed.headers.filter((h) => known.indexOf(h.toLowerCase()) === -1);
            const count = Engine.appendRecords(tableId, parsed.records);
            UI.toast(t('toastCsvImported', { n: count }), 'success');
            if (missing.length) {
                console.info('CSV columns ignored (no matching field):', missing);
            }
            this.renderSidebarTables();
            if (this.view === 'data') this.renderDataTable(true);
        }).catch((e) => UI.handleError(e, 'errCsvParse'));
    },

    setupCsvImport() {
        const sel = document.getElementById('csv-target-table');
        const prev = sel.value;
        sel.innerHTML = '<option value="__new__">' + t('createNewTable') + '</option>';
        Engine.tables().forEach((tbl) => {
            const opt = document.createElement('option');
            opt.value = tbl.id;
            opt.textContent = tbl.name;
            sel.appendChild(opt);
        });
        if (prev && (prev === '__new__' || Engine.getTable(prev))) sel.value = prev;
        this.csvParsed = null;
        document.getElementById('csv-preview-wrap').hidden = true;
        document.getElementById('csv-no-file').hidden = false;
        document.getElementById('csv-new-name-group').hidden = sel.value !== '__new__';
        sel.onchange = () => {
            document.getElementById('csv-new-name-group').hidden = sel.value !== '__new__';
        };
        document.getElementById('csv-file').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
 ap-webdb-repository-rebuild-8bb47
            Csv.readFile(file).then(async (text) => {
                this.csvParsed = await Csv.parse(text);

            Csv.readFile(file).then((text) => {
                this.csvParsed = Csv.parse(text);
 main
                this.renderCsvPreview();
            }).catch((e2) => UI.handleError(e2, 'errCsvParse'));
        };
        document.getElementById('btn-csv-import').onclick = () => this.runCsvImport();
    },

    renderCsvPreview() {
        const parsed = this.csvParsed;
        document.getElementById('csv-no-file').hidden = true;
        document.getElementById('csv-preview-wrap').hidden = false;
        const info = document.getElementById('csv-preview-info');
        info.textContent = t('showingFirstRows', {
            n: Math.min(5, parsed.records.length), total: parsed.records.length
        });
        const container = document.getElementById('csv-preview');
        container.innerHTML = '';
        const fakeTable = {
            fields: parsed.headers.map((h) => ({
                name: h,
                type: Csv.guessType(h, parsed.records.slice(0, 20).map((r) => r[h])),
                primaryKey: false, required: false
            })),
            records: parsed.records
        };
        this.renderResultTable('csv-preview', fakeTable, parsed.headers, parsed.records.slice(0, 5));
    },

    runCsvImport() {
        const parsed = this.csvParsed;
        if (!parsed) { UI.toast(t('errNoCsvFile'), 'error'); return; }
        const targetSel = document.getElementById('csv-target-table');
        if (targetSel.value === '__new__') {
            let name = document.getElementById('csv-new-name').value.trim();
            if (!name) {
                const fileName = (document.getElementById('csv-file').files[0] || {}).name || '';
                name = fileName.replace(/\.csv$/i, '') || 'Imported Table';
            }
            try {
                const fields = parsed.headers.map((h) => {
                    const type = Csv.guessType(h, parsed.records.slice(0, 20).map((r) => r[h]));
                    return { name: h, type, required: false, primaryKey: false };
                });
                if (!fields.some((f) => f.primaryKey)) {
                    fields.unshift({ name: t('idFieldDefault'), type: 'auto_id', required: true, primaryKey: true });
                }
                const table = Engine.createTable(name, fields);
                const count = Engine.appendRecords(table.id, parsed.records);
                UI.toast(t('toastTableCreated', { name: table.name }) + ' · ' + t('toastCsvImported', { n: count }), 'success');
                this.csvParsed = null;
                this.selectTable(table.id);
            } catch (e) { UI.handleError(e); }
        } else {
            const table = Engine.getTable(targetSel.value);
            if (!table) { UI.toast(t('errSelectTable'), 'error'); return; }
            const count = Engine.appendRecords(table.id, parsed.records);
            UI.toast(t('toastCsvImported', { n: count }), 'success');
            this.csvParsed = null;
            this.setupCsvImport();
            this.renderSidebarTables();
        }
    },

    /* ================= JSON export/import ================= */
    exportCurrentDatabase() {
        if (!Engine.db) { UI.toast(t('errNoDbExport'), 'error'); return; }
        Backup.downloadDatabases([Engine.db]);
        UI.toast(t('toastExported'), 'success');
    },

    exportAllDatabases() {
        IDB.listDatabases().then((list) => {
            return Promise.all(list.map((meta) => IDB.getDatabase(meta.id)));
        }).then((dbs) => {
            const valid = dbs.filter(Boolean);
            if (!valid.length) { UI.toast(t('errNoDbImport'), 'info'); return; }
            Backup.downloadDatabases(valid);
            UI.toast(t('exportedFiles'), 'success');
        });
    },

    importJsonFile(file) {
        Backup.readFile(file).then((text) => {
 ap-webdb-repository-rebuild-8bb47
            const dbs = Backup.parse(text); // still synchronous + fully validated

            const dbs = Backup.parse(text);
 main
            return IDB.listDatabases().then((existing) => {
                const clash = existing.find((e) =>
                    dbs.some((d) => d.id === e.id || d.name.toLowerCase() === e.name.toLowerCase()));
                const proceed = clash
                    ? UI.confirm('restore', t('confirmImportReplace', { name: clash.name }), { danger: false })
                    : Promise.resolve(true);
                return proceed.then((ok) => {
                    if (!ok) return null;
                    return Backup.importDatabases(dbs).then(() => {
                        UI.toast(t('toastImported', { n: dbs.length }), 'success');
                        return IDB.getDatabase(dbs[0].id).then((fresh) => {
                            Engine.open(fresh);
                            this.renderApp();
                        });
                    });
                });
            });
        }).catch((e) => UI.handleError(e, 'errImportFile'));
    },

    /* ================= misc flows ================= */
    createDatabaseFlow() {
        UI.openModal('modal-new-db');
    },

    switchDatabase() {
        IDB.listDatabases().then((dbs) => {
            if (!dbs.length) { UI.toast(t('errNoDbImport'), 'info'); return; }
            UI.openModal('modal-open-db');
            const select = document.getElementById('open-db-select');
            select.innerHTML = '';
            dbs.forEach((d) => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.name + ' (' + d.tableCount + ' ' + t('tablesWord') + ')';
                if (Engine.db && d.id === Engine.db.id) opt.selected = true;
                select.appendChild(opt);
            });
            document.getElementById('form-open-db').onsubmit = (e) => {
                e.preventDefault();
                window.location.href = 'dbCenter.html?db=' + encodeURIComponent(select.value);
            };
        });
    },

    toggleLanguage() {
        const next = Prefs.getLang() === 'en' ? 'ar' : 'en';
        Prefs.setLang(next);
        UI.toast(t('toastLangChanged'), 'info');
        if (Engine.db) this.refreshCurrentView();
    },

    renameDatabaseFlow() {
        UI.prompt('databaseName', Engine.db.name, 'databaseNamePlaceholder').then((name) => {
            if (!name) return;
            Engine.db.name = name;
            document.getElementById('db-name-display').textContent = name;
            Engine.touch();
            Engine.persist();
            UI.toast(t('toastDbRenamed'), 'success');
            this.updateStatus();
        });
    },

    deleteDatabaseFlow() {
        UI.confirm('confirmDeleteDbTitle', t('confirmDeleteDbMsg', { name: Engine.db.name })).then((ok) => {
            if (!ok) return;
            IDB.deleteDatabase(Engine.db.id).then(() => {
                localStorage.removeItem('apwebdb_last_db');
                window.location.href = 'index.html';
            });
        });
    },

    openSettings() {
        UI.openModal('modal-settings');
        document.getElementById('settings-db-name').textContent = Engine.db ? Engine.db.name : '—';
    }
};

document.addEventListener('DOMContentLoaded', () => DbCenter.init());
 ap-webdb-repository-rebuild-8bb47

// ES module entry point for the Database Center page.
import './bootstrap.js';
export default DbCenter;
export { DbCenter };

 main
