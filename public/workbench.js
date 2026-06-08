// workbench.js — Workbench feature: Process Warehouse, Construction, History
// Requires shared.js to be loaded first (provides checkAuth() and apiReq()).

'use strict';

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
const WB = {
    activeTab: 'warehouse',
    warehouse: {
        processes: [],      // full list fetched from server
        filtered: []        // after search
    },
    construction: {
        nodes: []           // [{ id, processId, processName, region, providerName }]
    }
};

let _nodeCounter = 0;
function nextNodeId() { return ++_nodeCounter; }

// Region → colour-group mapping for card accent borders
const REGION_GROUP = {
    // Global
    'GLO': 'global', 'RoW': 'global',
    // Asia
    'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia', 'RAS': 'asia',
    'TW': 'asia', 'HK': 'asia', 'SG': 'asia', 'TH': 'asia', 'ID': 'asia',
    'MY': 'asia', 'VN': 'asia', 'PH': 'asia', 'BD': 'asia', 'PK': 'asia',
    'IAI Area, Asia, without China and GCC': 'asia',
    // Europe
    'RER': 'europe', 'DE': 'europe', 'CH': 'europe', 'FR': 'europe', 'GB': 'europe',
    'IT': 'europe', 'ES': 'europe', 'NL': 'europe', 'BE': 'europe', 'SE': 'europe',
    'NO': 'europe', 'FI': 'europe', 'DK': 'europe', 'AT': 'europe', 'PL': 'europe',
    'PT': 'europe', 'CZ': 'europe', 'HU': 'europe', 'RO': 'europe', 'GR': 'europe',
    'SK': 'europe', 'BG': 'europe', 'HR': 'europe', 'IE': 'europe', 'LU': 'europe',
    'IAI Area, EU27 & EFTA': 'europe',
    // Americas
    'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas',
    'RNA': 'americas', 'RLA': 'americas', 'CA-QC': 'americas', 'AR': 'americas',
    'CL': 'americas', 'CO': 'americas', 'PE': 'americas', 'VE': 'americas',
    'IAI Area, South America': 'americas',
    'IAI Area, North America': 'americas',
    // Africa
    'ZA': 'africa', 'RAF': 'africa', 'NG': 'africa', 'EG': 'africa', 'ET': 'africa',
    'KE': 'africa', 'GH': 'africa', 'TZ': 'africa', 'CI': 'africa',
    'IAI Area, Africa': 'africa',
    // Middle East
    'RME': 'mideast', 'SA': 'mideast', 'AE': 'mideast', 'IL': 'mideast',
    'TR': 'mideast', 'IR': 'mideast', 'IQ': 'mideast',
    'IAI Area, Gulf Cooperation Council': 'mideast',
    // Oceania
    'AU': 'oceania', 'NZ': 'oceania', 'UN-OCEANIA': 'oceania',
    // Russia / CIS
    'RU': 'russia', 'UA': 'russia', 'KZ': 'russia',
    'IAI Area, Russia & RER w/o EU27 & EFTA': 'russia'
};
function _regionGroup(region) {
    if (!region) return 'other';
    if (REGION_GROUP[region]) return REGION_GROUP[region];
    // Substring-based fallback for long ecoinvent region names
    const u = region.toUpperCase();
    if (u.includes('EU27') || u.includes('EFTA') || u.includes('EUROPE')) return 'europe';
    if (u.includes('SOUTH AMERICA') || u.includes('LATIN') || u.includes('NORTH AMERICA')) return 'americas';
    if (u.includes('ASIA') || u.includes('CHINA') || u.includes('GCC')) return 'asia';
    if (u.includes('OCEANIA') || u.includes('AUSTRALIA')) return 'oceania';
    if (u.includes('RUSSIA')) return 'russia';
    if (u.includes('AFRICA')) return 'africa';
    if (u.includes('MIDDLE EAST') || u.includes('GULF') || u.includes('ARAB')) return 'mideast';
    return 'other';
}

