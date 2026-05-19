# SKILL.md — Sustainopedia Web Frontend (LLM Reference)

> **Purpose:** Authoritative map of the frontend codebase for LLM agents. Read this before editing any file.  
> **Runtime:** Node.js (Express) server at port 3000, serving static files from `public/`. Database: MongoDB via Mongoose. Auth: JWT stored in `localStorage`.  
> **Working directory convention:** all paths are relative to `sustainopedia_web/`.

---

## 1. Repository Layout

```
sustainopedia_web/
├── server.js                      # Express server — auth + data API + static file serving
├── package.json                   # Dependencies: express, mongoose, bcrypt, jsonwebtoken, helmet, cors
├── .env                           # Secrets (MONGODB_URI, JWT_SECRET, PORT)
│
└── public/                        # All static assets served directly to browser
    ├── welcome.html               # Landing / marketing page (unauthenticated)
    ├── login.html                 # Login + registration page
    ├── index.html                 # Main chat interface (fast query mode)
    ├── full_lca.html              # Full LCA assessment workspace (multi-step form + results)
    ├── records.html               # Historical LCA records browser
    ├── settings.html              # User account settings
    │
    ├── script.js                  # Chat page logic (index.html)
    ├── full_lca.js                # Full LCA workspace logic (full_lca.html)
    ├── records.js                 # Records page logic (records.html)
    ├── settings.js                # Settings page logic (settings.html)
    ├── login.js                   # Login/register logic (login.html)
    ├── welcome.js                 # Welcome page logic (welcome.html)
    ├── shared.js                  # Auth guard + authenticated fetch helper (loaded on every page)
    ├── light-dark-mode.js         # Theme toggle (loaded on every page)
    ├── mobile-check.js            # Mobile device detection + redirect to mobile-unsupported.html
    │
    ├── style.css                  # Chat page styles
    ├── full_lca.css               # Full LCA workspace styles
    ├── login-style.css            # Login page styles
    ├── welcome.css                # Welcome page styles
    ├── mobile-ns.css              # Mobile unsupported page styles
    │
    ├── functions/
    │   ├── lcia-utils.js          # Shared LCIA utilities — exposed as window.LciaUtils
    │   ├── local storage.js       # Legacy localStorage helpers (chat history only)
    │   └── firebase.js            # Firebase Analytics initialisation (unused beyond analytics)
    │
    ├── js lib/
    │   ├── chart.umd.js           # Chart.js v4 bundled (CDN-free)
    │   └── markdown-it.min.js     # markdown-it bundled (CDN-free)
    │
    └── static/img/                # Static images (logo, icons, backgrounds)
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

#### Utility
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check. Returns `{status: "ok"}` |
| `GET` | `/config.js` | Injects `window.FLASK_BASE` from `process.env.FLASK_BASE` into client JS |

### Static File Serving
- `GET /` → `public/welcome.html`
- `app.use(express.static(...))` serves everything in `public/` by filename.
- Named routes (`/index.html`, `/records.html`, etc.) explicitly redirect to auth-gated pages with `verifyToken`-style logic on the client (not server-enforced except for API routes).

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

Corresponds to `index.html`. Connects to Flask backend at `window.FLASK_BASE` (injected by `/config.js`).

### Module-Level State
```js
const FLASK_BASE        // injected via window.FLASK_BASE, fallback 'http://localhost:5052'
const POLL_INTERVAL_MS = 2500
let chatting            // boolean — blocks concurrent submissions
let md                  // markdown-it instance
let conversations       // Array of ChatHistory docs from MongoDB
let activeConvId        // _id of active conversation
let _pollTimer          // setInterval handle
let _activeJobId        // currently tracked Flask job UUID
let currentMode = 'fast'  // 'fast' | 'thinking' (full LCA)
```

### Key Functions
```js
function _stopPolling(): void
  // Clears _pollTimer, nulls _activeJobId, removes pendingJob from sessionStorage.

function _startPolling(jobId, typingEl, extractionTimer, onMessage): void
  // Polls GET /api/jobs/:jobId every POLL_INTERVAL_MS.
  // On done: parses answer_pack, calls onMessage to render bot response.
  // On error or 404: shows error message, re-enables send button.
  // Handles up to 3 consecutive network errors before giving up.
  // onMessage signature: (role: "user-message"|"bot-message", content) → void
