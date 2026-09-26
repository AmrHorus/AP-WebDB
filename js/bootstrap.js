// Shared bootstrap for all AP-WebDB pages (imported first by each entry module).
// Loads the classic-script core in strict dependency order, then wires up the
// centralized global error handlers. Keeping the core as classic scripts means
// there is exactly ONE copy of the database engine/state shared by every page —
// no duplicated logic between index.html and dbCenter.html.
import './utils.js';
import './i18n.js';
import './theme.js';
import './errors.js';
import './sanitize.js';
import './idb.js';
import './engine.js';
import './ui.js';
import './csv.js';
import './backup.js';
import './recordform.js';

Errors.install();