// Region code → human-readable display name (fallback: show the raw code)
const REGION_NAME = {
    'GLO': 'Global',                'RoW': 'Rest of World',
    // Asia
    'CN':  'China',                 'JP':  'Japan',                 'IN':  'India',
    'KR':  'South Korea',           'RAS': 'Rest of Asia',          'TW':  'Taiwan',
    'HK':  'Hong Kong',             'SG':  'Singapore',             'TH':  'Thailand',
    'ID':  'Indonesia',             'MY':  'Malaysia',              'VN':  'Vietnam',
    'PH':  'Philippines',           'BD':  'Bangladesh',            'PK':  'Pakistan',
    'IAI Area, Asia, without China and GCC': 'IAI \u2013 Asia (ex-China & GCC)',
    // Europe
    'RER': 'Europe',                'DE':  'Germany',               'CH':  'Switzerland',
    'FR':  'France',                'GB':  'United Kingdom',        'IT':  'Italy',
    'ES':  'Spain',                 'NL':  'Netherlands',           'BE':  'Belgium',
    'SE':  'Sweden',                'NO':  'Norway',                'FI':  'Finland',
    'DK':  'Denmark',               'AT':  'Austria',               'PL':  'Poland',
    'PT':  'Portugal',              'CZ':  'Czech Republic',        'HU':  'Hungary',
    'RO':  'Romania',               'GR':  'Greece',                'SK':  'Slovakia',
    'BG':  'Bulgaria',              'HR':  'Croatia',               'IE':  'Ireland',
    'LU':  'Luxembourg',            'IAI Area, EU27 & EFTA': 'IAI \u2013 EU27 & EFTA',
    // Americas
    'US':  'United States',         'CA':  'Canada',                'MX':  'Mexico',
    'BR':  'Brazil',                'RNA': 'North America',         'RLA': 'Latin America',
    'CA-QC': 'Canada, Quebec',      'AR':  'Argentina',             'CL':  'Chile',
    'CO':  'Colombia',              'PE':  'Peru',                  'VE':  'Venezuela',
    'IAI Area, South America': 'IAI \u2013 South America',
    'IAI Area, North America': 'IAI \u2013 North America',
    // Africa
    'ZA':  'South Africa',          'RAF': 'Africa',                'NG':  'Nigeria',
    'EG':  'Egypt',                 'ET':  'Ethiopia',              'KE':  'Kenya',
    'GH':  'Ghana',                 'TZ':  'Tanzania',              'CI':  'Ivory Coast',
    'IAI Area, Africa': 'IAI \u2013 Africa',
    // Middle East
    'RME': 'Middle East',           'SA':  'Saudi Arabia',          'AE':  'UAE',
    'IL':  'Israel',                'TR':  'Turkey',                'IR':  'Iran',
    'IQ':  'Iraq',
    'IAI Area, Gulf Cooperation Council': 'IAI \u2013 Gulf Cooperation Council',
    // Oceania
    'AU':  'Australia',             'NZ':  'New Zealand',           'UN-OCEANIA': 'Oceania',
    // Russia / CIS
    'RU':  'Russia',                'UA':  'Ukraine',               'KZ':  'Kazakhstan',
    'IAI Area, Russia & RER w/o EU27 & EFTA': 'IAI \u2013 Russia & Europe (ex-EU27)'
};
// Return human-readable name, falling back to the raw code if not mapped
function _regionName(code) {
    if (!code) return 'Unknown';
    return REGION_NAME[code] || code;
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    _initSubtabs();
    _initWarehouse();
    _initConstruction();
    _initHistory();
    _initModals();
});

/* ══════════════════════════════════════════════════════════════
   SUB-TABS
══════════════════════════════════════════════════════════════ */
function _initSubtabs() {
    document.querySelectorAll('.wb-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            _switchTab(tab);
        });
    });
}

