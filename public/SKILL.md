 SKILL.md — Sustainopedia Web Frontend (LLM Reference)

> **Purpose:** Authoritative map of the frontend codebase for LLM agents. Read this before editing any file.  
> **Runtime:** Node.js (Express) server at port 3000, serving static files from `public/`. Database: MongoDB via Mongoose. Auth: JWT stored in `localStorage`.  
> **Working directory convention:** all paths are relative to `sustainopedia_web/`.

---

## 1. Repository Layout

```
sustainopedia_web/
├── server.js
├── package.json
├── .env
└── public/
    ├── index.html / script.js / style.css               # Chat
    ├── full_lca.html / full_lca.js / full_lca.css       # Full LCA workspace
    ├── workbench.html / workbench.js / workbench.css    # Workbench (warehouse + construction; result routing)
    ├── past_lca_results.html / past_lca_results_mode.js # Past LCA history + detail workspace view
    ├── records.html / records.js                         # Legacy/alternate LCA record browser
        ├── settings.html / settings.js
    ├── welcome.html / welcome.js
    ├── login.html / login.js / login-style.css

    ├── shared.js / light-dark-mode.js / mobile-check.js
    ├── functions/lcia-utils.js
    ├── js lib/chart.umd.js / js lib/markdown-it.min.js
    └── static/img/*
```

---

## 2. Server — `server.js`

### Configuration
| Item | Default | Source |
|---|---|---|
| Port | 3000 | `process.env.PORT` |
| MongoDB URI | `mongodb://localhost:27017/sustainopedia` | `process.env.MONGODB_URI` |
| JWT Secret | `"NONE"` *(must override in prod)* | `process.env.JWT_SECRET` |
| CORS origin | `https://www.sustainopedia.net` | Hardcoded in `app.use(cors(...))` |
| JSON body limit | 10 MB | `express.json({ limit: '10mb' })` |

### Mongoose Models
```js
User
  username:  String (unique, required)
  email:     String (unique, required)
  password:  String (bcrypt hashed, required)
  createdAt: Date

ChatHistory
  userId:           ObjectId → User
  conversationName: String (required)
  messages: [{
    role:       "user" | "bot"
    content:    String
    lciData:    Mixed   // structured LCIA payload (processed_json)
    queryMeta:  Mixed   // intent_params from backend
    timestamp:  Date
  }]
  createdAt: Date
  updatedAt: Date

LcaRecord                          // Full LCA assessment record
  userId:     ObjectId → User
  form:       FormInputs (embedded, see schema below)
  result:     Mixed   // normalised answer_pack
  createdAt:  Date
  updatedAt:  Date

LcaResultChatMessage               // Per-record follow-up chat
  recordId:  ObjectId → LcaRecord
  userId:    ObjectId → User
  role:      "user" | "bot"
  content:   String
  timestamp: Date

WarehouseProcess                   // Workbench process warehouse
  userId, processName, processId (user+processId unique), region,
  providerName, unit, category, uuid, description, createdAt

ValueChain                         // Workbench construction draft
  userId, chainName, productName, functionalUnit,
  systemBoundary, notes, nodes[], createdAt

WorkbenchHistory                   // Workbench run history
  userId, chainName, productName, functionalUnit,
  systemBoundary, notes, nodes[], results, runAt
```

#### `FormInputs` Embedded Schema
```js
{
  productDescription, functionalUnitAmount, functionalUnitUnit ("tonne"),
  materials, manufacturingLocation, distribution, lifespan,
  usageRough, endOfLife, systemBoundary ("cradle-to-gate"), comparisonProduct,
  runMc (Boolean), nSimulations (String), furtherNotes,
  unknowns: { q1–q11: Boolean }   // "I don't know" flags per form question
}
```

### Middleware
```js
verifyToken(req, res, next)
  // JWT auth middleware. Reads Bearer token from Authorization header.
  // Attaches req.userId on success. Returns 403 on invalid/expired token.
  // Required by all /api/chat-histories and /api/lca-records routes.
```

### API Routes

