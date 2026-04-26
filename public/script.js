// Chat page logic — requires shared.js (checkAuth, apiReq globals)
// const FLASK_BASE = "http://localhost:5052";
const FLASK_BASE = "https://teamsustainopedia-backend-hbcvdcbvcsb4fmaf.eastasia-01.azurewebsites.net"; // for local development
const POLL_INTERVAL_MS = 2500;

let chatting = false;
let md = null;
let conversations = [];  // array of ChatHistory docs from MongoDB
let activeConvId = null; // _id of the active conversation

// ── Job polling state ──────────────────────────────────────────────────────────
let _pollTimer      = null;  // setInterval handle
let _activeJobId    = null;  // currently tracked job UUID
let currentMode     = 'thinking'; // 'thinking' | 'fast' — default to full LCIA pipeline

function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _activeJobId = null;
    sessionStorage.removeItem('pendingJob');
}

/**
 * Start polling Flask for job completion.
 * @param {string}      jobId           - UUID returned by POST /api/jobs
 * @param {HTMLElement} typingEl        - typing indicator element to remove on completion
 * @param {number|null} extractionTimer - setTimeout handle to clear on completion (may be null)
 */
function _startPolling(jobId, typingEl, extractionTimer, onMessage) {
    _activeJobId = jobId;
    let _consecutiveNetworkErrors = 0;
    const MAX_NETWORK_ERRORS = 3; // ~7.5 s of consecutive failures before giving up

    _pollTimer = setInterval(async () => {
        try {
            const resp = await fetch(`${FLASK_BASE}/api/jobs/${jobId}`);
            _consecutiveNetworkErrors = 0; // server is reachable — reset counter

            // Server restarted / job expired — give up gracefully
            if (resp.status === 404) {
                _stopPolling();
                clearTimeout(extractionTimer);
                if (typingEl?.parentNode) typingEl.parentNode.removeChild(typingEl);
                onMessage('bot-message', 'The computation session was reset. Please re-send your query.');
                document.querySelector('.send-btn').disabled = false;
                return;
            }

            const data = await resp.json();

            if (data.status === 'done') {
                _stopPolling();
                clearTimeout(extractionTimer);
                if (typingEl?.parentNode) typingEl.parentNode.removeChild(typingEl);
                // Parse the structured LCIA object so renderLCIAResultsTable (with column
                // visibility control) is used instead of the raw-markdown fallback.
                const lciaObj = data.answer_pack['processed_json']
                    ? JSON.parse(data.answer_pack['processed_json'])
                    : null;
                const intentParams = data.answer_pack['intent_params'] || null;
                onMessage('bot-message', data.answer_pack['answer'], lciaObj, undefined, intentParams);
                document.querySelector('.send-btn').disabled = false;

            } else if (data.status === 'error') {
                _stopPolling();
                clearTimeout(extractionTimer);
                if (typingEl?.parentNode) typingEl.parentNode.removeChild(typingEl);
                onMessage('bot-message', 'Error: ' + (data.error || 'Computation failed. Please try again.'));
                document.querySelector('.send-btn').disabled = false;
            }
            // status === 'pending' or 'running' → keep waiting

        } catch (err) {
            if (err instanceof TypeError) {
                // Network failure — count consecutive misses before giving up
                _consecutiveNetworkErrors++;
                if (_consecutiveNetworkErrors >= MAX_NETWORK_ERRORS) {
                    _stopPolling();
                    clearTimeout(extractionTimer);
                    if (typingEl?.parentNode) typingEl.parentNode.removeChild(typingEl);
                    onMessage('bot-message', 'The server is currently shut down. Please try again later.');
                    document.querySelector('.send-btn').disabled = false;
                }
            } else {
                // Unexpected programming error — log so it is never invisible
                console.error('[Polling] Unexpected error:', err);
            }
        }
    }, POLL_INTERVAL_MS);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('token')) return;

    const username = localStorage.getItem('username');

    // Convert a MongoDB message { role, content, lciData, timestamp }
    // to the frontend shape expected by renderChatWindow / appendMessage.
    function serverMsgToFrontend(msg) {
        return msg.role === 'user'
            ? { user: msg.content, lcia_table: msg.lciData ?? '', timestamp: msg.timestamp }
            : { bot:  msg.content, lcia_table: msg.lciData ?? '', queryMeta: msg.queryMeta ?? null, timestamp: msg.timestamp };
    }

    // Elements
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatWindow = document.getElementById('chatWindow');
    const newChatBtn = document.getElementById('newChatBtn');
    const toggleConversationBtn = document.getElementById('toggleConversationList');
    const navConvListItem = document.getElementById('navConvListItem');
    const conversationListPanel = document.getElementById('conversationListPanel'); // null with new layout; kept for compat
    const conversationList = document.getElementById('conversationList');
    const conversationTitleInput = document.getElementById('conversationTitleInput');

    // New Chat modal elements
    const newChatModal = document.getElementById('newChatModal');
    const newChatNameInput = document.getElementById('newChatNameInput');
    const createChatBtn = document.getElementById('createChatBtn');
    const cancelCreateBtn = document.getElementById('cancelCreateBtn');
    newChatModal.style.display = 'none';

    // Initialize markdown renderer here so processMarkdown works during loadConversations
    md = window.markdownit({ html: false, breaks: true, linkify: true });

    // ── Load conversations from MongoDB on startup ─────────────────────────
    async function loadConversations() {
        try {
            conversations = await apiReq('GET', '/api/chat-histories');
            renderConversationList();
            if (conversations.length > 0) {
                const latest = conversations[0]; // server returns newest-first
                activeConvId = latest._id;
                renderChatWindow(latest.messages.map(serverMsgToFrontend));
                if (conversationTitleInput) conversationTitleInput.value = latest.conversationName;
                renderConversationList(); // re-render to apply active highlight after activeConvId is set
            } else {
                if (conversationTitleInput) conversationTitleInput.value = 'Conversation';
                showWelcomeScreen();
            }
        } catch (err) {
            console.error('Failed to load conversations:', err);
            showWelcomeScreen();
        }
    }
    await loadConversations();

    // Helper functions for CSV export
    function convertToCSV(data) {
        if (!data || !data.processes) return '';
        
        const headers = ['Process', 'Amount & Location', 'System Boundary', 'Matched Activity', 
                        'Unit / Location', 'DB Version', 'Ref. Product', 'Mean Impact (kg CO2-Eq)', 
                        'SD (kg CO2-Eq)', '5/95 Percentile', 'Notes'];
        
        let csv = headers.join(',') + '\n';
        data.processes.forEach(process => {
            const row = [
                window.LciaUtils.escapeCSV(process.process),
                window.LciaUtils.escapeCSV(process.amount_location),
                window.LciaUtils.escapeCSV(process.system_boundary),
                window.LciaUtils.escapeCSV(process.matched_activity),
                window.LciaUtils.escapeCSV(process.unit_location),
                window.LciaUtils.escapeCSV(process.db_version_code),
                window.LciaUtils.escapeCSV(process.ref_product),
                process.mean_impact,
                process.sd,
                window.LciaUtils.escapeCSV(process.percentile),
                ''
            ];
            csv += row.join(',') + '\n';
        });
        
        csv += '\n' + 'Total Estimated Impact,' + data.totalMeanImpact + ' kg CO2-Eq\n';
        return csv;
    }

    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function addCSVDownloadButton(messageDiv, lciData) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '10px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-small download';
        downloadBtn.textContent = 'Download CSV';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.style.padding = '6px 12px';
        downloadBtn.style.borderRadius = '6px';
        downloadBtn.style.border = 'none';
        downloadBtn.style.background = 'linear-gradient(135deg, #2d6a4f 0%, #40916c 100%)';
        downloadBtn.style.color = 'white';
        downloadBtn.style.fontWeight = '500';
        downloadBtn.style.fontSize = '0.85rem';
        
        downloadBtn.addEventListener('click', () => {
            const csv = convertToCSV(lciData);
            const product = lciData.product || 'LCA';
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
            const filename = `${product}_LCA_${timestamp}.csv`;
            downloadCSV(csv, filename);
        });

        buttonContainer.appendChild(downloadBtn);
        messageDiv.appendChild(buttonContainer);
    }

    // Save LCA record to MongoDB
    function storeLCARecord(product, lciData, timestamp, query, answerText) {
        apiReq('POST', '/api/lca-records', {
            product,
            data: lciData,
            carbonEmission: lciData.totalMeanImpact,
            query:      query      || '',
            answerText: answerText || ''
        }).catch(err => console.error('Failed to save LCA record:', err));
    }

    // Export all data — now fetches from the server
    // (exported via the exportDataBtn handler above)

    function openNewChatModal() {
        if (!newChatModal) return;
        newChatNameInput.value = '';
        newChatModal.style.display = 'flex';
        setTimeout(() => newChatNameInput.focus(), 50);
    }

    function closeNewChatModal() {
        if (!newChatModal) return;
        newChatModal.style.display = 'none';
    }

    // ── Sample queries per feature ─────────────────────────────────────────
    const SAMPLE_QUERIES = {
        lcia: [
            { label: 'Material',    text: 'What is the carbon footprint of producing 1 tonne of crude steel?' },
            { label: 'Product',  text: 'What is the lifecycle emission of producing an electric vehicle?' },
            { label: 'Energy',    text: 'What is the CO\u2082 emission of generating 1 kWh from coal power?' },
            { label: 'Transport', text: 'Carbon footprint of producing one electric vehicle battery.' },
        ],
        literature: [
            { label: 'Method',    text: 'Summarise peer-reviewed studies on LCA methodology for steel production.' },
            { label: 'Circular',  text: 'What does the literature say about circularity in aluminium recycling?' },
            { label: 'Cement',    text: 'Find LCA studies on cement and concrete production emissions.' },
            { label: 'Biomass',   text: 'Review literature on biomass energy lifecycle emissions.' },
        ],
        compare: [
            { label: 'Metals',    text: 'Compare the carbon footprint of crude steel vs aluminium production.' },
            { label: 'Plastics',  text: 'Compare GWP of PET vs PLA bioplastic for 1 kg of packaging.' },
            { label: 'Energy',    text: 'Compare lifecycle emissions of solar PV vs natural gas electricity.' },
            { label: 'Transport', text: 'Compare CO\u2082 of producing a BEV vs a conventional ICE vehicle.' },
        ],
    };

    function showWelcomeScreen() {
        document.getElementById('chatbot').classList.add('welcome-mode');
        const displayName = localStorage.getItem('username') || 'there';
        chatWindow.innerHTML = `
            <div class="welcome-core">
                <h1 class="welcome-core-greeting">Hello, <span>${displayName}</span></h1>
                <p class="welcome-core-sub">Your AI assistant for Life Cycle Assessment &amp; environmental impact analysis.</p>
            </div>`;
        // Move input form inside the chatWindow so greeting + form center together
        chatWindow.appendChild(chatForm);
    }

    function hideWelcomeScreen() {
        const chatbot = document.getElementById('chatbot');
        if (!chatbot.classList.contains('welcome-mode')) return;

        // Animate greeting out
        const greeting = chatWindow.querySelector('.welcome-core');
        if (greeting) {
            greeting.classList.add('exiting');
            greeting.addEventListener('animationend', () => greeting.remove(), { once: true });
        }

        // FLIP: record where the form is NOW (inside chatWindow, centered)
        const startRect = chatForm.getBoundingClientRect();

        // Move form back to its normal position (sibling after chatWindow)
        chatbot.appendChild(chatForm);
        chatbot.classList.remove('welcome-mode');

        // Animate form from its old position to the new bottom position
        const endRect = chatForm.getBoundingClientRect();
        const dy = startRect.top - endRect.top;
        if (Math.abs(dy) > 1) {
            chatForm.style.transition = 'none';
            chatForm.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
                chatForm.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
                chatForm.style.transform = '';
                chatForm.addEventListener('transitionend', () => {
                    chatForm.style.transition = '';
                    chatForm.style.transform = '';
                }, { once: true });
            });
        }
    }

    // Persist a new conversation to MongoDB and update local state.
    // Pure data — does not affect the UI so it can be called before appendMessage.
    async function _createConvDoc(name) {
        const header = name || ('Chat ' + formatTime(new Date()));
        if (conversationTitleInput) conversationTitleInput.value = header;
        try {
            const result = await apiReq('POST', '/api/chat-histories', { conversationName: header });
            const newConv = result.history;
            conversations.unshift(newConv);
            activeConvId = newConv._id;
            renderConversationList();
        } catch (err) {
            console.error('Failed to create conversation:', err);
        }
    }

    async function createConversation(name) {
        const header = name || ('Chat ' + formatTime(new Date()));
        showWelcomeScreen();
        await _createConvDoc(header);
    }

    let currentChatId = null;
    let newChatTitle = "";
    let lastUserQuery = '';  // tracks the most recent user prompt for LCA record storage

    // ── Chat History ──────────────────────────────────────────────────────────
    // renderConversationList reads the module-level `conversations` array.
    function renderConversationList() {
        conversationList.innerHTML = '';
        conversations.forEach((conv) => {
            const li = document.createElement('li');
            li.dataset.convId = conv._id;
            li.setAttribute('role', 'button');
            li.setAttribute('tabindex', '0');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'conv-name';
            nameSpan.textContent = conv.conversationName;
            li.appendChild(nameSpan);

            li.addEventListener('click', () => selectConversation(conv._id));
            li.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') selectConversation(conv._id);
            });

            // Double-click on the active item to rename it inline
            li.addEventListener('dblclick', (e) => {
                if (conv._id !== activeConvId) return;
                e.stopPropagation();
                const original = nameSpan.textContent;
                nameSpan.contentEditable = 'true';
                nameSpan.focus();
                const range = document.createRange();
                range.selectNodeContents(nameSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);

                const saveRename = async () => {
                    nameSpan.contentEditable = 'false';
                    const newName = nameSpan.textContent.trim();
                    if (!newName || newName === original) { nameSpan.textContent = original; return; }
                    conv.conversationName = newName;
                    if (conversationTitleInput) conversationTitleInput.value = newName;
                    try {
                        await apiReq('PATCH', `/api/chat-histories/${activeConvId}`, { conversationName: newName });
                    } catch (err) {
                        console.error('Failed to rename conversation:', err);
                        conv.conversationName = original;
                        nameSpan.textContent = original;
                    }
                };

                nameSpan.addEventListener('blur', saveRename, { once: true });
                nameSpan.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); nameSpan.blur(); }
                    else if (ke.key === 'Escape') {
                        nameSpan.removeEventListener('blur', saveRename);
                        nameSpan.textContent = original;
                        nameSpan.contentEditable = 'false';
                    }
                }, { once: true });
            });

            if (conv._id === activeConvId) li.classList.add('active');
            conversationList.appendChild(li);
        });
    }

    function renderChatWindow(messages) {
        const chatbot = document.getElementById('chatbot');
        // Rescue form from chatWindow (welcome mode) before clearing innerHTML
        if (chatWindow.contains(chatForm)) {
            chatbot.appendChild(chatForm);
        }
        chatbot.classList.remove('welcome-mode');
        chatWindow.innerHTML = '';
        chatting = false;
        messages.forEach(msg => {
            if (msg.user !== undefined) {
                appendMessage('user-message', msg.user, msg.lcia_table, msg.timestamp);
            } else if (msg.bot !== undefined) {
                appendMessage('bot-message', msg.bot, msg.lcia_table, msg.timestamp, msg.queryMeta ?? null);
            }
        });
        chatting = true;
    }

    function selectConversation(convId) {
        const conv = conversations.find(c => c._id === convId);
        if (!conv) return;
        activeConvId = conv._id;
        Array.from(conversationList.children).forEach(li => li.classList.remove('active'));
        const selectedLi = Array.from(conversationList.children).find(li => li.dataset.convId === convId);
        if (selectedLi) selectedLi.classList.add('active');
        renderChatWindow(conv.messages.map(serverMsgToFrontend));
        if (conversationTitleInput) conversationTitleInput.value = conv.conversationName;
    }

    // ── Resume a pending job if the user navigated away mid-computation ────────
    const _savedJob = sessionStorage.getItem('pendingJob');
    if (_savedJob) {
        try {
            const { jobId, convId, query: savedQuery, product: savedProduct } = JSON.parse(_savedJob);

            // Switch to the conversation that was active when the job was submitted
            if (convId && convId !== activeConvId) {
                const conv = conversations.find(c => c._id === convId);
                if (conv) selectConversation(convId);
            }

            lastUserQuery = savedQuery || '';

            // Show typing indicator and resume polling (no extraction timer on resume)
            chatForm.querySelector('.send-btn').disabled = true;
            chatting = true;
            const resumeTypingEl = showTypingIndicator('Sustainopedia Bot');
            const resumeExtra = resumeTypingEl.querySelector('.typing-extra');
            if (resumeExtra) resumeExtra.style.display = 'block'; // already past 10s threshold

            _startPolling(jobId, resumeTypingEl, null, appendMessage);

        } catch (_) {
            sessionStorage.removeItem('pendingJob');
        }
    }

    // ── Conversation panel open/close helpers ────────────────────────────────
    function openConvPanel() {
        if (navConvListItem) navConvListItem.classList.add('open');
        if (toggleConversationBtn) {
            toggleConversationBtn.setAttribute('aria-expanded', 'true');
            const icon = toggleConversationBtn.querySelector('.toggle-icon');
            if (icon) icon.textContent = '⮝';
        }
    }

    function closeConvPanel() {
        if (navConvListItem) navConvListItem.classList.remove('open');
        if (toggleConversationBtn) {
            toggleConversationBtn.setAttribute('aria-expanded', 'false');
            const icon = toggleConversationBtn.querySelector('.toggle-icon');
            if (icon) icon.textContent = '⮟';
        }
    }

    // Toggle conversation history panel in nav
    toggleConversationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navConvListItem.classList.contains('open') ? closeConvPanel() : openConvPanel();
    });

    // Close panel when clicking outside the nav chat tab area
    document.addEventListener('click', (e) => {
        const chatNavTab = document.getElementById('chatNavTab');
        const convListItem = document.getElementById('navConvListItem');
        if (!chatNavTab?.contains(e.target) && !convListItem?.contains(e.target)) {
            closeConvPanel();
        }
    });

    // conversationTitleInput is now a hidden element; rename is via double-click on nav items
    if (conversationTitleInput) {
        let renameOriginal = '';

        conversationTitleInput.addEventListener('click', () => {
            if (!activeConvId || !conversationTitleInput.readOnly) return;
            renameOriginal = conversationTitleInput.value;
            conversationTitleInput.removeAttribute('readonly');
            conversationTitleInput.select();
        });

        conversationTitleInput.addEventListener('blur', async () => {
            if (conversationTitleInput.readOnly) return;
            const newName = conversationTitleInput.value.trim();
            conversationTitleInput.setAttribute('readonly', '');
            if (!newName || newName === renameOriginal) {
                conversationTitleInput.value = renameOriginal || 'Conversation';
                return;
            }
            const conv = conversations.find(c => c._id === activeConvId);
            if (conv) conv.conversationName = newName;
            renderConversationList();
            try {
                await apiReq('PATCH', `/api/chat-histories/${activeConvId}`, { conversationName: newName });
            } catch (err) {
                console.error('Failed to rename conversation:', err);
                if (conv) conv.conversationName = renameOriginal;
                conversationTitleInput.value = renameOriginal;
                renderConversationList();
            }
        });

        conversationTitleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                conversationTitleInput.blur();
            } else if (e.key === 'Escape') {
                conversationTitleInput.value = renameOriginal;
                conversationTitleInput.setAttribute('readonly', '');
            }
        });
    }

    // Auto-resize textarea
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
    });

    // New chat: open modal to collect a name
    newChatBtn.addEventListener('click', () => {
        openNewChatModal();
    });

    // Modal action handlers
    if (createChatBtn) {
        createChatBtn.addEventListener('click', () => {
            const name = sanitizeInput(newChatNameInput.value.trim()) || ('Chat ' + formatTime(new Date()));
            createConversation(name);
            closeNewChatModal();
        });
    }
    if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener('click', () => {
            closeNewChatModal();
        });
    }

    // close modal when clicking outside modal box
    if (newChatModal) {
        newChatModal.addEventListener('click', (e) => {
            if (e.target === newChatModal) closeNewChatModal();
        });
    }

    // ── Feature menu toggle ──────────────────────────────────────────────────
    const featureMenuBtn = document.getElementById('featureMenuBtn');
    const featureMenuEl  = document.getElementById('featureMenu');
    const sampleQueriesEl = document.getElementById('sampleQueries');

    function closeSampleQueries() {
        sampleQueriesEl.hidden = true;
        sampleQueriesEl.innerHTML = '';
    }

    function closeFeatureMenu() {
        featureMenuEl.hidden = true;
        featureMenuBtn.setAttribute('aria-expanded', 'false');
    }

    featureMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !featureMenuEl.hidden;
        if (isOpen) {
            closeFeatureMenu();
        } else {
            featureMenuEl.hidden = false;
            featureMenuBtn.setAttribute('aria-expanded', 'true');
        }
    });

    featureMenuEl.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent document handler from immediately closing sample queries
        const item = e.target.closest('[data-feature]');
        if (!item) return;
        // Coming-soon items close the menu but do nothing else
        if (item.classList.contains('coming-soon')) {
            closeFeatureMenu();
            return;
        }
        const feature = item.dataset.feature;
        closeFeatureMenu();

        // Build sample query cards
        const queries = SAMPLE_QUERIES[feature] || [];
        sampleQueriesEl.innerHTML = '';
        queries.forEach(q => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sample-query-card';
            btn.innerHTML = `<span class="sample-query-label">${q.label}</span>${q.text}`;
            btn.addEventListener('click', () => {
                userInput.value = q.text;
                userInput.dispatchEvent(new Event('input'));  // trigger auto-resize
                userInput.focus();
                closeSampleQueries();
            });
            sampleQueriesEl.appendChild(btn);
        });
        sampleQueriesEl.hidden = false;
    });

    // Close feature menu / sample queries / mode menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!featureMenuEl.hidden && !featureMenuBtn.contains(e.target) && !featureMenuEl.contains(e.target)) {
            closeFeatureMenu();
        }
        if (!sampleQueriesEl.hidden && !sampleQueriesEl.contains(e.target) && !featureMenuBtn.contains(e.target)) {
            closeSampleQueries();
        }
        if (!modeMenuEl.hidden && !modeMenuBtn.contains(e.target) && !modeMenuEl.contains(e.target)) {
            closeModeMenu();
        }
    });

    // ── Mode selector ───────────────────────────────────────────────────────
    const modeMenuBtn = document.getElementById('modeMenuBtn');
    const modeMenuEl  = document.getElementById('modeMenu');

    function closeModeMenu() {
        modeMenuEl.hidden = true;
        modeMenuBtn.setAttribute('aria-expanded', 'false');
    }

    modeMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !modeMenuEl.hidden;
        if (isOpen) {
            closeModeMenu();
        } else {
            modeMenuEl.hidden = false;
            modeMenuBtn.setAttribute('aria-expanded', 'true');
        }
    });

    modeMenuEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('[data-mode]');
        if (!item) return;
        currentMode = item.dataset.mode;
        // Update button label to reflect the selected mode
        document.getElementById('modeBtnLabel').textContent =
            currentMode === 'thinking' ? 'Thinking ⮝' : 'General ⮝';
        // Update active state on menu items
        modeMenuEl.querySelectorAll('.mode-menu-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === currentMode);
        });
        closeModeMenu();
    });

    // Send message
    chatForm.addEventListener('submit', async (e) => {
        chatting = true;
        e.preventDefault();
        chatForm.querySelector('.send-btn').disabled = true;
        const query = sanitizeInput(userInput.value.trim());
        userInput.value = '';
        userInput.style.height = 'auto';
        const productName = sanitizeInput(document.getElementById('productInput').value.trim());
        if (!query) {
            chatForm.querySelector('.send-btn').disabled = false;
            return;
        }

        // Close any open feature menu / sample queries
        closeFeatureMenu();
        closeSampleQueries();

        // Transition out of welcome mode (FLIP animation) on first message
        hideWelcomeScreen();

        // Auto-create a conversation on the user's very first message so all
        // subsequent appendMessage calls have a valid activeConvId to persist to.
        if (!activeConvId) {
            await _createConvDoc(productName || 'Welcome');
        }

        const now = formatTime(new Date().toISOString());
        lastUserQuery = query;
        appendMessage('user-message', query, null, now);

        const typingEl = showTypingIndicator('Sustainopedia Bot');

        // After 10 s show the "Extracting…" extra line
        const extractionTimer = setTimeout(() => {
            if (typingEl?.parentNode) {
                const extra = typingEl.querySelector('.typing-extra');
                if (extra) {
                    extra.style.display = 'block';
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
            }
        }, 10000);

        try {
            // POST the job — Flask responds immediately with a jobId
            const jobResp = await fetch(`${FLASK_BASE}/api/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: query, product: productName, mode: currentMode })
            });

            if (!jobResp.ok) throw new Error(`Server error ${jobResp.status}`);
            const { jobId } = await jobResp.json();

            // Persist the pending job so we can resume if the user navigates away
            sessionStorage.setItem('pendingJob', JSON.stringify({
                jobId,
                convId:    activeConvId,
                query:     query,
                product:   productName
            }));

            // Start polling — send button stays disabled until job completes
            _startPolling(jobId, typingEl, extractionTimer, appendMessage);

        } catch (err) {
            clearTimeout(extractionTimer);
            if (typingEl?.parentNode) typingEl.parentNode.removeChild(typingEl);
            appendMessage('bot-message', 'Error: ' + err.message);
            chatForm.querySelector('.send-btn').disabled = false;
        }
    });

    
    function processMarkdown(text) {
        if (!text) return '';
        return md.render(text);
    }


    // Build a compact classification badge displayed above each bot response
    function buildIntentBadge(intentParams) {
        if (!intentParams || !intentParams.intent) return null;
        const el = document.createElement('div');
        el.className = 'intent-badge';
        const parts = [];
        if (intentParams.intent === 'computation') {
            parts.push('Computation');
            if (intentParams.product && intentParams.product !== 'Not Specified') parts.push(intentParams.product);
            parts.push(`${intentParams.amount} ${intentParams.unit}`);
            parts.push(intentParams.system_boundary);
            if (intentParams.region) parts.push(intentParams.region);
            if (intentParams.run_mc) parts.push(`Monte Carlo \u00d7${intentParams.n_simulations}`);
        } else if (intentParams.intent === 'literature') {
            parts.push('Literature Retrieval');
            if (intentParams.product && intentParams.product !== 'Not Specified') parts.push(intentParams.product);
        } else {
            parts.push('General LCA Query');
        }
        el.textContent = parts.join(' \u00b7 ');
        return el;
    }

    function appendMessage(type, text, lcia_table, timestamp = new Date().toISOString(), intentParams = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        // ── Bot avatar (bot messages only) ───────────────────────────────────
        // if (type === 'bot-message') {
        //     const avatarDiv = document.createElement('div');
        //     avatarDiv.className = 'bot-avatar';
        //     avatarDiv.innerHTML = `<img src="static/img/logo.png" alt="Sustainopedia Bot"><span class="bot-avatar-label">Bot</span>`;
        //     messageDiv.appendChild(avatarDiv);
        // }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (type === 'bot-message') {
            // Show intent classification badge if available
            const badge = buildIntentBadge(intentParams);
            if (badge) contentDiv.appendChild(badge);

            // Render full markdown once, then animate each top-level block in sequence
            const rendered = processMarkdown(text || '');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rendered;

            // If markdown produced no block children (plain text), wrap it
            if (tempDiv.children.length === 0 && tempDiv.textContent.trim()) {
                const p = document.createElement('p');
                p.textContent = tempDiv.textContent;
                tempDiv.appendChild(p);
            }

            Array.from(tempDiv.children).forEach((child, i) => {
                child.classList.add('bot-block');
                child.style.animationDelay = `${i * 55}ms`;
                contentDiv.appendChild(child);
            });

            // Blinking cursor that disappears once all blocks are revealed
            const totalDelay = Math.max(tempDiv.children.length * 55, 55);
            const cursor = document.createElement('span');
            cursor.className = 'bot-cursor';
            contentDiv.appendChild(cursor);
            setTimeout(() => cursor.remove(), totalDelay + 500);
        } else {
            // User messages: plain text (HTML-escaped via textContent)
            contentDiv.textContent = text || '';
        }

        // ── LCIA table ───────────────────────────────────────────────────────
        if (lcia_table) {
            const br1 = document.createElement('br');
            const br2 = document.createElement('br');
            const referenceNote = document.createElement('div');
            referenceNote.textContent = '\nBelow is a LCIA table from calculation engine...';

            contentDiv.appendChild(br1);
            contentDiv.appendChild(br2);
            contentDiv.appendChild(referenceNote);

            const spacer = document.createElement('div');
            spacer.style.height = '8px';
            contentDiv.appendChild(spacer);

            if (typeof lcia_table === 'object' && lcia_table !== null) {
                renderLCIAResultsTable(lcia_table, contentDiv);
                if (type === 'bot-message' && lcia_table.totalMeanImpact) {
                    addCSVDownloadButton(contentDiv, lcia_table);
                }
            } else {
                const cleanTable = window.LciaUtils.extractMarkdownTable(lcia_table);
                const parsedTable = window.LciaUtils.parseMarkdownTable(cleanTable);
                if (parsedTable) {
                    contentDiv.appendChild(parsedTable);
                } else {
                    const pre = document.createElement('pre');
                    pre.className = 'lcia-raw';
                    pre.textContent = String(lcia_table);
                    contentDiv.appendChild(document.createElement('br'));
                    contentDiv.appendChild(pre);
                }
            }
        } else {
            lcia_table = "";
        }

        messageDiv.appendChild(contentDiv);
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        if (chatting) {
            // ── Persist message to MongoDB ────────────────────────────────────
            const activeConv = conversations.find(c => c._id === activeConvId);
            if (activeConv && activeConvId) {
                const serverMsg = {
                    role:      type === 'user-message' ? 'user' : 'bot',
                    content:   text,
                    lciData:   lcia_table || null,
                    queryMeta: intentParams || null,  // intent params for analytics and history
                    timestamp
                };
                activeConv.messages.push(serverMsg);
                activeConv.updatedAt = new Date().toISOString();
                apiReq('PUT', `/api/chat-histories/${activeConvId}`, serverMsg)
                    .catch(err => console.error('Failed to save message:', err));
            }

            // ── Store LCA record if this is a bot message with LCIA data ─────
            if (type === 'bot-message' && lcia_table) {
                const productName = document.getElementById('productInput').value.trim();
                const normalizedLcia = window.LciaUtils.normalizeLciaPayload(lcia_table, text, productName);
                if (normalizedLcia && normalizedLcia.totalMeanImpact) {
                    storeLCARecord(
                        productName || normalizedLcia.product || 'Unknown Product',
                        normalizedLcia,
                        timestamp,
                        lastUserQuery,
                        text
                    );
                }
            }
        }
    }

    // setItemInLocalStorage removed — messages are now persisted via apiReq PUT /api/chat-histories/:id

    function formatTime(isoString) {
        const date = new Date(isoString);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(date.getDate()).padStart(2, '0');

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }


    function sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    // Typing indicator helper
    function showTypingIndicator(name = 'Bot') {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-typing';

        // Avatar (same structure as bot messages)
        // const avatarDiv = document.createElement('div');
        // avatarDiv.className = 'bot-avatar';
        // avatarDiv.innerHTML = `<img src="static/img/logo.png" alt="Sustainopedia Bot"><span class="bot-avatar-label">Bot</span>`;
        // messageDiv.appendChild(avatarDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="typing-dots" aria-label="Bot is typing">
                <span></span><span></span><span></span>
            </div>
            <div class="typing-extra">
                Extracting Life Cycle Inventory sources&hellip;<br>
                <span class="typing-eta">Estimated response time: ${currentMode === 'fast' ? '30 s' : '10-15 mins'}</span>
            </div>
        `;
        messageDiv.appendChild(contentDiv);

        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        return messageDiv;
    }

    function renderLCIAResultsTable(data, container) {
        // ── Column definitions ────────────────────────────────────────────────
        // Set visible: false to hide a column without deleting it.
        // 'key' must match the property name on each process object.
        const LCIA_COLUMNS = [
            { header: 'Process',                       key: 'process',          visible: true  },
            { header: 'Amount & Location',             key: 'amount_location',  visible: true  },
            { header: 'System Boundary',               key: 'system_boundary',  visible: true  },
            { header: 'Matched Activity',              key: 'matched_activity', visible: false },
            { header: 'Unit / Location',               key: 'unit_location',    visible: true  },
            { header: 'Database Version (Act. Code)',  key: 'db_version_code',  visible: true  },
            { header: 'Ref. Product',                  key: 'ref_product',      visible: false },
            { header: 'Mean Impact (kg CO\u2082-Eq)',  key: 'mean_impact',      visible: true  },
            { header: 'SD (kg CO\u2082-Eq)',           key: 'sd',               visible: true  },
            { header: '5/95 Percentile (kg CO\u2082-Eq)', key: 'percentile',   visible: true  },
            { header: 'Notes',                         key: 'notes',            visible: true  },
        ];

        const visibleCols = LCIA_COLUMNS.filter(c => c.visible);

        // ── Wrapper ───────────────────────────────────────────────────────────
        const resultDiv = document.createElement('div');
        resultDiv.className = 'lcia-results';

        // Header info
        const header = document.createElement('h2');
        header.textContent = `LCIA Results \u2014 ${data.product || 'Product'}`;
        header.style.fontSize = '1rem';

        const databasePara = document.createElement('p');
        databasePara.textContent = `Database: ${data.database}`;

        const lcaMethodsPara = document.createElement('p');
        lcaMethodsPara.textContent = `LCA Methods: ${data.lcaMethods}`;

        // ── Table ─────────────────────────────────────────────────────────────
        const table = document.createElement('table');

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        visibleCols.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.header;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        data.processes.forEach((process, index) => {
            const row = document.createElement('tr');
            row.setAttribute('data-index', index);
            visibleCols.forEach(col => {
                const td = document.createElement('td');
                td.textContent = process[col.key] ?? '';
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        // Total impact line
        const totalImpactPara = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = 'Total Estimated Impact: ';
        totalImpactPara.appendChild(strong);
        totalImpactPara.appendChild(document.createTextNode(`${data.totalMeanImpact} kg CO\u2082-Eq`));

        resultDiv.appendChild(header);
        resultDiv.appendChild(databasePara);
        resultDiv.appendChild(lcaMethodsPara);
        resultDiv.appendChild(table);
        resultDiv.appendChild(totalImpactPara);

        container.appendChild(resultDiv);
        container.scrollTop = container.scrollHeight;

        const welcomeMessage = container.querySelector('.welcome-message');
        if (welcomeMessage) welcomeMessage.remove();

        return resultDiv;
    }

    dropdownSettingBtn = document.getElementById('settingsBtn');
    if (dropdownSettingBtn) {
        dropdownSettingBtn.addEventListener('click', () => {
            window.location.href = './settings.html';
        });
    }
});


// });
    
// structured renderer
// function appendStructuredAnswer(type, obj, timestamp = new Date().toISOString()) {
//     const messageDiv = document.createElement('div');
//     messageDiv.className = `message ${type}`;
//     const content = document.createElement('div');
//     content.className = 'message-content';

//     if (obj.summary) {
//         const h = document.createElement('strong');
//         h.textContent = obj.summary;
//         content.appendChild(h);
//         content.appendChild(document.createElement('br'));
//     }
//     if (obj.interpretation) {
//         const p = document.createElement('p');
//         p.textContent = obj.interpretation;
//         content.appendChild(p);
//     }
//     if (Array.isArray(obj.suggestions) && obj.suggestions.length) {
//         const ul = document.createElement('ul');
//         obj.suggestions.forEach(s => {
//             const li = document.createElement('li');
//             li.textContent = s;
//             ul.appendChild(li);
//         });
//         content.appendChild(ul);
//     }
//     if (obj.raw_results) {
//         const pre = document.createElement('pre');
//         pre.textContent = obj.raw_results;
//         content.appendChild(pre);
//     }

//     const time = document.createElement('small');
//     time.className = 'message-time';
//     time.textContent = formatTime(timestamp);

//     messageDiv.appendChild(content);
//     messageDiv.appendChild(time);
//     chatWindow.appendChild(messageDiv);
//     chatWindow.scrollTop = chatWindow.scrollHeight;
// }












    // --- Keep sendQuery function for future backend integration ---
    // // Example: Add this function to send query to backend and display response
    // async function sendQuery() {
    //     const inputBar = document.getElementById('chat-input');
    //     const userQuery = inputBar.value.trim();
    //     if (!userQuery) return;

    //     // Display user query in chat
    //     displayMessage('You', userQuery);

    //     // Send query to backend API
    //     console.log('Sending query to backend:', userQuery);
    //     try {
    //         const response = await fetch('/api/query', {
    //             method: 'POST',
    //             headers: {
    //                 'Content-Type': 'application/json'
    //             },
    //             body: JSON.stringify({ question: userQuery })
    //         });
            
    //         if (!response.ok) throw new Error('Network response was not ok');
    //         console.log('Received Responses...');
    //         const data = await response.json();

    //         // Display LLM response in chat
    //         displayMessage('LLM', data.answer);
    //     } catch (error) {
    //         displayMessage('System', 'Error: ' + error.message);
    //     }

    //     inputBar.value = '';
    // }

    // // Example: Attach sendQuery to your chat input bar (e.g., on button click or Enter key)
    // chatForm.addEventListener('submit', sendQuery);
    // userInput.addEventListener('keydown', function(e) {
    //     if (e.key === 'Enter') sendQuery();
    // });

    // // Helper function to display messages
    // function displayMessage(sender, message) {
    //     const chatBox = document.getElementById('chat-box');
    //     const msgDiv = document.createElement('div');
    //     msgDiv.className = sender === 'You' ? 'user-message' : 'llm-message';
    //     msgDiv.textContent = `${sender}: ${message}`;
    //     chatBox.appendChild(msgDiv);
    // }
//How does coke production contribute to lifecycle greenhouse gas emissions in steelmaking?