function _switchTab(tab) {
    WB.activeTab = tab;
    document.querySelectorAll('.wb-subtab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.wb-tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    if (tab === 'history') _loadHistory();
}

/* ══════════════════════════════════════════════════════════════
   PROCESS WAREHOUSE
══════════════════════════════════════════════════════════════ */
function _initWarehouse() {
    const searchInput = document.getElementById('whSearchInput');
    const clearBtn    = document.getElementById('whSearchClearBtn');
    const createBtn   = document.getElementById('whCreateBtn');

    _loadPreview();  // default view: top-10 regions, 20 random each

    searchInput.addEventListener('input', () => {
        clearBtn.hidden = searchInput.value.length === 0;
        _fetchWarehouse(searchInput.value.trim());
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.hidden = true;
        _loadPreview();  // back to preview when search is cleared
    });

    createBtn.addEventListener('click', () => _openProcessModal());

    // const importBtn   = document.getElementById('whImportBtn');
    // importBtn.addEventListener('click', _importEcoinvent);

    // const clearAllBtn = document.getElementById('whClearAllBtn');
    // clearAllBtn.addEventListener('click', async () => {
    //     if (!confirm('Delete ALL processes from your warehouse?\nThis cannot be undone.')) return;
    //     try {
    //         const res = await apiReq('DELETE', '/api/workbench/processes');
    //         alert(`Deleted ${res.deleted} process${res.deleted !== 1 ? 'es' : ''}.`);
    //         _fetchWarehouse();
    //     } catch (err) {
    //         alert('Failed to delete processes: ' + (err.message || err));
    //     }
    // });
}

// Search all processes matching query; empty query falls back to preview
async function _fetchWarehouse(query = '') {
    if (!query) { _loadPreview(); return; }
    try {
        const processes = await apiReq('GET', `/api/workbench/processes?q=${encodeURIComponent(query)}`);
        WB.warehouse.processes = processes;
        _renderWarehouse(processes);
    } catch (err) {
        console.error('Failed to search warehouse processes:', err);
    }
}

// Default view: 20 random processes for each of the top-10 featured regions
async function _loadPreview() {
    try {
        const processes = await apiReq('GET', '/api/workbench/processes/preview');
        WB.warehouse.processes = processes;
        _renderWarehouse(processes);
    } catch (err) {
        console.error('Failed to load warehouse preview:', err);
    }
}

function _renderWarehouse(processes) {
    const grid     = document.getElementById('whGrid');
    const emptyMsg = document.getElementById('whEmptyState');

    // Clear previous category rows (keep the empty-state element)
    grid.querySelectorAll('.wh-category-row').forEach(r => r.remove());

    if (!processes.length) {
        emptyMsg.hidden = false;
        return;
    }
    emptyMsg.hidden = true;

    // Group by region
    const groups = {};
    processes.forEach(p => {
        const cat = p.region || 'Unknown';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });

    Object.entries(groups).forEach(([category, items]) => {
        const row = document.createElement('div');
        row.className = 'wh-category-row';
        row.innerHTML = `<div class="wh-category-label">${_esc(_regionName(category))}</div>
                         <div class="wh-cards-scroll"></div>`;
        const scroll = row.querySelector('.wh-cards-scroll');

        items.forEach(proc => {
            const card = _buildProcessCard(proc);
            scroll.appendChild(card);
        });

        grid.appendChild(row);
    });
}

function _buildProcessCard(proc) {
    const card = document.createElement('div');
    card.className = 'wh-card';
    card.dataset.rgroup = _regionGroup(proc.region);
    card.dataset.id      = proc._id;

    card.innerHTML = `
        <div class="wh-card-name">${_esc(proc.processName)}</div>
        <div class="wh-card-row">Region: <span>${_esc(_regionName(proc.region))}</span></div>
        <div class="wh-card-row">Unit: <span>${_esc(proc.unit || '\u2014')}</span></div>
        <div class="wh-card-row wh-card-category" title="${_esc(proc.category || '')}">Category: <span>${_esc(proc.category || '\u2014')}</span></div>
        <div class="wh-card-row">Provider: <span>${_esc(proc.providerName || '\u2014')}</span></div>
        <button class="wh-card-add-btn" title="Add to Construction chain">Add to Chain</button>
    `;

    card.querySelector('.wh-card-add-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        _addProcessToChain(proc);
    });

    return card;
}

/* ══════════════════════════════════════════════════════════════
   CONSTRUCTION
══════════════════════════════════════════════════════════════ */

