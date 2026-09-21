// App Module - Main application coordinator
const App = {
    init() {
        // Initialize all modules
        UI.init();
        Tables.init();
        Records.init();
        Queries.init();
        Forms.init();
        Relationships.init();

        // Bind navigation events
        this.bindNavigation();
        
        // Check for existing database
        this.checkExistingDatabase();
        
        // Setup theme listener
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const savedTheme = localStorage.getItem('apwebdb_theme');
            if (savedTheme === 'system') {
                UI.setTheme('system');
            }
        });
    },

    bindNavigation() {
        // Start screen buttons
        document.getElementById('btn-create-db').addEventListener('click', () => {
            UI.openModal('modal-new-database');
            document.getElementById('database-name-input').focus();
        });

        document.getElementById('btn-create-database-confirm').addEventListener('click', () => this.createDatabase());
        document.getElementById('btn-open-db').addEventListener('click', () => this.openSavedDatabase());
        document.getElementById('btn-load-demo').addEventListener('click', () => this.loadDemoDatabase());

        // Back to dashboard
        document.getElementById('btn-back-dashboard').addEventListener('click', () => {
            document.getElementById('app-view').classList.remove('active');
            document.getElementById('start-screen').classList.add('active');
            Database.state.database = null;
        });

        // Sidebar navigation
        document.getElementById('btn-new-table-sidebar').addEventListener('click', () => Tables.openDesigner());
        document.getElementById('btn-query-builder-nav').addEventListener('click', () => {
            Queries.openView();
            this.switchTab('tab-query-builder');
        });
        document.getElementById('btn-form-builder-nav').addEventListener('click', () => {
            Forms.openView();
            this.switchTab('tab-forms');
        });
        document.getElementById('btn-relationships-nav').addEventListener('click', () => {
            Relationships.openView();
            this.switchTab('tab-relationships');
        });
        document.getElementById('btn-import-csv-nav').addEventListener('click', () => {
            this.switchTab('tab-import-csv');
        });
        document.getElementById('btn-export-csv-nav').addEventListener('click', () => {
            this.exportAllCSV();
        });

        // CSV import
        document.getElementById('csv-file-input').addEventListener('change', (e) => this.handleCSVFile(e));
        document.getElementById('btn-import-csv-confirm').addEventListener('click', () => this.importCSV());
    },

    checkExistingDatabase() {
        const db = Storage.loadDatabase();
        if (db) {
            Database.loadDatabase(db);
            this.enterWorkspace();
        }
    },

    createDatabase() {
        const name = document.getElementById('database-name-input').value.trim();
        if (!name) {
            UI.showToast('Please enter a database name', 'error');
            return;
        }

        Database.createDatabase(name);
        Database.saveDatabase();
        UI.closeAllModals();
        document.getElementById('database-name-input').value = '';
        
        this.enterWorkspace();
        UI.showToast('Database created', 'success');
    },

    openSavedDatabase() {
        const db = Storage.loadDatabase();
        if (!db) {
            UI.showToast('No saved database found', 'error');
            return;
        }
        
        Database.loadDatabase(db);
        this.enterWorkspace();
        UI.showToast('Database loaded', 'success');
    },

    loadDemoDatabase() {
        const demoDB = {
            id: '_demo',
            name: 'School Database',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tables: [
                {
                    id: '_students',
                    name: 'Students',
                    fields: [
                        { name: 'ID', type: 'auto_id', required: false, primaryKey: true },
                        { name: 'Name', type: 'text', required: true, primaryKey: false },
                        { name: 'Age', type: 'number', required: false, primaryKey: false },
                        { name: 'Email', type: 'email', required: false, primaryKey: false }
                    ],
                    records: [
                        { ID: '1', Name: 'Ali Ahmed', Age: '15', Email: 'ali@school.edu' },
                        { ID: '2', Name: 'Sara Mohamed', Age: '16', Email: 'sara@school.edu' },
                        { ID: '3', Name: 'Omar Hassan', Age: '15', Email: 'omar@school.edu' }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: '_courses',
                    name: 'Courses',
                    fields: [
                        { name: 'ID', type: 'auto_id', required: false, primaryKey: true },
                        { name: 'CourseName', type: 'text', required: true, primaryKey: false },
                        { name: 'Credits', type: 'number', required: false, primaryKey: false }
                    ],
                    records: [
                        { ID: '1', CourseName: 'Mathematics', Credits: '4' },
                        { ID: '2', CourseName: 'Physics', Credits: '3' },
                        { ID: '3', CourseName: 'Computer Science', Credits: '4' }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: '_grades',
                    name: 'Grades',
                    fields: [
                        { name: 'ID', type: 'auto_id', required: false, primaryKey: true },
                        { name: 'StudentID', type: 'number', required: true, primaryKey: false },
                        { name: 'CourseID', type: 'number', required: true, primaryKey: false },
                        { name: 'Grade', type: 'text', required: false, primaryKey: false }
                    ],
                    records: [
                        { ID: '1', StudentID: '1', CourseID: '1', Grade: 'A' },
                        { ID: '2', StudentID: '1', CourseID: '2', Grade: 'B+' },
                        { ID: '3', StudentID: '2', CourseID: '1', Grade: 'A-' }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ],
            relationships: [
                {
                    id: '_rel1',
                    sourceTableId: '_grades',
                    sourceField: 'StudentID',
                    targetTableId: '_students',
                    targetField: 'ID',
                    createdAt: new Date().toISOString()
                },
                {
                    id: '_rel2',
                    sourceTableId: '_grades',
                    sourceField: 'CourseID',
                    targetTableId: '_courses',
                    targetField: 'ID',
                    createdAt: new Date().toISOString()
                }
            ]
        };

        Database.loadDatabase(demoDB);
        Storage.saveDatabase(demoDB);
        this.enterWorkspace();
        UI.showToast('Demo database loaded', 'success');
    },

    enterWorkspace() {
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('app-view').classList.add('active');
        
        const db = Database.getDatabase();
        document.getElementById('project-name').textContent = db.name;
        
        this.renderTablesList();
        this.renderOverview();
        this.switchTab('tab-overview');
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === tabId);
        });

        // Update sidebar active state
        document.querySelectorAll('.btn-sidebar, .btn-tool').forEach(btn => {
            btn.classList.remove('active');
        });

        // Close mobile sidebar if open
        document.getElementById('sidebar').classList.remove('active');
    },

    renderTablesList() {
        const db = Database.getDatabase();
        const list = document.getElementById('tables-list');
        
        if (!db || db.tables.length === 0) {
            list.innerHTML = '<li style="padding:10px 20px;color:var(--text-muted);">No tables yet</li>';
            return;
        }

        list.innerHTML = db.tables.map(table => `
            <li>
                <button class="btn-sidebar" data-table-id="${table.id}">${table.name}</button>
            </li>
        `).join('');

        list.querySelectorAll('.btn-sidebar').forEach(btn => {
            btn.addEventListener('click', () => {
                Records.openTable(btn.dataset.tableId);
            });
        });
    },

    renderOverview() {
        const stats = Database.getStats();
        document.getElementById('stat-tables').textContent = stats.tables;
        document.getElementById('stat-records').textContent = stats.records;
        document.getElementById('stat-relationships').textContent = stats.relationships;

        const db = Database.getDatabase();
        const overviewList = document.getElementById('tables-overview-list');
        
        if (!db || db.tables.length === 0) {
            overviewList.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No tables created yet. Click "+ Create Table" to get started.</p>';
            return;
        }

        overviewList.innerHTML = db.tables.map(table => `
            <div class="table-overview-item" data-table-id="${table.id}">
                <div>
                    <strong>${table.name}</strong>
                    <div style="font-size:12px;color:var(--text-muted);">
                        ${table.fields.length} field${table.fields.length !== 1 ? 's' : ''} • 
                        ${table.records.length} record${table.records.length !== 1 ? 's' : ''}
                    </div>
                </div>
                <button class="btn btn-sm delete-table-btn" data-table-id="${table.id}">Delete</button>
            </div>
        `).join('');

        overviewList.querySelectorAll('.table-overview-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-table-btn')) {
                    Records.openTable(item.dataset.tableId);
                }
            });
        });

        overviewList.querySelectorAll('.delete-table-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Tables.deleteTable(btn.dataset.tableId);
            });
        });
    },

    handleCSVFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const preview = document.getElementById('csv-preview-container');
        preview.innerHTML = '<p>Loading...</p>';

        CSV.readFile(file).then(content => {
            const result = CSV.parseCSV(content);
            
            preview.innerHTML = `
                <h4>Preview (${result.records.length} rows)</h4>
                <div class="data-grid-container" style="max-height:200px;overflow-y:auto;">
                    <table class="data-grid">
                        <thead><tr>${result.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${result.records.slice(0, 5).map(r => 
                                `<tr>${result.headers.map(h => `<td>${r[h]}</td>`).join('')}</tr>`
                            ).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin-top:10px;font-size:12px;color:var(--text-muted);">
                    Showing first 5 of ${result.records.length} rows
                </p>
            `;
        }).catch(err => {
            preview.innerHTML = `<p style="color:var(--danger);">Error parsing CSV: ${err.message}</p>`;
        });
    },

    importCSV() {
        const tableName = document.getElementById('csv-table-name').value.trim();
        const fileInput = document.getElementById('csv-file-input');
        
        if (!tableName) {
            UI.showToast('Please enter a table name', 'error');
            return;
        }

        if (!fileInput.files[0]) {
            UI.showToast('Please select a CSV file', 'error');
            return;
        }

        CSV.readFile(fileInput.files[0]).then(content => {
            const result = CSV.parseCSV(content);
            
            // Create fields from headers
            const fields = result.headers.map((h, i) => ({
                name: h.trim(),
                type: i === 0 ? 'auto_id' : 'text',
                required: false,
                primaryKey: i === 0
            }));

            // Create table with records
            Database.createTable(tableName, fields);
            const table = Database.getTableByName(tableName);
            
            // Add records (skip auto_id field)
            result.records.forEach(record => {
                const newRecord = {};
                table.fields.forEach(field => {
                    if (field.type === 'auto_id') {
                        const maxId = table.records.reduce((max, r) => {
                            const val = parseInt(r[field.name]);
                            return isNaN(val) ? max : Math.max(max, val);
                        }, 0);
                        newRecord[field.name] = (maxId + 1 + table.records.length).toString();
                    } else {
                        newRecord[field.name] = record[field.name];
                    }
                });
                table.records.push(newRecord);
            });

            Database.saveDatabase();
            UI.showToast(`Imported ${result.records.length} records`, 'success');
            
            // Reset form
            document.getElementById('csv-table-name').value = '';
            fileInput.value = '';
            document.getElementById('csv-preview-container').innerHTML = '';
            
            this.renderTablesList();
            this.renderOverview();
        }).catch(err => {
            UI.showToast('Failed to import CSV: ' + err.message, 'error');
        });
    },

    exportAllCSV() {
        const db = Database.getDatabase();
        if (!db || db.tables.length === 0) {
            UI.showToast('No tables to export', 'error');
            return;
        }

        db.tables.forEach(table => {
            try {
                const csvContent = CSV.exportTable(table);
                CSV.downloadCSV(csvContent, `${table.name}.csv`);
            } catch (e) {
                console.error('Failed to export ' + table.name, e);
            }
        });

        UI.showToast('Exporting all tables...', 'success');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
