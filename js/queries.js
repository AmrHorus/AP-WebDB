// Queries Module - Query Builder functionality
const Queries = {
    conditions: [],

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-add-condition').addEventListener('click', () => this.addCondition());
        document.getElementById('btn-run-query').addEventListener('click', () => this.runQuery());
        document.getElementById('btn-clear-query').addEventListener('click', () => this.clearQuery());
        
        // Populate table select on view switch
        document.getElementById('query-table-select').addEventListener('change', () => {
            this.conditions = [];
            this.renderConditions();
        });
    },

    openView() {
        const db = Database.getDatabase();
        if (!db) return;

        const select = document.getElementById('query-table-select');
        select.innerHTML = '<option value="">Select a table</option>' + 
            db.tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        this.conditions = [];
        this.renderConditions();
        document.getElementById('query-results-container').innerHTML = '';
    },

    addCondition() {
        const tableId = document.getElementById('query-table-select').value;
        if (!tableId) {
            UI.showToast('Please select a table first', 'error');
            return;
        }

        const table = Database.getTable(tableId);
        this.conditions.push({
            logic: this.conditions.length > 0 ? 'AND' : '',
            field: table.fields[0] ? table.fields[0].name : '',
            operator: 'equals',
            value: ''
        });
        this.renderConditions();
    },

    renderConditions() {
        const container = document.getElementById('query-conditions-container');
        const tableId = document.getElementById('query-table-select').value;
        
        if (!tableId) {
            container.innerHTML = '';
            return;
        }

        const table = Database.getTable(tableId);
        
        container.innerHTML = this.conditions.map((cond, index) => `
            <div class="query-condition">
                <select class="input-field query-logic" ${index === 0 ? 'disabled' : ''}>
                    <option value="AND" ${cond.logic === 'AND' ? 'selected' : ''}>AND</option>
                    <option value="OR" ${cond.logic === 'OR' ? 'selected' : ''}>OR</option>
                </select>
                <select class="input-field query-field">
                    ${table.fields.map(f => `<option value="${f.name}" ${cond.field === f.name ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
                <select class="input-field query-operator">
                    <option value="equals" ${cond.operator === 'equals' ? 'selected' : ''}>Equals</option>
                    <option value="not_equals" ${cond.operator === 'not_equals' ? 'selected' : ''}>Not Equals</option>
                    <option value="greater_than" ${cond.operator === 'greater_than' ? 'selected' : ''}>Greater Than</option>
                    <option value="less_than" ${cond.operator === 'less_than' ? 'selected' : ''}>Less Than</option>
                    <option value="greater_equal" ${cond.operator === 'greater_equal' ? 'selected' : ''}>Greater or Equal</option>
                    <option value="less_equal" ${cond.operator === 'less_equal' ? 'selected' : ''}>Less or Equal</option>
                    <option value="contains" ${cond.operator === 'contains' ? 'selected' : ''}>Contains</option>
                    <option value="starts_with" ${cond.operator === 'starts_with' ? 'selected' : ''}>Starts With</option>
                    <option value="ends_with" ${cond.operator === 'ends_with' ? 'selected' : ''}>Ends With</option>
                </select>
                <input type="text" class="input-field query-value" placeholder="Value" value="${cond.value}">
                <button class="btn btn-danger btn-sm remove-condition-btn" data-index="${index}">&times;</button>
            </div>
        `).join('');

        // Bind event listeners
        container.querySelectorAll('.query-logic').forEach((sel, i) => {
            sel.addEventListener('change', (e) => {
                this.conditions[i].logic = e.target.value;
            });
        });

        container.querySelectorAll('.query-field').forEach((sel, i) => {
            sel.addEventListener('change', (e) => {
                this.conditions[i].field = e.target.value;
            });
        });

        container.querySelectorAll('.query-operator').forEach((sel, i) => {
            sel.addEventListener('change', (e) => {
                this.conditions[i].operator = e.target.value;
            });
        });

        container.querySelectorAll('.query-value').forEach((inp, i) => {
            inp.addEventListener('input', (e) => {
                this.conditions[i].value = e.target.value;
            });
        });

        container.querySelectorAll('.remove-condition-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.conditions.splice(index, 1);
                this.renderConditions();
            });
        });
    },

    runQuery() {
        const tableId = document.getElementById('query-table-select').value;
        if (!tableId) {
            UI.showToast('Please select a table', 'error');
            return;
        }

        if (this.conditions.length === 0) {
            UI.showToast('Please add at least one condition', 'error');
            return;
        }

        const table = Database.getTable(tableId);
        let results = [...table.records];

        // Apply conditions
        results = results.filter(record => {
            return this.conditions.every((cond, index) => {
                const value = record[cond.field];
                const matches = Records.evaluateFilter(value, cond.operator, cond.value);
                
                if (index === 0) return matches;
                return cond.logic === 'AND' ? matches : !matches;
            });
        });

        // Render results
        const container = document.getElementById('query-results-container');
        
        if (results.length === 0) {
            container.innerHTML = '<p>No matching records found.</p>';
            return;
        }

        let html = '<div class="data-grid-container"><table class="data-grid"><thead><tr>';
        table.fields.forEach(f => {
            html += `<th>${f.name}</th>`;
        });
        html += '</tr></thead><tbody>';

        results.forEach(record => {
            html += '<tr>';
            table.fields.forEach(f => {
                const value = record[f.name];
                html += `<td>${value !== undefined && value !== null ? value : ''}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        html += `<p style="margin-top:10px;">${results.length} result${results.length !== 1 ? 's' : ''} found</p>`;
        
        container.innerHTML = html;
    },

    clearQuery() {
        this.conditions = [];
        this.renderConditions();
        document.getElementById('query-results-container').innerHTML = '';
    }
};