// Add proc to chain: fills last empty node or appends a new one
function _addProcessToChain(proc) {
    const last = WB.construction.nodes[WB.construction.nodes.length - 1];
    if (last && !last.processId) {
        last.processId    = proc.processId;
        last.processName  = proc.processName;
        last.region       = proc.region;
        last.providerName = proc.providerName;
    } else {
        WB.construction.nodes.push({
            id: nextNodeId(), processId: proc.processId,
            processName: proc.processName, region: proc.region,
            providerName: proc.providerName
        });
    }
    _renderChain();
    const count = WB.construction.nodes.filter(n => n.processId).length;
    _showToast(`\u2714 "${proc.processName}" added \u2014 ${count} step${count !== 1 ? 's' : ''} in chain`);
}

// Show a brief floating toast at the bottom of the screen
function _showToast(msg) {
    document.querySelectorAll('.wb-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'wb-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('wb-toast--show'));
    setTimeout(() => {
        toast.classList.remove('wb-toast--show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// Update the numeric badge on the Construction sub-tab button
function _updateChainTabBadge() {
    const count  = WB.construction.nodes.filter(n => n.processId).length;
    const tabBtn = document.querySelector('.wb-subtab[data-tab="construction"]');
    if (!tabBtn) return;
    let badge = tabBtn.querySelector('.wb-tab-badge');
    if (count > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'wb-tab-badge'; tabBtn.appendChild(badge); }
        badge.textContent = count;
    } else {
        if (badge) badge.remove();
    }
}

function _initConstruction() {
    const addBtn     = document.getElementById('conAddNodeBtn');
    const clearBtn   = document.getElementById('conClearBtn');
    const form       = document.getElementById('conForm');

    // Start with 1 default node
    _addNode();

    addBtn.addEventListener('click', _addNode);

    clearBtn.addEventListener('click', () => {
        if (!confirm('Clear all nodes and form fields?')) return;
        WB.construction.nodes = [];
        _nodeCounter = 0;
        _renderChain();
        document.getElementById('conChainName').value    = '';
        document.getElementById('conProductName').value  = '';
        document.getElementById('conFunctionalUnit').value = '';
        document.getElementById('conSystemBoundary').value = 'cradle-to-gate';
        document.getElementById('conNotes').value        = '';
    });

    form.addEventListener('submit', _handleConSubmit);
}

function _addNode() {
    WB.construction.nodes.push({
        id:          nextNodeId(),
        processId:   '',
        processName: '',
        region:      '',
        providerName:''
    });
    _renderChain();
    // Auto-scroll to the end of the chain
    const scroll = document.querySelector('.con-chain-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
}

function _removeNode(nodeId) {
    WB.construction.nodes = WB.construction.nodes.filter(n => n.id !== nodeId);
    _renderChain();
}

function _renderChain() {
    const container = document.getElementById('conChain');
    container.innerHTML = '';

    WB.construction.nodes.forEach((node, idx) => {
        if (idx > 0) {
            const arrow = document.createElement('div');
            arrow.className = 'con-arrow';
            container.appendChild(arrow);
        }

        const filled = !!node.processId;
        const nodeEl  = document.createElement('div');
        nodeEl.className = 'con-node';

        nodeEl.innerHTML = `
            <div class="con-node-box${filled ? ' con-node-box--filled' : ''}" data-nodeid="${node.id}">
                <div class="con-node-header">
                    <span class="con-node-label">Step ${idx + 1}</span>
                    <button class="con-node-remove" title="Remove step" aria-label="Remove step">&#10005;</button>
                </div>
                ${ filled ? `
                    <div class="con-node-process">
                        <div class="con-node-process-name">${_esc(node.processName)}</div>
                        <span class="con-node-region-badge" data-rgroup="${_regionGroup(node.region)}">${_esc(_regionName(node.region))}</span>
                    </div>
                    <button class="con-node-change">Remove Process</button>
                ` : `
                    <div class="con-node-search-wrap">
                        <input class="con-node-search" type="text" placeholder="Search process\u2026" autocomplete="off">
                        <div class="con-node-dropdown" hidden></div>
                    </div>
                `}
            </div>
        `;

        // Remove step
        nodeEl.querySelector('.con-node-remove').addEventListener('click', () => {
            if (WB.construction.nodes.length <= 1) return;
            _removeNode(node.id);
        });

        if (filled) {
            // "Change" clears the node and shows the search input again
            nodeEl.querySelector('.con-node-change').addEventListener('click', () => {
                node.processId = ''; node.processName = '';
                node.region = ''; node.providerName = '';
                _renderChain();
            });
        } else {
            // Live search autocomplete
            const searchInput = nodeEl.querySelector('.con-node-search');
            const dropdown    = nodeEl.querySelector('.con-node-dropdown');
            let debounce;

            searchInput.addEventListener('input', () => {
                clearTimeout(debounce);
                const q = searchInput.value.trim();
                if (!q) { dropdown.hidden = true; return; }
                debounce = setTimeout(() => _searchForNode(q, dropdown, node, searchInput), 250);
            });

            // Close dropdown when clicking outside this node
            document.addEventListener('click', (e) => {
                if (!nodeEl.contains(e.target)) dropdown.hidden = true;
            });
        }

        container.appendChild(nodeEl);
    });

    _updateChainTabBadge();
}

// Fetch matching processes and show in the node's dropdown
async function _searchForNode(query, dropdown, node, inputEl) {
    try {
        const results = await apiReq('GET',
            `/api/workbench/processes?q=${encodeURIComponent(query)}&limit=8`);
        dropdown.innerHTML = '';
        if (!results.length) {
            dropdown.innerHTML = '<div class="con-dd-empty">No processes found</div>';
            _positionDropdown(inputEl, dropdown);
            dropdown.hidden = false;
            return;
        }
        results.forEach(proc => {
            const item = document.createElement('div');
            item.className = 'con-dd-item';
            item.innerHTML = `
                <div class="con-dd-name">${_esc(proc.processName)}</div>
                <div class="con-dd-meta">
                    <span class="con-dd-region" data-rgroup="${_regionGroup(proc.region)}">${_esc(_regionName(proc.region))}</span>
                    <span class="con-dd-category">${_esc(proc.category || '')}</span>
                </div>`;
            // mousedown fires before blur, preventing the dropdown from hiding
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                node.processId    = proc.processId;
                node.processName  = proc.processName;
                node.region       = proc.region;
                node.providerName = proc.providerName;
                _renderChain();
            });
            dropdown.appendChild(item);
        });
        _positionDropdown(inputEl, dropdown);
        dropdown.hidden = false;
    } catch (err) {
        console.error('Process search failed:', err);
    }
}

// Position the fixed dropdown directly below the triggering input element
function _positionDropdown(inputEl, dropdown) {
    const rect = inputEl.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
}

async function _handleConSubmit(e) {
    e.preventDefault();

    const chainName     = document.getElementById('conChainName').value.trim();
    const productName   = document.getElementById('conProductName').value.trim();
    const functionalUnit= document.getElementById('conFunctionalUnit').value.trim();
    const systemBoundary= document.getElementById('conSystemBoundary').value;
    const notes         = document.getElementById('conNotes').value.trim();

    if (!chainName) {
        alert('Please enter a Value Chain Name.');
        document.getElementById('conChainName').focus();
        return;
    }

    const filledNodes = WB.construction.nodes.filter(n => n.processId);
    if (!filledNodes.length) {
        alert('Please enter at least one Process ID in the value chain.');
        return;
    }

    const submitBtn = document.getElementById('conSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Running…';

    try {
        // ── Prepare payload ──────────────────────────────────────────────
        const payload = {
            chainName,
            productName,
            functionalUnit,
            systemBoundary,
            notes,
            nodes: filledNodes.map((n, idx) => ({
                order:       idx,
                processId:   n.processId,
                processName: n.processName,
                region:      n.region,
                providerName:n.providerName
            }))
        };

        // ── STUB: LCA calculation placeholder ───────────────────────────
        // Replace this function body with real calculation logic.
        const results = await _lcaCalculationStub(payload);

        // ── Save to history ──────────────────────────────────────────────
        await apiReq('POST', '/api/workbench/history', { ...payload, results });

        alert(`LCA run complete for "${chainName}". Result saved to History.`);
        _switchTab('history');
    } catch (err) {
        console.error('Run failed:', err);
        alert('Run failed. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Run LCA';
    }
}

/**
 * _lcaCalculationStub — placeholder for the actual LCA computation.
 *
 * @param {Object} payload  The full value chain payload assembled in _handleConSubmit.
 *   payload.chainName      {string}
 *   payload.productName    {string}
 *   payload.functionalUnit {string}
 *   payload.systemBoundary {string}
 *   payload.notes          {string}
 *   payload.nodes          {Array<{order, processId, processName, region, providerName}>}
 *
 * @returns {Promise<Object>}  Resolved with a results object; shape is yours to define.
 */
async function _lcaCalculationStub(payload) {
    // TODO: Replace with real LCA calculation call (e.g. fetch to Flask backend).
    console.log('[LCA STUB] Received payload:', payload);
    return {
        status: 'stub',
        message: 'Calculation not yet implemented. Replace _lcaCalculationStub() in workbench.js.',
        payload
    };
}

/* ══════════════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════════════ */
function _initHistory() {
    document.getElementById('histRefreshBtn').addEventListener('click', _loadHistory);
}

async function _loadHistory() {
    try {
        const records = await apiReq('GET', '/api/workbench/history');
        _renderHistory(records);
    } catch (err) {
        console.error('Failed to fetch history:', err);
    }
}

function _renderHistory(records) {
    const list = document.getElementById('histList');
    list.innerHTML = '';

    if (!records.length) {
        list.innerHTML = `<div class="wh-empty-state">
            <p>No runs yet. Use the Construction tab to run your first value chain.</p>
        </div>`;
        return;
    }

    records.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'hist-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View run: ${rec.chainName}`);

        const date = new Date(rec.runAt).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        card.innerHTML = `
            <div class="hist-card-info">
                <div class="hist-card-name">${_esc(rec.chainName)}</div>
                <div class="hist-card-meta">
                    ${rec.productName ? 'Product: ' + _esc(rec.productName) + ' &nbsp;·&nbsp; ' : ''}
                    ${rec.nodes.length} step${rec.nodes.length !== 1 ? 's' : ''}
                    ${rec.functionalUnit ? ' &nbsp;·&nbsp; FU: ' + _esc(rec.functionalUnit) : ''}
                </div>
            </div>
            <div class="hist-card-actions">
                <span class="hist-card-date">${_esc(date)}</span>
                <button class="hist-delete-btn" title="Delete record" aria-label="Delete record">&#10005;</button>
            </div>
        `;

        // Open detail modal
        const openDetail = () => _openHistDetail(rec);
        card.addEventListener('click', openDetail);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); }
        });

        // Delete
        card.querySelector('.hist-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete run "${rec.chainName}"?`)) return;
            try {
                await apiReq('DELETE', `/api/workbench/history/${rec._id}`);
                _loadHistory();
            } catch (err) {
                alert('Failed to delete record.');
                console.error(err);
            }
        });

        list.appendChild(card);
    });
}