```

**Session resume:** On page load, `sessionStorage.getItem('pendingJob')` is checked. If a job UUID is found, polling resumes automatically.

---

## 5. Full LCA Workspace — `public/full_lca.js`

Corresponds to `full_lca.html`. The primary production surface. Manages LCA assessment lifecycle from form → job → results → follow-up chat.

### Module-Level Constants & State
```js
const FLASK_BASE        // window.FLASK_BASE || 'http://localhost:5052'
const POLL_INTERVAL_MS = 3000
const STORAGE_KEY = 'lca_assessments_v2'  // localStorage key for draft records
const STATUS = { DRAFT, PENDING, RUNNING, DONE, ERROR, CANCELLED }
const state = {
  records: [],           // all LCA records (drafts + backend history)
  activeId: null,        // currently open record ID
  lcaPollTimer: null,
  lcaActiveJobId: null,
  resultsChatPollTimer: null
}
```

### State Management
```js
function createBlankRecord(): object
  // Returns a new empty record with generated ID, STATUS.DRAFT, blank form fields.

function createId(): string
  // Generates a random alphanumeric ID string.

function loadState(): void
  // Loads state.records from localStorage (STORAGE_KEY).

function persistState(): void
  // Saves state.records to localStorage (STORAGE_KEY).

function getActiveRecord(): object | null
  // Returns state.records.find(r => r.id === state.activeId).

function saveActiveRecord(): void
  // Reads current form into active record via readForm(), then calls persistState().
```

### Form I/O
```js
function readForm(): object
  // Reads all form inputs from the DOM. Returns FormInputs-shaped object.

function fillForm(form: object): void
  // Populates DOM form fields from a FormInputs object.

function normalizeForm(form: object): object
  // Coerces form fields to correct types (string → number for amounts, etc.).

function setValue(id: string, value: any): void
  // Set value of input/select/textarea by element ID.

function setChecked(id: string, checked: boolean): void
  // Set checked state of checkbox by element ID.

function getGroupActiveValue(groupId: string): string
  // Read active value from a radio-button-style option group.

function setGroupActiveValue(groupId: string, value: string): void
  // Set active button in an option group by matching data-value attribute.

function collectAndSaveForm(): void
  // readForm() → saveActiveRecord() — convenience wrapper.

function validateForm(): boolean
  // Checks required form fields. Calls _markValidationErrors() on failures.
  // Returns true only if all required fields are filled.
```

### Record Rendering
```js
function createLocalDraftCard(record): HTMLElement
  // Build a sidebar card DOM element for a draft record.

function createHistoryCard(record): HTMLElement
  // Build a sidebar card DOM element for a completed backend record.

async function loadBackendHistory(): Promise<void>
  // GET /api/lca-records, normalise with LciaUtils.normalizeRecord,
  // merge with local drafts, render sidebar.

function filterAndRenderHistory(records): void
  // Apply search/sort controls, render filtered list in sidebar.

function openRecord(recordId: string): void
  // Set activeId, fill form from record, switch to workspace panel,
  // render results if available.

function addNewRecord(): void
  // Create blank record, push to state.records, open it.

function setWorkspaceTitle(record): void
  // Update the workspace header title from record.form.productDescription.
```

### Charts
```js
function renderStreamPieChart(canvasId: string, record, isDetail?: boolean): void
  // Pie chart: upstream / downstream / gate-to-gate impact breakdown.
  // Uses CHART_PALETTE. Destroys existing chart on canvasId if present.

function renderPreviewChart(canvasId: string, record): void
  // Horizontal bar chart: top processes by mean impact (sidebar preview).

function renderDetailChart(canvasId: string, record): void
  // Full horizontal bar chart with SD error bars (detail panel).
```

### LCA Job Lifecycle
```js
async function generateResult(e: Event): Promise<void>
  // Main submit handler. Validates form → buildStructuredLcaQuery →
  // POST /api/jobs {mode: "full_lca"} → _startLcaPolling.

function _startLcaPolling(jobId, record, f, question): void
  // Polls Flask GET /api/jobs/:jobId every POLL_INTERVAL_MS.
  // Appends log messages to console via appendLog().
  // On done: calls _onLcaJobDone.

function _stopLcaPolling(): void
  // Clears lcaPollTimer and lcaActiveJobId.

async function _onLcaJobDone(answerPack, record, f, question): Promise<void>
  // Post-job completion: normalizeAnswerPackToResult → save record to backend
  // → update local state → render charts → open results panel.