#### Authentication
| Method | Path | Body / Params | Returns |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{username, email, password}` | `{token, userId, username, email}` |
| `POST` | `/api/auth/login` | `{username, password}` | `{token, userId, username, email}` |

**Auth notes:** Passwords are hashed with `bcrypt` (10 salt rounds) before storage. JWT expiry is 7 days.

#### Chat History (requires JWT)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/chat-histories` | Get all conversations for current user |
| `POST` | `/api/chat-histories` | Create new conversation. Body: `{conversationName}` |
| `PUT` | `/api/chat-histories/:id` | Replace entire conversation doc. Body: full ChatHistory object |
| `PATCH` | `/api/chat-histories/:id` | Partial update (e.g., rename). Body: partial fields |
| `DELETE` | `/api/chat-histories/:id` | Delete one conversation |
| `DELETE` | `/api/chat-histories` | Delete **all** conversations for current user |

#### LCA Records (requires JWT)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/lca-records` | Get all LCA assessment records for current user |
| `POST` | `/api/lca-records` | Save a new LCA record. Body: `{form, result}` |
| `DELETE` | `/api/lca-records/:id` | Delete one record |
| `DELETE` | `/api/lca-records` | Delete **all** records for current user |

#### LCA Results Chat (requires JWT)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/lca-results-chat/:recordId` | Load follow-up chat history for one LCA record |
| `POST` | `/api/lca-results-chat/:recordId` | Append a message. Body: `{role, content}` |

#### Workbench APIs (requires JWT)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workbench/processes` | Search/list warehouse processes (global pool; supports `q`, `limit`) |
| `GET` | `/api/workbench/processes/preview` | Default preview (sampled by featured regions) |
| `POST` | `/api/workbench/processes` | Create one warehouse process |
| `POST` | `/api/workbench/processes/batch` | Batch create (used by EcoInvent import) |
| `DELETE` | `/api/workbench/processes/:id` | Delete one owned process |
| `DELETE` | `/api/workbench/processes` | Delete all owned processes |
| `POST` | `/api/workbench/chains` | Save value-chain draft |
| `GET` | `/api/workbench/history` | List run history |
| `GET` | `/api/workbench/history/:id` | Fetch one run record |
| `POST` | `/api/workbench/history` | Save run result record |
| `DELETE` | `/api/workbench/history/:id` | Delete run record |

#### Utility
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/config.js` | Injects `window.FLASK_BASE` for browser clients |


### Static File Serving
- `GET /` → `public/welcome.html`
- `app.use(express.static(...))` serves everything in `public/` by filename.
- Named routes include `/index.html`, `/full_lca.html`, `/workbench.html`, `/past_lca_results.html`, `/settings.html`, `/records.html`, etc.
- Page access control is mainly client-side (`checkAuth()` in `shared.js`); API access is server-protected via `verifyToken`.



---

## 3. Shared Utilities — `public/shared.js`

Loaded on every authenticated page **before** page-specific scripts. Provides globals.

```js
function _jwtExpired(token): boolean
  // Decode JWT payload (client-side only, no signature verify).
  // Returns true if exp field is in the past or token is malformed.

function checkAuth(): boolean
  // Reads token + username from localStorage.
  // Redirects to /welcome.html if missing or expired.
  // Must be called at the top of every authenticated page's DOMContentLoaded.

async function apiReq(method: string, url: string, body?: any): Promise<any>
  // Authenticated fetch wrapper. Attaches Authorization: Bearer <token> header.
  // Redirects to /welcome.html on 401.
  // Returns parsed JSON response.