/* ══════════════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════════════ */
function _initModals() {
    // Process modal
    const modal        = document.getElementById('processModal');
    const closeBtn     = document.getElementById('processModalClose');
    const cancelBtn    = document.getElementById('processModalCancel');
    const processForm  = document.getElementById('processForm');

    closeBtn.addEventListener('click',  () => _closeModal(modal));
    cancelBtn.addEventListener('click', () => _closeModal(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) _closeModal(modal); });
    processForm.addEventListener('submit', _handleProcessFormSubmit);

    // History detail modal
    const histModal    = document.getElementById('histDetailModal');
    const histClose    = document.getElementById('histDetailClose');

    histClose.addEventListener('click',  () => _closeModal(histModal));
    histModal.addEventListener('click', (e) => { if (e.target === histModal) _closeModal(histModal); });

    // Region select — show custom input when 'others' is chosen
    const regionSelect = document.getElementById('pfRegion');
    const regionCustom = document.getElementById('pfRegionCustom');
    regionSelect.addEventListener('change', () => {
        const isOther = regionSelect.value === 'others';
        regionCustom.style.display = isOther ? 'block' : 'none';
        if (!isOther) regionCustom.value = '';
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            _closeModal(modal);
            _closeModal(histModal);
        }
    });
}

function _openProcessModal() {
    const modal = document.getElementById('processModal');
    document.getElementById('processForm').reset();
    document.getElementById('processFormError').hidden = true;
    document.getElementById('pfRegionCustom').style.display = 'none';
    document.querySelectorAll('#processForm .con-field--error').forEach(f => f.classList.remove('con-field--error'));
    modal.hidden = false;
    document.getElementById('pfName').focus();
}

