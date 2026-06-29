// workbench.js — Workbench feature: Process Warehouse + Construction

// Requires shared.js to be loaded first (provides checkAuth() and apiReq()).

'use strict';

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
const WB = {
    activeTab: 'warehouse',
    warehouse: {
        processes: [],
        filtered: []
    },
    construction: {
        nodes: []
    }
};

let _workbenchPollTimer = null;
let _workbenchActiveJob = null;




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
    _initModals();

});

/* ══════════════════════════════════════════════════════════════
   SUB-TABS
══════════════════════════════════════════════════════════════ */
function _initSubtabs() {
    document.querySelectorAll('.wb-subtab').forEach(btn => {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            _switchTab(tab);
        });
    });
}


function _switchTab(tab) {
    WB.activeTab = tab;
    document.querySelectorAll('.wb-subtab').forEach(b => {
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return;
        b.classList.toggle('active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.wb-tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === `tab-${tab}`);
    });
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
    _clearConConsole();


    addBtn.addEventListener('click', _addNode);

        clearBtn.addEventListener('click', () => {
        if (!confirm('Clear all nodes and form fields?')) return;
        WB.construction.nodes = [];
        _nodeCounter = 0;
        _renderChain();
        document.getElementById('conChainName').value = '';
        document.getElementById('conProductName').value = '';
        document.getElementById('conFunctionalUnitAmount').value = '';
        document.getElementById('conFunctionalUnitUnit').value = 'tonne';
        document.getElementById('conRunMc').value = 'false';
        document.getElementById('conNSimulations').value = '';
        document.getElementById('conSystemBoundary').value = 'cradle-to-gate';
        document.getElementById('conNotes').value = '';
        _clearConConsole();
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
                        <div class="con-node-process-name">${_esc(_toTitleCaseActivityName(node.processName))}</div>

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
                <div class="con-dd-name">${_esc(_toTitleCaseActivityName(proc.processName))}</div>

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

    const chainName = document.getElementById('conChainName').value.trim();
    const productName = document.getElementById('conProductName').value.trim();
    const functionalUnitAmount = document.getElementById('conFunctionalUnitAmount').value.trim() || '1';
    const functionalUnitUnit = document.getElementById('conFunctionalUnitUnit').value;
        const runMc = document.getElementById('conRunMc').value === 'true';
    const nSimulationsInput = document.getElementById('conNSimulations').value.trim();
    const nSimulations = runMc ? (nSimulationsInput || '25') : '0';

    const systemBoundary = document.getElementById('conSystemBoundary').value;
    const notes = document.getElementById('conNotes').value.trim();

    if (!chainName) {
        alert('Please enter a Value Chain Name.');
        document.getElementById('conChainName').focus();
        return;
    }

    const filledNodes = WB.construction.nodes.filter(n => n.processId);
    if (!filledNodes.length) {
        alert('Please add at least one process to the value chain.');
        return;
    }

    const submitBtn = document.getElementById('conSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Running…';

    _clearConConsole();
    _appendConLog('Preparing payload from workbench form...', 'info');

    const payload = {
        chainName,
        productName,
        product: productName,
        functionalUnitAmount,
        functionalUnitUnit,
        runMc,
        nSimulations,
        systemBoundary,
        notes,
        nodes: filledNodes.map((n, idx) => ({
            order: idx,
            processId: n.processId,
            processName: n.processName,
            region: n.region,
            providerName: n.providerName
        }))
    };

    try {
        await apiReq('POST', '/api/workbench/chains', {
            ...payload,
            functionalUnit: `${functionalUnitAmount} ${functionalUnitUnit}`
        });
    } catch (err) {
        console.warn('Failed to save chain draft:', err);
    }

    try {
        const jobId = await _startWorkbenchJob(payload);
        _appendConLog(`Backend job accepted (jobId: ${jobId}). Polling for result...`, 'info');
        const answerPack = await _pollWorkbenchJob(jobId);
        _appendConLog('Result received. Persisting to history...', 'success');

                const persisted = await _persistWorkbenchRun(payload, answerPack);
        _appendConLog('Run completed and saved successfully.', 'success');

        const recordId = _resolveLcaRecordId(persisted);
        _appendConLog('Opening result page...', 'info');
        _routeToPastResults(recordId);

    } catch (err) {
        console.error('Run failed:', err);
        _appendConLog(`Run failed: ${err.message || err}`, 'error');
        alert('Run failed. Check Progress Console for details.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Run LCA';
    }
}


function _clearConConsole() {
    const log = document.getElementById('conConsoleLog');
    if (!log) return;
    log.innerHTML = '<p class="con-console-empty">No run started yet.</p>';
}

function _appendConLog(message, level = 'info') {
    const log = document.getElementById('conConsoleLog');
    if (!log) return;
    if (log.querySelector('.con-console-empty')) log.innerHTML = '';
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = document.createElement('p');
    p.className = `con-console-level-${level}`;
    p.textContent = `[${ts}] ${message}`;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
}

async function _startWorkbenchJob(payload) {
    _appendConLog('Submitting generation request to backend...', 'info');
    const resp = await fetch(`${FLASK_BASE}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'workbench_lca', workbench_payload: payload })
    });
    if (!resp.ok) {
        let errText = `Server error ${resp.status}`;
        try { const errJson = await resp.json(); errText = errJson.error || errText; } catch {}
        throw new Error(errText);
    }
    const data = await resp.json();
    _workbenchActiveJob = data.jobId;
    return data.jobId;
}

function _stopWorkbenchPolling() {
    if (_workbenchPollTimer) {
        clearInterval(_workbenchPollTimer);
        _workbenchPollTimer = null;
    }
    _workbenchActiveJob = null;
}

function _pollWorkbenchJob(jobId) {
    return new Promise((resolve, reject) => {
        let logOffset = 0;
        _workbenchPollTimer = setInterval(async () => {
            try {
                const resp = await fetch(`${FLASK_BASE}/api/jobs/${jobId}`);
                if (resp.status === 404) {
                    _stopWorkbenchPolling();
                    reject(new Error('Computation session was reset. Please rerun.'));
                    return;
                }
                const data = await resp.json();
                if (Array.isArray(data.logs)) {
                    for (let i = logOffset; i < data.logs.length; i++) {
                        const l = data.logs[i] || {};
                        _appendConLog(l.message || '', l.level || 'info');
                    }
                    logOffset = data.logs.length;
                }

                if (data.status === 'done') {
                    _stopWorkbenchPolling();
                    resolve(data.answer_pack || {});
                } else if (data.status === 'error') {
                    _stopWorkbenchPolling();
                    reject(new Error(data.error || 'Backend job failed.'));
                }
            } catch (err) {
                _appendConLog(`Polling error: ${err.message}`, 'warning');
            }
        }, 2500);
    });
}

async function _persistWorkbenchRun(payload, answerPack) {
    let processed = answerPack.processed_json || null;
    if (typeof processed === 'string') {
        try { processed = JSON.parse(processed); } catch { processed = null; }
    }

    const normalizedLcia = window.LciaUtils.normalizeLciaPayload(
        processed || answerPack.lcia_table,
        answerPack.answer || '',
        payload.productName || 'Unknown Product'
    );


    const carbonEmission = window.LciaUtils.toNumber(
        normalizedLcia?.totalMeanImpact || answerPack?.lcia_table?.totalMeanImpact || 0
    );

    const formPayload = {
        productDescription: payload.productName || '',
        functionalUnitAmount: payload.functionalUnitAmount,
        functionalUnitUnit: payload.functionalUnitUnit,
        systemBoundary: payload.systemBoundary,
        runMc: payload.runMc,
        nSimulations: payload.nSimulations,
        furtherNotes: payload.notes || ''
    };

    const lcaSaved = await apiReq('POST', '/api/lca-records', {
        product: payload.productName || 'Unknown Product',
        source: 'workbench',
        form: formPayload,
        data: normalizedLcia,
        carbonEmission,
        query: `Workbench chain: ${payload.chainName}`,
        answerText: answerPack.answer || ''
    });

    const historySaved = await apiReq('POST', '/api/workbench/history', {
        chainName: payload.chainName,
        productName: payload.productName,
        functionalUnit: `${payload.functionalUnitAmount} ${payload.functionalUnitUnit}`,
        functionalUnitAmount: payload.functionalUnitAmount,
        functionalUnitUnit: payload.functionalUnitUnit,
        runMc: payload.runMc,
        nSimulations: payload.nSimulations,
        systemBoundary: payload.systemBoundary,
        notes: payload.notes,
        nodes: payload.nodes,
        source: 'workbench',
        lcaRecordId: lcaSaved?.id || '',
        results: {
            answer_pack: answerPack,
            normalized_lcia: normalizedLcia,
            carbonEmission
        }
    });

        return { lca: lcaSaved, history: historySaved };
}

function _resolveLcaRecordId(persisted) {
    const lcaId = persisted?.lca?.id || persisted?.lca?._id;
    if (lcaId) return String(lcaId);

    const historyRecord = persisted?.history?.record || persisted?.history;
    if (historyRecord?.lcaRecordId) return String(historyRecord.lcaRecordId);

    return '';
}

function _routeToPastResults(recordId) {
    const target = recordId
        ? `/past_lca_results.html?recordId=${encodeURIComponent(recordId)}&from=workbench`
        : '/past_lca_results.html?from=workbench';
    window.location.assign(target);
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

                const source = (rec.source || 'workbench').toLowerCase();
        const fuText = rec.functionalUnit || `${rec.functionalUnitAmount || ''} ${rec.functionalUnitUnit || ''}`.trim();

        card.innerHTML = `
            <div class="hist-card-info">
                <div class="hist-card-name">
                    ${_esc(rec.chainName)}
                    <span class="hist-source-badge">${_esc(source)}</span>
                </div>
                <div class="hist-card-meta">
                    ${rec.productName ? 'Product: ' + _esc(rec.productName) + ' &nbsp;·&nbsp; ' : ''}
                    ${rec.nodes.length} step${rec.nodes.length !== 1 ? 's' : ''}
                    ${fuText ? ' &nbsp;·&nbsp; FU: ' + _esc(fuText) : ''}
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
    const modal = document.getElementById('histDetailModal');
    const titleEl = document.getElementById('histDetailTitle');
    const bodyEl = document.getElementById('histDetailBody');

    titleEl.textContent = rec.chainName;
    const date = new Date(rec.runAt).toLocaleString();

    let chainHtml = '<div class="hist-detail-chain">';
    (rec.nodes || []).forEach((n, idx) => {
        if (idx > 0) chainHtml += '<div class="hist-detail-arrow"></div>';
        chainHtml += `
            <div class="hist-detail-node">
                <div class="hist-detail-node-name">${_esc(n.processName || n.processId || '—')}</div>
                <div class="hist-detail-node-sub">${_esc(n.region || '')}${n.processId ? ' · ' + _esc(n.processId) : ''}</div>
            </div>`;
    });
    chainHtml += '</div>';

    const answerText = rec.results?.answer_pack?.answer || '';

    bodyEl.innerHTML = `
        <div class="hist-detail-layout">
            <div class="hist-detail-main">
                <div class="hist-detail-grid">
                    <div class="hist-detail-field"><label>Product Name</label><p>${_esc(rec.productName || '—')}</p></div>
                    <div class="hist-detail-field"><label>Functional Unit</label><p>${_esc(rec.functionalUnit || `${rec.functionalUnitAmount || ''} ${rec.functionalUnitUnit || ''}`.trim() || '—')}</p></div>
                    <div class="hist-detail-field"><label>System Boundary</label><p>${_esc(rec.systemBoundary || '—')}</p></div>
                    <div class="hist-detail-field"><label>Run At</label><p>${_esc(date)}</p></div>
                    <div class="hist-detail-field"><label>Source</label><p>${_esc(rec.source || 'workbench')}</p></div>
                    <div class="hist-detail-field"><label>Monte Carlo</label><p>${rec.runMc ? `Yes (${_esc(rec.nSimulations || '25')} simulations)` : 'No'}</p></div>
                    ${rec.notes ? `<div class="hist-detail-field" style="grid-column:1/-1;"><label>Notes</label><p>${_esc(rec.notes)}</p></div>` : ''}
                </div>

                <div class="hist-detail-chain-title">Value Chain (${(rec.nodes || []).length} step${(rec.nodes || []).length !== 1 ? 's' : ''})</div>
                ${chainHtml}

                <div class="hist-detail-results">
                    <strong>Sustainopedia Response</strong>
                    <div id="histDetailAnswer"></div>
                </div>

                <div class="hist-detail-results">
                    <strong>LCIA Results Table</strong>
                    <div id="histDetailTable"></div>
                </div>

                <div class="hist-detail-chart-wrap">
                    <canvas id="histDetailChart"></canvas>
                </div>
            </div>

            <div class="hist-detail-side">
                <div class="hist-chat-panel">
                    <div class="results-chat-header" style="padding:10px 12px;border-bottom:1px solid var(--border-color);font-weight:700;">SustainOpedia Assistant</div>
                    <div id="histChatWindow" class="hist-chat-window"></div>
                    <form id="histChatForm" class="hist-chat-form">
                        <textarea id="histChatInput" class="hist-chat-input" rows="1" placeholder="Ask about this result…"></textarea>
                        <button type="submit" class="hist-chat-send">Send</button>
                    </form>
                </div>
            </div>
        </div>
    `;

    if (window.markdownit) {
        const md = window.markdownit({ html: false, breaks: true, linkify: true });
        document.getElementById('histDetailAnswer').innerHTML = md.render(answerText || 'No response text available.');
    } else {
        document.getElementById('histDetailAnswer').textContent = answerText || 'No response text available.';
    }

    const lcia = rec.results?.normalized_lcia || rec.results?.answer_pack?.lcia_table || null;
    _renderHistoryDetailTable(lcia);
    _renderHistoryDetailChart(lcia);

    const chatRecordId = rec.lcaRecordId || rec._id;
    _initHistoryDetailChat(rec, chatRecordId);

    modal.hidden = false;
}


function _renderHistoryDetailTable(lcia) {
    const container = document.getElementById('histDetailTable');
    if (!container) return;
    container.innerHTML = '';

    if (!lcia) {
        container.innerHTML = '<p style="color:#889;font-size:0.85rem;">No LCIA table available.</p>';
        return;
    }

    if (typeof lcia === 'object' && Array.isArray(lcia.processes)) {
        const table = document.createElement('table');
        table.className = 'lcia-detail-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Process</th>
                    <th>Location</th>
                    <th>Unit</th>
                    <th>Mean Impact (kg CO₂-eq)</th>
                </tr>
            </thead>
            <tbody>
                ${lcia.processes.map(p => `
                    <tr>
                        <td>${_esc(p.process || '—')}</td>
                        <td>${_esc(p.location || p.unit_location || '—')}</td>
                        <td>${_esc(p.unit || p.ref_product || '—')}</td>
                        <td>${window.LciaUtils.toNumber(p.mean_impact).toFixed(3)}</td>
                    </tr>`).join('')}
                <tr class="lcia-total-row"><td colspan="3"><strong>Total</strong></td><td><strong>${window.LciaUtils.toNumber(lcia.totalMeanImpact).toFixed(3)}</strong></td></tr>
            </tbody>`;
        container.appendChild(table);
        return;
    }

    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = typeof lcia === 'string' ? lcia : JSON.stringify(lcia, null, 2);
    container.appendChild(pre);
}

function _renderHistoryDetailChart(lcia) {
    if (_detailChart) {
        _detailChart.destroy();
        _detailChart = null;
    }
    if (!window.Chart) return;

    const canvas = document.getElementById('histDetailChart');
    if (!canvas || !lcia || !Array.isArray(lcia.processes) || !lcia.processes.length) return;

    const labels = lcia.processes.map(p => (p.process || '—').slice(0, 24));
    const values = lcia.processes.map(p => window.LciaUtils.toNumber(p.mean_impact));
    const ctx = canvas.getContext('2d');
    _detailChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'kg CO₂-eq',
                data: values,
                backgroundColor: 'rgba(45, 106, 79, 0.72)',
                borderColor: '#2d6a4f',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function _buildLcaContextTextForHistory(rec) {
    const total = window.LciaUtils.toNumber(rec.results?.normalized_lcia?.totalMeanImpact || rec.results?.carbonEmission || 0).toFixed(3);
    const lines = [
        '=== LCA Results Context ===',
        `Product: ${rec.productName || 'Unknown'}`,
        `Chain: ${rec.chainName || 'Workbench Chain'}`,
        `Generated: ${new Date(rec.runAt).toLocaleString('en-US')}`,
        `Total Carbon Emission: ${total} kg CO2-eq`,
        ''
    ];
    const processes = rec.results?.normalized_lcia?.processes || [];
    if (processes.length) {
        lines.push('Processes:');
        processes.forEach(p => lines.push(`- ${p.process}: ${window.LciaUtils.toNumber(p.mean_impact).toFixed(3)} kg CO2-eq`));
    }
    return lines.join('\n');
}

function _stopHistoryDetailChatPolling() {
    if (_resultsChatPollTimer) {
        clearInterval(_resultsChatPollTimer);
        _resultsChatPollTimer = null;
    }
}

async function _lcaResultsChatSave(recordId, role, content) {
    try { await apiReq('POST', `/api/lca-results-chat/${recordId}`, { role, content }); } catch (err) { console.warn(err); }
}

async function _lcaResultsChatLoad(recordId) {
    try { return await apiReq('GET', `/api/lca-results-chat/${recordId}`); } catch { return []; }
}

function _initHistoryDetailChat(rec, recordId) {
    const chatWindow = document.getElementById('histChatWindow');
    const chatForm = document.getElementById('histChatForm');
    const chatInput = document.getElementById('histChatInput');
    if (!chatWindow || !chatForm || !chatInput) return;

    _stopHistoryDetailChatPolling();
    chatWindow.innerHTML = '';

    const appendMsg = (role, text) => {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        const c = document.createElement('div');
        c.className = 'message-content';
        if (role === 'bot-message' && window.markdownit) {
            const md = window.markdownit({ html: false, breaks: true, linkify: true });
            c.innerHTML = md.render(text || '');
        } else {
            c.textContent = text || '';
        }
        div.appendChild(c);
        chatWindow.appendChild(div);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    };

    _lcaResultsChatLoad(recordId).then(history => {
        if (history.length) {
            history.forEach(m => appendMsg(m.role === 'user' ? 'user-message' : 'bot-message', m.content));
        } else {
            appendMsg('bot-message', 'Ask any follow-up question about this workbench result.');
        }
    });

    const fresh = chatForm.cloneNode(true);
    chatForm.parentNode.replaceChild(fresh, chatForm);
    const freshInput = fresh.querySelector('#histChatInput');
    const context = _buildLcaContextTextForHistory(rec);

    fresh.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = freshInput.value.trim();
        if (!text) return;
        freshInput.value = '';
        appendMsg('user-message', text);
        _lcaResultsChatSave(recordId, 'user', text);

        const typing = document.createElement('div');
        typing.className = 'message bot-message';
        typing.innerHTML = '<div class="message-content">Thinking...</div>';
        chatWindow.appendChild(typing);

        try {
            const resp = await fetch(`${FLASK_BASE}/api/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'fast',
                    product: rec.productName || '',
                    question: `${context}\n\nUser follow-up: ${text}`
                })
            });
            if (!resp.ok) throw new Error(`Server error ${resp.status}`);
            const { jobId } = await resp.json();

            _resultsChatPollTimer = setInterval(async () => {
                try {
                    const p = await fetch(`${FLASK_BASE}/api/jobs/${jobId}`);
                    if (!p.ok) return;
                    const data = await p.json();
                    if (data.status === 'done') {
                        _stopHistoryDetailChatPolling();
                        typing.remove();
                        const answer = data.answer_pack?.answer || 'No response received.';
                        appendMsg('bot-message', answer);
                        _lcaResultsChatSave(recordId, 'bot', answer);
                    } else if (data.status === 'error') {
                        _stopHistoryDetailChatPolling();
                        typing.remove();
                        appendMsg('bot-message', `Error: ${data.error || 'Computation failed.'}`);
                    }
                } catch {}
            }, 2500);
        } catch (err) {
            typing.remove();
            appendMsg('bot-message', `Error: ${err.message}`);
        }
    });
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
function _toTitleCaseActivityName(str) {
    if (str == null) return '';
    return String(str)
        .toLowerCase()
        .replace(/\b([a-z])/g, (match, ch) => ch.toUpperCase());
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