```

**localStorage keys set by auth flow:**
| Key | Value |
|---|---|
| `token` | JWT string |
| `userId` | MongoDB ObjectId string |
| `username` | display username |
| `email` | user email |

---

## 4. Chat Page — `public/script.js`

`index.html` chat client with MongoDB-backed conversation history.

Core flow:
1. Load conversations from `GET /api/chat-histories`.
2. User submit → `POST {FLASK_BASE}/api/jobs`.
3. Poll `GET {FLASK_BASE}/api/jobs/:jobId` every 2.5s.
4. Persist user/bot messages via `PUT /api/chat-histories/:id`.

Important state:
- `conversations`, `activeConvId`
- polling state (`_pollTimer`, `_activeJobId`)
- mode selector (`currentMode`: `fast` / `thinking`)
- markdown renderer (`markdown-it`)

Resilience:
- pending jobs are stored in `sessionStorage.pendingJob` and resumed on reload.
- repeated network failures stop polling gracefully.

---


## 5. Full LCA Workspace — `public/full_lca.js`

`full_lca.html` is the detailed assessment workbench.

Primary responsibilities:
- manage draft/active records in local state + localStorage
- read/validate multi-question form inputs
- submit full jobs to Flask (`mode: "full_lca"`) and poll until complete
- normalize backend `answer_pack` into the frontend record shape
- persist completed runs to `/api/lca-records`
- render charts/tables and support export
- provide per-record follow-up chat via `/api/lca-results-chat/:recordId`

Key invariants:
- Form-to-backend query format (`buildStructuredLcaQuery`) must stay aligned with backend parser.
- Chart instances must be destroyed before re-rendering same canvas.
- Run lifecycle states: `DRAFT → PENDING/RUNNING → DONE | ERROR | CANCELLED`.

---


## 6. Workbench Page — `public/workbench.html`, `public/workbench.js`, `public/workbench.css`


`workbench.html` currently exposes **2 active subtabs + 1 disabled placeholder**:
1. **Process Warehouse** — search/create/import process cards.
2. **Construction** — build value-chain steps and submit a run.
3. **Coming Soon** — disabled placeholder tab (non-interactive).

### `workbench.js` (runtime behavior)
- Boot flow: `checkAuth()` → initialize subtabs, warehouse, construction, modals.
- State object: `WB = { activeTab, warehouse, construction }`.
- Warehouse:
  - Default preview: `GET /api/workbench/processes/preview`
  - Search: `GET /api/workbench/processes?q=...`
  - Create modal submit: `POST /api/workbench/processes`
  - Optional bulk import helper: `POST /api/workbench/processes/batch`
- Construction:
  - Node builder with autocomplete search (`limit=8`)
  - Stores selected process metadata per node (`processId`, `processName`, `region`, `providerName`)
  - Activity names are title-cased in both chain node cards and autocomplete dropdowns.
  - Monte Carlo handling: when `Run Monte Carlo = No`, payload sends `nSimulations = '0'`; when `Yes`, defaults to `'25'` if empty.
  - Submit flow:
    1. saves chain draft via `POST /api/workbench/chains`
    2. starts Flask job `POST {FLASK_BASE}/api/jobs` with `{ mode: 'workbench_lca', workbench_payload }`
    3. polls logs/status from `GET {FLASK_BASE}/api/jobs/:jobId`
    4. persists output to both:
       - `POST /api/lca-records` (with `source: 'workbench'`)
       - `POST /api/workbench/history`
    5. routes to `/past_lca_results.html?recordId=<id>&from=workbench`

### Legacy history functions in `workbench.js`
- `workbench.js` still contains `_renderHistory`, `_openHistDetail`, and related history/detail UI code.
- These paths are currently **not wired to active tabs in `workbench.html`** and are effectively dormant.
- Treat as legacy cleanup candidates unless reactivated intentionally.

### `workbench.css` (styling scope)
- Depends on global design tokens from `style.css` (`:root` variables).
- Defines shells for:
  - topbar/subtabs (`.wb-topbar`, `.wb-subtab`)
  - warehouse cards (`.wh-*`)
  - construction chain & node UI (`.con-*`)
  - history/detail styles (`.hist-*`, currently mostly legacy)
  - modals/toast (`.wb-modal-*`, `.wb-toast`)
- Includes responsive rules for ≤700px.

---

## 7. Past LCA Results Page — `public/past_lca_results.html`, `public/past_lca_results_mode.js`


Past results UX is rendered by `full_lca.js` on this page, with mode-specific behavior from `past_lca_results_mode.js`.

- History list cards are **row/text style** (`record-card--row`) without preview chart thumbnails.
- Row interaction model:
  - click row → open result detail workspace
  - actions show date/time + delete
  - no row-level "View Details" or "Download CSV" buttons
- Source badges:
  - `workbench` records: `WORKBENCH` (`.hist-source-badge--workbench`)
  - non-workbench records: `FULL LCA PROCESS` (`.hist-source-badge--full-lca`)
- Deep link support:
  - if `?recordId=<id>` is present, page auto-opens that record in detail view after history load
  - URL is cleaned with `history.replaceState` after opening
- Draft cards on this page redirect to editable form route: `/full_lca.html?draftId=<id>`.

---

## 8. Records Page — `public/records.js`


Legacy/alternate read-only view of completed LCA assessments (`records.html`).

```js
async function loadRecordsPage(): Promise<void>
  // GET /api/lca-records → normalise with LciaUtils.normalizeRecord → render cards.