function _closeModal(modal) {
    modal.hidden = true;
}

async function _handleProcessFormSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById('processFormError');
    errEl.hidden = true;

    // Clear previous field highlights
    document.querySelectorAll('#processForm .con-field--error').forEach(f => f.classList.remove('con-field--error'));

    const nameEl         = document.getElementById('pfName');
    const regionSelEl    = document.getElementById('pfRegion');
    const regionCustomEl = document.getElementById('pfRegionCustom');
    const providerEl     = document.getElementById('pfProvider');
    const unitEl         = document.getElementById('pfUnit');
    const categoryEl     = document.getElementById('pfCategory');
    const descEl         = document.getElementById('pfDescription');

    const regionVal = regionSelEl.value === 'others'
        ? regionCustomEl.value.trim()
        : regionSelEl.value;

    // Validate required fields
    const errors = [];
    const markField = (el, msg) => {
        el.closest('.con-field').classList.add('con-field--error');
        errors.push(msg);
    };

    if (!nameEl.value.trim())      markField(nameEl,      'Process Name is required.');
    if (!regionVal)                markField(regionSelEl,  'Region is required.');
    if (!providerEl.value.trim())  markField(providerEl,   'Provider Name is required.');
    if (!categoryEl.value.trim())  markField(categoryEl,   'Process Set Category is required.');

    if (errors.length) {
        errEl.textContent = errors[0];
        errEl.hidden = false;
        return;
    }

    const body = {
        processName:  nameEl.value.trim(),
        processId:    _generateId(),
        region:       regionVal,
        providerName: providerEl.value.trim(),
        unit:         unitEl.value.trim(),
        category:     categoryEl.value.trim(),
        description:  descEl.value.trim()
    };

    const submitBtn = e.target.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';

    try {
        await apiReq('POST', '/api/workbench/processes', body);
        _closeModal(document.getElementById('processModal'));
        _fetchWarehouse(document.getElementById('whSearchInput').value.trim());
    } catch (err) {
        const msg = err.message || 'Upload failed. Please try again.';
        errEl.textContent = msg;
        errEl.hidden = false;
        console.error('Process creation failed:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload to Warehouse';
    }
}

