// Records Module - Record management and data view
const Records = {
    currentTableId: null,
    editingRecordIndex: null,
    filters: [],
    searchQuery: '',
    sortColumn: null,
    sortDirection: 'asc',

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-add-record').addEventListener('click', () => this.openRecordForm());
        document.getElementById('btn-save-record').addEventListener('click', () => this.saveRecord());
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.renderDataGrid();
        });
        document.getElementById('btn-apply-filter').addEventListener('click', () => this.applyFilter());
        document.getElementById('btn-clear-filter').addEventListener('click', () => this.clearFilters());
        document.getElementById('btn-export-table-csv').addEventListener('click', () => this.exportCSV());
    },

    openTable(tableId) {
        this.currentTableId = tableId;
        this.filters = [];
        this.searchQuery = '';
        this.sortColumn = null;
        this.editingRecordIndex = null;

        const table = Database.getTable(tableId);
        if (!table) return;

        document.getElementById('data-view-table-name').textContent = table.name;
        
        // Populate filter column dropdown
        const filterColumn = document.getElementById('filter-column');
        filterColumn.innerHTML = table.fields.map(f => 
            `<option value="${f.name}">${f.name}</option>`
        ).join('');

        this.renderDataGrid();
        App.switchTab('tab-data-view');
    },

    renderDataGrid() {
        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        let records = [...table.records];

        // Apply search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            records = records.filter(record => {
                return table.fields.some(field => {
                    const value = record[field.name];
                    return value && String(value).toLowerCase().includes(query);
                });
            });
        }

        // Apply filters
        this.filters.forEach(filter => {
            records = records.filter(record => {
                const value = record[filter.column];
                return this.evaluateFilter(value, filter.operator, filter.value, filter.columnType);
            });
        });

        // Apply sorting
        if (this.sortColumn) {
            records.sort((a, b) => {
                const aVal = a[this.sortColumn];
                const bVal = b[this.sortColumn];
                
                if (aVal === bVal) return 0;
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                const comparison = aVal < bVal ? -1 : 1;
                return this.sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        // Render header
        const thead = document.getElementById('data-grid-head');
        thead.innerHTML = '<tr>' + table.fields.map(f => 
            `<th data-column="${this.escapeAttrValue(f.name)}">${this.escapeHTML(f.name)}${this.sortColumn === f.name ? (this.sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</th>`
        ).join('') + '<th>Actions</th></tr>';

        // Add sort handlers
        thead.querySelectorAll('th[data-column]').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.column;
                if (this.sortColumn === column) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortColumn = column;
                    this.sortDirection = 'asc';
                }
                this.renderDataGrid();
            });
        });

        // Render body
        const tbody = document.getElementById('data-grid-body');
        tbody.innerHTML = '';

        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="' + (table.fields.length + 1) + '" style="text-align:center;padding:40px;">No records found</td></tr>';
        } else {
            records.forEach((record, index) => {
                const originalIndex = table.records.indexOf(record);
                const tr = document.createElement('tr');
                tr.innerHTML = table.fields.map(f => {
                    const value = record[f.name];
                    if (f.type === 'boolean') {
                        return `<td>${value ? '✓' : ''}</td>`;
                    }
                    return `<td>${this.escapeHTML(value !== undefined && value !== null ? String(value) : '')}</td>`;
                }).join('') + `
                    <td>
                        <button class="btn btn-sm edit-record-btn" data-index="${originalIndex}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-record-btn" data-index="${originalIndex}">Delete</button>
                    </td>
                `;

                tr.querySelector('.edit-record-btn').addEventListener('click', () => this.openRecordForm(originalIndex));
                tr.querySelector('.delete-record-btn').addEventListener('click', () => this.deleteRecord(originalIndex));

                tbody.appendChild(tr);
            });
        }

        document.getElementById('record-count').textContent = `${records.length} record${records.length !== 1 ? 's' : ''}`;
    },

    evaluateFilter(value, operator, filterValue, fieldType) {
        if (value === null || value === undefined) value = '';
        
        // Convert for numeric comparisons
        let numValue = parseFloat(value);
        let numFilter = parseFloat(filterValue);
        
        if (fieldType === 'number' || fieldType === 'decimal') {
            if (isNaN(numValue) || isNaN(numFilter)) return false;
            value = numValue;
            filterValue = numFilter;
        }

        switch (operator) {
            case 'equals': return String(value) === String(filterValue);
            case 'not_equals': return String(value) !== String(filterValue);
            case 'greater_than': return Number(value) > Number(filterValue);
            case 'less_than': return Number(value) < Number(filterValue);
            case 'greater_equal': return Number(value) >= Number(filterValue);
            case 'less_equal': return Number(value) <= Number(filterValue);
            case 'contains': return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'starts_with': return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
            case 'ends_with': return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
            default: return true;
        }
    },

    applyFilter() {
        const column = document.getElementById('filter-column').value;
        const operator = document.getElementById('filter-operator').value;
        const value = document.getElementById('filter-value').value;

        if (!value) {
            UI.showToast('Please enter a filter value', 'error');
            return;
        }

        const table = Database.getTable(this.currentTableId);
        const field = table.fields.find(f => f.name === column);

        this.filters.push({
            column,
            operator,
            value,
            columnType: field ? field.type : 'text'
        });

        this.renderFilterChips();
        this.renderDataGrid();
    },

    clearFilters() {
        this.filters = [];
        document.getElementById('filter-value').value = '';
        this.renderFilterChips();
        this.renderDataGrid();
    },

    renderFilterChips() {
        const container = document.getElementById('filter-chips');
        container.innerHTML = this.filters.map((f, i) => `
            <span class="filter-chip">
                ${f.column} ${f.operator.replace('_', ' ')} "${f.value}"
                <button onclick="Records.removeFilter(${i})">&times;</button>
            </span>
        `).join('');
    },

    removeFilter(index) {
        this.filters.splice(index, 1);
        this.renderFilterChips();
        this.renderDataGrid();
    },

    openRecordForm(recordIndex = null) {
        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        this.editingRecordIndex = recordIndex;
        const record = recordIndex !== null ? table.records[recordIndex] : null;

        document.getElementById('record-form-title').textContent = record ? 'Edit Record' : 'Add Record';

        const formBody = document.getElementById('record-form-body');
        formBody.innerHTML = table.fields.map(field => {
            if (field.type === 'auto_id') {
                return `<div class="form-group">
                    <label>${field.name}</label>
                    <input type="text" class="input-field" value="${record ? record[field.name] : '(Auto-generated)'}" disabled>
                </div>`;
            }

            let inputHtml = '';
            const value = record ? record[field.name] : '';

            switch (field.type) {
                case 'long_text':
                    inputHtml = `<textarea class="input-field" rows="4">${value || ''}</textarea>`;
                    break;
                case 'boolean':
                    inputHtml = `<input type="checkbox" ${value ? 'checked' : ''}>`;
                    break;
                case 'number':
                case 'decimal':
                    inputHtml = `<input type="number" class="input-field" step="${field.type === 'decimal' ? '0.01' : '1'}" value="${value || ''}">`;
                    break;
                case 'date':
                    inputHtml = `<input type="date" class="input-field" value="${value || ''}">`;
                    break;
                case 'email':
                    inputHtml = `<input type="email" class="input-field" value="${value || ''}">`;
                    break;
                default:
                    inputHtml = `<input type="text" class="input-field" value="${value || ''}">`;
            }

            return `<div class="form-group">
                <label>${field.name}${field.required ? ' *' : ''}</label>
                ${inputHtml}
            </div>`;
        }).join('');

        UI.openModal('modal-record-form');
    },

    saveRecord() {
        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        const record = {};
        const formGroups = document.querySelectorAll('#record-form-body .form-group');

        table.fields.forEach((field, index) => {
            if (field.type === 'auto_id') return;

            const group = formGroups[index];
            let value;

            if (field.type === 'boolean') {
                value = group.querySelector('input[type="checkbox"]').checked;
            } else if (field.type === 'number' || field.type === 'decimal') {
                value = group.querySelector('input').value;
                if (value && isNaN(parseFloat(value))) {
                    UI.showToast(`${field.name} must be a valid number`, 'error');
                    return;
                }
            } else if (field.type === 'email') {
                value = group.querySelector('input').value;
                if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    UI.showToast(`${field.name} must be a valid email`, 'error');
                    return;
                }
            } else {
                const input = group.querySelector('input, textarea');
                value = input.type === 'checkbox' ? input.checked : input.value;
            }

            if (field.required && !value) {
                UI.showToast(`${field.name} is required`, 'error');
                return;
            }

            record[field.name] = value;
        });

        try {
            if (this.editingRecordIndex !== null) {
                Database.updateRecord(this.currentTableId, this.editingRecordIndex, record);
                UI.showToast('Record updated', 'success');
            } else {
                Database.addRecord(this.currentTableId, record);
                UI.showToast('Record added', 'success');
            }

            UI.closeModal('modal-record-form');
            this.renderDataGrid();
            App.renderOverview();
        } catch (e) {
            UI.showToast(e.message, 'error');
        }
    },

    deleteRecord(index) {
        UI.showConfirm(
            'Delete this record?',
            'This action cannot be undone.',
            () => {
                Database.deleteRecord(this.currentTableId, index);
                UI.showToast('Record deleted', 'success');
                this.renderDataGrid();
                App.renderOverview();
            }
        );
    },

    exportCSV() {
        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        try {
            const csvContent = CSV.exportTable(table);
            CSV.downloadCSV(csvContent, `${table.name}.csv`);
            UI.showToast('CSV exported successfully', 'success');
        } catch (e) {
            UI.showToast('Failed to export CSV: ' + e.message, 'error');
        }
    },

    // Escape HTML special characters
    escapeHTML(str) {
        if (typeof str !== 'string') str = String(str);
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Escape attribute value for safe use in HTML attributes
    escapeAttrValue(str) {
        if (typeof str !== 'string') str = String(str);
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};