function filterAndRenderRecords(records): void
  // Apply search text + sort order, render filtered record cards.
```

---

## 9. Shared LCIA Utilities — `public/functions/lcia-utils.js`



Exposed as `window.LciaUtils`. Loaded before page-specific scripts. Use `LciaUtils.functionName()`.

```js
LciaUtils.escapeCSV(str): string
  // Wrap strings containing commas/quotes/newlines in double quotes for CSV.

LciaUtils.escapeHtml(text): string
  // Convert text to safe HTML string (uses DOM textContent → innerHTML).

LciaUtils.toNumber(value): number
  // Safe numeric coercion: strips non-numeric chars, returns 0 on failure.

LciaUtils.splitMarkdownRow(row): string[]
  // Split a markdown table row by "|", trim cells, remove leading/trailing empty.

LciaUtils.extractMarkdownTable(md): string | null
  // Extract first pipe-table block from mixed markdown text. Returns null if none.

LciaUtils.parseMarkdownTable(md): HTMLTableElement | null
  // Parse a markdown pipe-table string into a DOM <table> element.
  // Returns null if format is invalid (no separator row).

LciaUtils.parseMarkdownToLciaObject(markdown, productName, fallbackTotal): object | null
  // Convert a markdown LCIA report table to internal LCIA object:
  // { product, processes: [{name, mean_impact, sd, p5, p95, unit, location}], totalMeanImpact }
  // Returns null if no valid table found.

LciaUtils.normalizeLciaPayload(payload, answerText, productName): object | null
  // Normalise Flask answer_pack.processed_json into internal LCIA object.
  // Handles both structured object format (Array.isArray(payload.processes))
  // and legacy markdown string format.

LciaUtils.normalizeRecord(record): object | null
  // Normalise a stored LCA record from backend/localStorage.
  // Handles old format (data is markdown string) and new format (data is object).
  // Returns null if the record cannot be normalised — always .filter(Boolean) after mapping.
```

---

## 10. Legacy localStorage Helpers — `public/functions/local storage.js`



Global functions (no namespace). Used only for legacy chat history persistence.

```js
function saveChatHistory(history): void   // localStorage.setItem('chatHistory', ...)
function loadChatHistory(): object        // Returns {} if not found
function addMessage(header, message): void // Append message to a conversation header
```

---

## 11. Auth Flow (Client-Side)



```
1. User visits welcome.html → clicks Login/Register → login.html
2. login.js: POST /api/auth/login → stores {token, userId, username, email} in localStorage
3. Redirect to index.html
4. shared.js checkAuth() on every page load:
   - Checks localStorage.token and localStorage.username exist
   - Calls _jwtExpired(token) — client-side expiry check only
   - Redirects to /welcome.html if auth fails