function _openHistDetail(rec) {
    const modal    = document.getElementById('histDetailModal');
    const titleEl  = document.getElementById('histDetailTitle');
    const bodyEl   = document.getElementById('histDetailBody');

    titleEl.textContent = rec.chainName;

    const date = new Date(rec.runAt).toLocaleString();

    // Build chain mini-view
    let chainHtml = '<div class="hist-detail-chain">';
    rec.nodes.forEach((n, idx) => {
        if (idx > 0) chainHtml += '<div class="hist-detail-arrow"></div>';
        chainHtml += `
            <div class="hist-detail-node">
                <div class="hist-detail-node-name">${_esc(n.processName || n.processId)}</div>
                <div class="hist-detail-node-sub">${_esc(n.region || '')}${n.processId ? ' · ' + _esc(n.processId) : ''}</div>
            </div>`;
    });
    chainHtml += '</div>';

    // Results section
    const resultsStr = rec.results
        ? `<pre style="white-space:pre-wrap;word-break:break-all;font-size:0.8rem;">${_esc(JSON.stringify(rec.results, null, 2))}</pre>`
        : '<p style="color:#889;font-size:0.85rem;">No results recorded (stub run).</p>';

    bodyEl.innerHTML = `
        <div class="hist-detail-grid">
            <div class="hist-detail-field">
                <label>Product Name</label>
                <p>${_esc(rec.productName || '—')}</p>
            </div>
            <div class="hist-detail-field">
                <label>Functional Unit</label>
                <p>${_esc(rec.functionalUnit || '—')}</p>
            </div>
            <div class="hist-detail-field">
                <label>System Boundary</label>
                <p>${_esc(rec.systemBoundary || '—')}</p>
            </div>
            <div class="hist-detail-field">
                <label>Run At</label>
                <p>${_esc(date)}</p>
            </div>
            ${rec.notes ? `<div class="hist-detail-field" style="grid-column:1/-1;">
                <label>Notes</label>
                <p>${_esc(rec.notes)}</p>
            </div>` : ''}
        </div>
        <div class="hist-detail-chain-title">Value Chain (${rec.nodes.length} step${rec.nodes.length !== 1 ? 's' : ''})</div>
        ${chainHtml}
        <div class="hist-detail-results">
            <strong>Results</strong><br>
            ${resultsStr}
        </div>
    `;

    modal.hidden = false;
}