async function _cancelCurrentJob(jobId: string): Promise<void>
  // DELETE /api/jobs/:jobId → sets record status to CANCELLED.

async function saveDraft(): Promise<void>
  // collectAndSaveForm → POST /api/lca-records with STATUS.DRAFT.
```

### Results Follow-Up Chat
```js
function buildLcaContextText(record): string
  // Serialise record.result into a text string injected as LCA context
  // in the fast-mode chat query (so the LLM knows the current results).

function initResultsChat(record): void
  // Set up the in-panel chat UI, load existing messages, bind send handler.

async function _lcaResultsChatLoad(recordId: string): Promise<void>
  // GET /api/lca-results-chat/:recordId → render messages.

async function _lcaResultsChatSave(recordId, role, content): Promise<void>
  // POST /api/lca-results-chat/:recordId → persist message to backend.
```

### Rendering Utilities
```js
function buildFormInputsSection(form): string
  // Build HTML string showing all form inputs in a structured read-only display.

function buildLciaDetailTable(record): string
  // Build HTML for the per-process LCIA impact table with mass flow columns.

function downloadRecordCSV(record): void
  // Serialise record to CSV and trigger browser download.

function renderConsole(logs: Array): void
  // Re-render the full live log console from a logs array.

function appendLog(message: string, level?: string): void
  // Append a single log line to the live console panel ('', 'warning', 'error').
```

### Data Transformation
```js
function buildStructuredLcaQuery(form): string
  // Converts FormInputs object → multiline "Key: Value" string for Flask backend.
  // This is the format expected by non_RAG_methods.input_q_to_json() on the backend.

function normalizeAnswerPackToResult(answerPack, form): object
  // Converts raw Flask answer_pack → internal record.result shape.
  // Calls LciaUtils.normalizeLciaPayload on processed_json.

function inferProcessStream(processName: string): "upstream"|"downstream"|"gate-to-gate"
  // Client-side heuristic stream classification (mirrors backend _classify_stream).

function formatStructuredValue(raw, fallback?): string
  // Coerce a raw field value to display string. Returns fallback if null/empty.

function toSafeNumber(value, fallback?): number
  // Safe numeric coercion. Returns fallback (default 0) on NaN/null/undefined.

function clampInt(value, fallback, min, max): number
  // Clamp an integer value to [min, max], returning fallback if out of range.
```

### Validation
```js
function syncMonteCarloInputState(): void
  // Show/hide nSimulations input based on runMc checkbox state.

function validateForm(): boolean
  // Returns false and highlights invalid fields if required questions are unanswered.

function _getQuestionCard(qNum: number): HTMLElement | null
  // Find a question card DOM element by question number attribute.

function _markValidationErrors(failingQs: number[]): void
  // Add error styling to specified question cards.

function _refreshValidationErrors(): void
  // Re-run validation and update error states without submitting.

function _setBtnState(btn: HTMLElement, mode: string): void
  // Set button to mode: "idle" | "loading" | "cancelling" | "disabled".
```

---

## 6. Records Page — `public/records.js`

Corresponds to `records.html`. Read-only view of all completed LCA assessments.

```js
async function loadRecordsPage(): Promise<void>
  // GET /api/lca-records → normalise with LciaUtils.normalizeRecord → render cards.

function filterAndRenderRecords(records): void
  // Apply search text + sort order, render filtered record cards.
```

---

## 7. Shared LCIA Utilities — `public/functions/lcia-utils.js`

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

## 8. Legacy localStorage Helpers — `public/functions/local storage.js`

Global functions (no namespace). Used only for legacy chat history persistence.

```js
function saveChatHistory(history): void   // localStorage.setItem('chatHistory', ...)
function loadChatHistory(): object        // Returns {} if not found
function addMessage(header, message): void // Append message to a conversation header
```

---

## 9. Auth Flow (Client-Side)

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

## 10. Flask Integration (Frontend ↔ Backend)

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

## 11. Key Conventions & Invariants

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

### Security Notes
- JWT signature is verified **server-side only** (`verifyToken` in `server.js`). Client-side `_jwtExpired` is a UX convenience only.
- `helmet()` is applied with custom CSP. When adding new external resources, update the `contentSecurityPolicy` directives in `server.js`.
- All API routes that modify user data require `verifyToken` middleware. Never add write endpoints without it.