5. apiReq() attaches Bearer token to all /api/* requests
6. Server verifyToken middleware validates JWT signature on every protected route
7. Logout: clears localStorage keys → redirects to /welcome.html
```

---

## 12. Flask Integration (Frontend ↔ Backend)



### Backend URL Injection
`server.js` serves `/config.js` which sets `window.FLASK_BASE` from `process.env.FLASK_BASE`. All pages use this global before falling back to `'http://localhost:5052'`.

### Full LCA Job Flow
```
1. full_lca.js buildStructuredLcaQuery(form) → multiline "Key: Value" string
2. POST {FLASK_BASE}/api/jobs {mode:"full_lca", question: queryString, product: str}
3. Flask returns {jobId} (202)
4. full_lca.js _startLcaPolling(jobId, ...) → polls every 3000ms
5. GET {FLASK_BASE}/api/jobs/:jobId → {status, logs[], answer_pack?}
6. Logs rendered via appendLog() in real time
7. On status="done": normalizeAnswerPackToResult(answer_pack, form) → save record
```

### Workbench Job Flow
```
1. workbench.js builds value-chain payload from Construction form + nodes
2. POST {FLASK_BASE}/api/jobs {mode:"workbench_lca", workbench_payload: payload}
3. Poll GET {FLASK_BASE}/api/jobs/:jobId for logs/status
4. On done: normalize answer_pack to LCIA object
5. Persist to:
   - /api/lca-records (source="workbench")
   - /api/workbench/history (includes lcaRecordId linkage)
6. Redirect to /past_lca_results.html?recordId=<savedRecordId>&from=workbench
```

### `answer_pack` → `record.result` Mapping

| `answer_pack` field | `record.result` field | Notes |
|---|---|---|
| `answer` | `answer` | Markdown narrative string |
| `markdown` | `markdown` | `{<product>: "markdown report"}` |
| `processed_json` | `data` (via `LciaUtils.normalizeLciaPayload`) | Structured LCIA object |
| `lcia_table` | `lcia_table` | Markdown table string (fallback if processed_json absent) |
| `intent_params` | `intentParams` | `{intent, product}` |

### Results Follow-Up Chat
- Uses `/api/chat-histories` is **not** used for results chat.
- Uses the dedicated `/api/lca-results-chat/:recordId` routes instead.
- Messages are sent to Flask via `_startPolling` in `initResultsChat`, using `currentMode = 'fast'` (no BW2 re-run).
- Context is injected via `buildLcaContextText(record)` prepended to the user query.

---

## 13. Key Conventions & Invariants



### LocalStorage Keys (Full LCA)
| Key | Type | Contents |
|---|---|---|
| `lca_assessments_v2` | JSON array | All draft + completed LCA records |
| `token` | string | JWT for API auth |
| `userId` | string | MongoDB ObjectId |
| `username` | string | Display name |
| `email` | string | User email |

### Record Status Lifecycle
```
DRAFT → (submit) → PENDING → RUNNING → DONE
                                     ↘ ERROR
                    ↓ cancel          ↘ CANCELLED
```

### Chart Management
Both `script.js` and `full_lca.js` keep a `const charts = {}` registry. Always call `charts[id].destroy(); delete charts[id]` before creating a new chart on the same canvas ID to prevent memory leaks.

### Form String Format (backend boundary)
`buildStructuredLcaQuery(form)` produces the exact multiline format consumed by `non_RAG_methods.input_q_to_json()` on the Python backend:
```
Product Description: copper cathode
Functional Unit Amount: 10
Functional Unit Unit: tonne
...
```
Do **not** change this format without updating `input_q_to_json` in the backend.

### Markdown Rendering
Pages load `js lib/markdown-it.min.js` locally. The `md` instance is created as `markdownit()` with default settings. Do not add external CDN references — all libraries are bundled.

### Navigation Order Convention
Left navigation is standardized across authenticated pages as:
1. Chat
2. Full LCA Report
3. Workbench
4. Past LCA Results
5. Settings

### Security Notes
- JWT signature is verified **server-side only** (`verifyToken` in `server.js`). Client-side `_jwtExpired` is a UX convenience only.
- `helmet()` is applied with custom CSP. When adding new external resources, update the `contentSecurityPolicy` directives in `server.js`.
- All API routes that modify user data require `verifyToken` middleware. Never add write endpoints without it.