/* ══════════════════════════════════════════════════════════════
   ECOINVENT BULK IMPORT
══════════════════════════════════════════════════════════════ */
async function _importEcoinvent() {
    const btn      = document.getElementById('whImportBtn');
    const progress = document.getElementById('whImportProgress');
    const BATCH_SIZE = 150;

    if (!confirm(
        'This will import all EcoInvent activities into your Warehouse.\n' +
        'Activities already imported will be skipped.\n\nProceed?'
    )) return;

    btn.disabled = true;
    btn.textContent = 'Importing\u2026';
    progress.hidden = false;
    progress.textContent = 'Fetching activity list\u2026';

    try {
        const resp = await fetch('/ecoinvent_activities.json');
        if (!resp.ok) throw new Error('Failed to load ecoinvent_activities.json (status ' + resp.status + ')');
        const data = await resp.json();
        const activities = data.activities || [];
        progress.textContent = `Loaded ${activities.length.toLocaleString()} activities. Starting import\u2026`;

        let totalInserted = 0;
        let totalSkipped  = 0;

        for (let i = 0; i < activities.length; i += BATCH_SIZE) {
            const batch = activities.slice(i, i + BATCH_SIZE).map(act => {
                // Strip the ISIC number prefix ("2011:Manufacture of…" → "Manufacture of…")
                let category = act.isic_category || act.ecospold_category || 'General';
                const colon = category.indexOf(':');
                if (colon !== -1) category = category.slice(colon + 1).trim();

                return {
                    processName:  act.activity_name,
                    processId:    act.code  || _generateId(),  // ecoinvent code for dedup
                    region:       act.region || 'GLO',
                    unit:         act.unit   || '',
                    providerName: 'EcoInvent',
                    category:     category,
                    uuid:         act.uuid   || '',            // stored in MongoDB, not displayed
                    description:  ''
                };
            });

            try {
                const result = await apiReq('POST', '/api/workbench/processes/batch', { processes: batch });
                totalInserted += result.inserted || 0;
                totalSkipped  += result.skipped  || 0;
            } catch (batchErr) {
                console.warn('Batch error (continuing):', batchErr);
                totalSkipped += batch.length;
            }

            const done = Math.min(i + BATCH_SIZE, activities.length);
            const pct  = Math.round((done / activities.length) * 100);
            progress.textContent =
                `Importing\u2026 ${done.toLocaleString()} / ${activities.length.toLocaleString()} ` +
                `(${pct}%) \u2014 ${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped`;
        }

        progress.textContent =
            `\u2713 Import complete \u2014 ${totalInserted.toLocaleString()} activities added, ` +
            `${totalSkipped.toLocaleString()} already existed.`;
        _fetchWarehouse(document.getElementById('whSearchInput').value.trim());

    } catch (err) {
        progress.textContent = '\u2717 Error: ' + err.message;
        console.error('EcoInvent import failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = '\u8659 Import EcoInvent';
    }
}

/* ══════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════ */
/**
 * Generate a unique process ID. Uses crypto.randomUUID() where available,
 * falls back to a timestamp + random hex string.
 */
function _generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback: timestamp + 12 random hex chars
    return Date.now().toString(16) + '-' +
        Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
