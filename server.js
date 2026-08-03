// Frontend and Authentication Server
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const net = require('net');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);
// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sustainopedia';
const JWT_SECRET = process.env.JWT_SECRET || 'NONE';

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Chat History Schema
const chatHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationName: { type: String, required: true },
    messages: [{
        role: { type: String, enum: ['user', 'bot'] },
        content: String,
        lciData: mongoose.Schema.Types.Mixed,
        queryMeta: mongoose.Schema.Types.Mixed,  // intent classification params for analytics
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

// LCA Assessment Form Inputs Schema
const formInputsSchema = new mongoose.Schema({
    productDescription:    { type: String, default: '' },
    functionalUnitAmount:  { type: String, default: '' },
    functionalUnitUnit:    { type: String, default: 'tonne' },
    materials:             { type: String, default: '' },
    manufacturingLocation: { type: String, default: '' },
    distribution:          { type: String, default: '' },
    lifespan:              { type: String, default: '' },
    usageRough:            { type: String, default: '' },
    endOfLife:             { type: String, default: '' },
    systemBoundary:        { type: String, default: 'cradle-to-gate' },
    comparisonProduct:     { type: String, default: '' },
    runMc:                 { type: Boolean, default: false },
    nSimulations:          { type: String, default: '' },
    furtherNotes:          { type: String, default: '' },
    unknowns: {
        q1:  { type: Boolean, default: false },
        q2:  { type: Boolean, default: false },
        q3:  { type: Boolean, default: false },
        q4:  { type: Boolean, default: false },
        q5:  { type: Boolean, default: false },
        q6:  { type: Boolean, default: false },
        q7:  { type: Boolean, default: false },
        q8:  { type: Boolean, default: false },
        q9:  { type: Boolean, default: false },
        q10: { type: Boolean, default: false },
        q11: { type: Boolean, default: false }
    },
    options: {
        regionMode: { type: String, default: 'region' }
    }
}, { _id: false });

// LCA Records Schema
const lcaRecordSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product:       { type: String, required: true },
    form:          { type: formInputsSchema, default: () => ({}) },  // user form inputs
    data:          mongoose.Schema.Types.Mixed,                      // structured LCIA payload
    carbonEmission:{ type: Number, required: true },
    query:         { type: String, default: '' },
    answerText:    { type: String, default: '' },
    timestamp:     { type: Date, default: Date.now }
});

const LCARecord = mongoose.model('LCARecord', lcaRecordSchema);

// LCA Results Chat Schema (separate collection from main Chat tab — keyed by LCA record ID)
const lcaResultsChatSchema = new mongoose.Schema({
    recordId: { type: String, required: true, index: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:     { type: String, enum: ['user', 'bot'], required: true },
    content:  { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const LcaResultsChat = mongoose.model('LcaResultsChat', lcaResultsChatSchema);

// ── Security / visitor event log ─────────────────────────────────────────────
const securityEventSchema = new mongoose.Schema({
    type:       { type: String, required: true },   // page_visit | login_success | login_failure | register_success | register_failure | auth_failure | rate_limited
    ip:         { type: String, default: '' },
    userAgent:  { type: String, default: '' },
    method:     { type: String, default: '' },
    path:       { type: String, default: '' },
    statusCode: { type: Number, default: 0 },
    userId:     { type: String, default: null },
    username:   { type: String, default: null },
    detail:     { type: String, default: '' },
    timestamp:  { type: Date, default: Date.now },
});
// Auto-purge events older than 90 days so the collection never grows unbounded
securityEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7_776_000 });
const SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);

// ── Workbench: Process Warehouse Schema ──────────────────────────────────────
const warehouseProcessSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    processName:   { type: String, required: true },
    region:        { type: String, default: '' },
    processId:     { type: String, required: true },
    providerName:  { type: String, default: '' },
    unit:          { type: String, default: '' },
    category:      { type: String, default: 'General' },
    uuid:          { type: String, default: '' },     // assigned by add_uuid.py
    description:   { type: String, default: '' },
    createdAt:     { type: Date, default: Date.now }
});
warehouseProcessSchema.index({ userId: 1, processId: 1 }, { unique: true });
const WarehouseProcess = mongoose.model('WarehouseProcess', warehouseProcessSchema);

// ── Workbench: Value Chain (Construction) Schema ─────────────────────────────
const valueChainSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chainName:     { type: String, required: true },
    productName:   { type: String, default: '' },
    functionalUnit:{ type: String, default: '' },
    systemBoundary:{ type: String, default: 'cradle-to-gate' },
    notes:         { type: String, default: '' },
    nodes: [{
        order:       { type: Number },
        processId:   { type: String },
        processName: { type: String },
        region:      { type: String },
        providerName:{ type: String }
    }],
    createdAt:     { type: Date, default: Date.now }
});
const ValueChain = mongoose.model('ValueChain', valueChainSchema);

// ── Workbench: Calculation History Schema ────────────────────────────────────
const workbenchHistorySchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chainName:     { type: String, required: true },
    productName:   { type: String, default: '' },
    functionalUnit:{ type: String, default: '' },
    systemBoundary:{ type: String, default: 'cradle-to-gate' },
    notes:         { type: String, default: '' },
    nodes: [{
        order:       { type: Number },
        processId:   { type: String },
        processName: { type: String },
        region:      { type: String },
        providerName:{ type: String }
    }],
    results:       { type: mongoose.Schema.Types.Mixed, default: null }, // placeholder for calculation output
    runAt:         { type: Date, default: Date.now }
});
const WorkbenchHistory = mongoose.model('WorkbenchHistory', workbenchHistorySchema);

// Derive backend origin from env var — used in both CSP and /config.js
const _backendUri = process.env.BACKEND_URI || 'http://localhost:5052';

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", _backendUri],
            scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
            styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        }
    }
}));

// Trust the first reverse-proxy (Azure App Service / nginx) so req.ip returns the real client IP
app.set('trust proxy', 1);

app.use(cors({ origin: 'https://www.sustainopedia.net' }));
app.use(express.json({ limit: '10mb' }));

// ── Security helpers ─────────────────────────────────────────────────────────
function _normalizeIp(rawIp) {
    if (typeof rawIp !== 'string') return '';
    let ip = rawIp.trim();

    if (!ip) {
        return '';
    }

    if (ip.startsWith('[')) {
        const closing = ip.indexOf(']');
        if (closing !== -1) {
            ip = ip.slice(1, closing);
        }
    }

    const zoneIndex = ip.indexOf('%');
    if (zoneIndex !== -1) {
        ip = ip.slice(0, zoneIndex);
    }

    const portOffset = ip.lastIndexOf(':');
    if (portOffset !== -1 && /^\d+$/.test(ip.slice(portOffset + 1))) {
        const candidate = ip.slice(0, portOffset);
        if (net.isIP(candidate)) {
            ip = candidate;
        }
    }

    return net.isIP(ip) ? ip : '';
}

function _clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || '';
}

function _rateLimitKey(req) {
    const rawIp = _clientIp(req) || req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '';
    const normalized = _normalizeIp(rawIp);
    if (normalized) {
        return normalized;
    }
    return `unknown-${req.method}-${req.path}`;
}

function logSecurityEvent(type, req, extra = {}) {
    const doc = new SecurityEvent({
        type,
        ip:         _clientIp(req),
        userAgent:  (req.headers['user-agent'] || '').slice(0, 512),
        method:     req.method || '',
        path:       req.path  || '',
        statusCode: extra.statusCode || 0,
        userId:     extra.userId   || null,
        username:   extra.username || null,
        detail:     (extra.detail  || '').slice(0, 512),
    });
    doc.save().catch(() => {}); // fire-and-forget — never blocks the response
}

// ── Rate limiter — auth endpoints (20 attempts / 15 min per IP) ───────────────
const authRateLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             20,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator: _rateLimitKey,
    handler: (req, res) => {
        logSecurityEvent('rate_limited', req, {
            statusCode: 429,
            detail: `Rate limit exceeded on ${req.path}`,
        });
        res.status(429).json({ message: 'Too many requests — please try again in 15 minutes.' });
    },
});
app.use('/api/auth', authRateLimiter);

// ── Visitor logger — HTML page requests only ──────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
        res.on('finish', () => {
            logSecurityEvent('page_visit', req, { statusCode: res.statusCode });
        });
    }
    next();
});

// Serve backend URL as a browser-safe config script (must be before express.static)
app.get('/config.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`window.FLASK_BASE = ${JSON.stringify(_backendUri)};`);
});

// Root route: always serve welcome page first.
// welcome.js will immediately redirect to /index.html if the user already has a valid token.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));

app.use(express.static(path.join(__dirname, 'public')));

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        logSecurityEvent('auth_failure', req, { statusCode: 401, detail: 'No token provided' });
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        logSecurityEvent('auth_failure', req, { statusCode: 401, detail: `Invalid token: ${error.message}` });
        res.status(401).json({ message: 'Invalid token' });
    }
}

// ============ Authentication Endpoints ============

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            logSecurityEvent('register_failure', req, { statusCode: 400, username, detail: 'Username or email already exists' });
            return res.status(400).json({ message: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            username,
            email,
            password: hashedPassword
        });

        await user.save();

        // Generate token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

        logSecurityEvent('register_success', req, { statusCode: 201, userId: String(user._id), username: user.username });
        res.status(201).json({
            message: 'User registered successfully',
            token,
            userId: user._id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            logSecurityEvent('login_failure', req, { statusCode: 401, username, detail: 'User not found' });
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            logSecurityEvent('login_failure', req, { statusCode: 401, username: user.username, detail: 'Wrong password' });
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Generate token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

        logSecurityEvent('login_success', req, { statusCode: 200, userId: String(user._id), username: user.username });
        res.json({
            message: 'Login successful',
            token,
            userId: user._id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

// ============ Chat History Endpoints ============

// Get all chat histories for a user
app.get('/api/chat-histories', verifyToken, async (req, res) => {
    try {
        const histories = await ChatHistory.find({ userId: req.userId }).sort({ updatedAt: -1 });
        res.json(histories);
    } catch (error) {
        console.error('Error fetching chat histories:', error);
        res.status(500).json({ message: 'Error fetching chat histories' });
    }
});

// Create a new conversation (or return existing if name already exists)
app.post('/api/chat-histories', verifyToken, async (req, res) => {
    try {
        const { conversationName } = req.body;
        let history = await ChatHistory.findOne({ userId: req.userId, conversationName });
        if (!history) {
            history = new ChatHistory({ userId: req.userId, conversationName, messages: [] });
            await history.save();
        }
        res.status(201).json({ message: 'Conversation created', history });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ message: 'Error creating conversation' });
    }
});

// Append a single message to an existing conversation
app.put('/api/chat-histories/:id', verifyToken, async (req, res) => {
    try {
        const { role, content, lciData, queryMeta, timestamp } = req.body;
        const history = await ChatHistory.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { $push: { messages: { role, content, lciData, queryMeta, timestamp } }, $set: { updatedAt: new Date() } },
            { new: true }
        );
        if (!history) return res.status(404).json({ message: 'Conversation not found' });
        res.json({ message: 'Message appended' });
    } catch (error) {
        console.error('Error appending message:', error);
        res.status(500).json({ message: 'Error appending message' });
    }
});

// Rename a conversation (update conversationName only)
app.patch('/api/chat-histories/:id', verifyToken, async (req, res) => {
    try {
        const { conversationName } = req.body;
        if (!conversationName || typeof conversationName !== 'string') {
            return res.status(400).json({ message: 'conversationName is required' });
        }
        const history = await ChatHistory.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { $set: { conversationName: conversationName.trim(), updatedAt: new Date() } },
            { new: true }
        );
        if (!history) return res.status(404).json({ message: 'Conversation not found' });
        res.json({ message: 'Conversation renamed', history });
    } catch (error) {
        console.error('Error renaming conversation:', error);
        res.status(500).json({ message: 'Error renaming conversation' });
    }
});

// Delete a single conversation
app.delete('/api/chat-histories/:id', verifyToken, async (req, res) => {
    try {
        const history = await ChatHistory.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!history) return res.status(404).json({ message: 'Conversation not found' });
        res.json({ message: 'Conversation deleted' });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({ message: 'Error deleting conversation' });
    }
});

// Delete ALL conversations for the authenticated user
app.delete('/api/chat-histories', verifyToken, async (req, res) => {
    try {
        await ChatHistory.deleteMany({ userId: req.userId });
        res.json({ message: 'All conversations deleted' });
    } catch (error) {
        console.error('Error deleting all conversations:', error);
        res.status(500).json({ message: 'Error deleting all conversations' });
    }
});

// ============ LCA Records Endpoints ============

// Get all LCA records for a user
app.get('/api/lca-records', verifyToken, async (req, res) => {
    try {
        const records = await LCARecord.find({ userId: req.userId }).sort({ timestamp: -1 });
        res.json(records.map(r => ({
            id:             r._id,
            _id:            r._id,
            product:        r.product,
            form:           r.form,
            data:           r.data,
            carbonEmission: r.carbonEmission,
            query:          r.query,
            answerText:     r.answerText,
            timestamp:      r.timestamp
        })));
    } catch (error) {
        console.error('Error fetching LCA records:', error);
        res.status(500).json({ message: 'Error fetching LCA records' });
    }
});

// Save LCA record
app.post('/api/lca-records', verifyToken, async (req, res) => {
    try {
        const { product, form, data, carbonEmission, query, answerText } = req.body;

        const record = new LCARecord({
            userId:         req.userId,
            product,
            form:           form        || {},
            data,
            carbonEmission,
            query:          query       || '',
            answerText:     answerText  || ''
        });

        await record.save();
        res.status(201).json({ message: 'LCA record saved', id: record._id });
    } catch (error) {
        console.error('Error saving LCA record:', error);
        res.status(500).json({ message: 'Error saving LCA record' });
    }
});

// Delete a single LCA record (cascade delete its results chat)
app.delete('/api/lca-records/:id', verifyToken, async (req, res) => {
    try {
        const record = await LCARecord.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!record) return res.status(404).json({ message: 'Record not found' });
        await LcaResultsChat.deleteMany({ recordId: req.params.id, userId: req.userId });
        res.json({ message: 'LCA record deleted' });
    } catch (error) {
        console.error('Error deleting LCA record:', error);
        res.status(500).json({ message: 'Error deleting LCA record' });
    }
});

// Delete ALL LCA records for the authenticated user (cascade delete results chat)
app.delete('/api/lca-records', verifyToken, async (req, res) => {
    try {
        await LCARecord.deleteMany({ userId: req.userId });
        await LcaResultsChat.deleteMany({ userId: req.userId });
        res.json({ message: 'All LCA records deleted' });
    } catch (error) {
        console.error('Error deleting all LCA records:', error);
        res.status(500).json({ message: 'Error deleting all LCA records' });
    }
});

// ============ LCA Results Chat (per-record, separate from main Chat tab) ============

// Get all chat messages for a specific LCA record
app.get('/api/lca-results-chat/:recordId', verifyToken, async (req, res) => {
    try {
        const messages = await LcaResultsChat.find({
            recordId: req.params.recordId,
            userId:   req.userId
        }).sort({ timestamp: 1 });
        res.json(messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })));
    } catch (error) {
        console.error('Error fetching LCA results chat:', error);
        res.status(500).json({ message: 'Error fetching chat messages' });
    }
});

// Append a single message to the results chat for a specific LCA record
app.post('/api/lca-results-chat/:recordId', verifyToken, async (req, res) => {
    try {
        const { role, content } = req.body;
        if (!['user', 'bot'].includes(role) || !content) {
            return res.status(400).json({ message: 'role (user|bot) and content are required' });
        }
        const msg = new LcaResultsChat({
            recordId: req.params.recordId,
            userId:   req.userId,
            role,
            content
        });
        await msg.save();
        res.status(201).json({ message: 'Message saved' });
    } catch (error) {
        console.error('Error saving LCA results chat message:', error);
        res.status(500).json({ message: 'Error saving chat message' });
    }
});

// ============ Workbench – Process Warehouse Endpoints ============

// Search / list all processes — no userId filter, visible to every logged-in user
app.get('/api/workbench/processes', verifyToken, async (req, res) => {
    try {
        const q     = (req.query.q     || '').trim();
        const limit = parseInt(req.query.limit) || 0;   // 0 = no limit
        const filter = {};  // global: not scoped to the requesting user
        if (q) {
            const re = new RegExp(q, 'i');
            filter.$or = [
                { processName: re },
                { providerName: re },
                { processId: re },
                { region: re },
                { category: re },
                { unit: re }
            ];
        }
        let query = WarehouseProcess.find(filter).sort({ createdAt: -1 });
        if (limit > 0) query = query.limit(limit);
        const processes = await query;
        res.json(processes);
    } catch (err) {
        console.error('Error fetching warehouse processes:', err);
        res.status(500).json({ message: 'Error fetching processes' });
    }
});

// Top 10 featured regions shown by default on the warehouse page
const PREVIEW_REGIONS = ['GLO', 'RoW', 'CN', 'US', 'RER', 'DE', 'CH', 'FR', 'GB', 'JP'];

// Preview: 20 random processes per featured region — global, not user-scoped
app.get('/api/workbench/processes/preview', verifyToken, async (req, res) => {
    try {
        const results = await Promise.all(
            PREVIEW_REGIONS.map(region =>
                WarehouseProcess.aggregate([
                    { $match: { region } },   // no userId filter
                    { $sample: { size: 20 } }
                ])
            )
        );
        // Flatten; empty regions produce [] and are automatically excluded
        res.json(results.flat());
    } catch (err) {
        console.error('Error fetching preview:', err);
        res.status(500).json({ message: 'Error fetching preview' });
    }
});

// Create a new process in the warehouse
app.post('/api/workbench/processes', verifyToken, async (req, res) => {
    try {
        const { processName, region, processId, providerName, unit, category, description } = req.body;
        if (!processName || !processId) {
            return res.status(400).json({ message: 'processName and processId are required' });
        }
        const proc = new WarehouseProcess({
            userId: req.userId,
            processName: processName.trim(),
            region: (region || '').trim(),
            processId: processId.trim(),
            providerName: (providerName || '').trim(),
            unit: (unit || '').trim(),
            category: (category || 'General').trim(),
            description: (description || '').trim()
        });
        await proc.save();
        res.status(201).json({ message: 'Process created', process: proc });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ message: 'A process with this ID already exists' });
        console.error('Error creating process:', err);
        res.status(500).json({ message: 'Error creating process' });
    }
});

// Batch-insert processes (used by the EcoInvent bulk import)
app.post('/api/workbench/processes/batch', verifyToken, async (req, res) => {
    try {
        const { processes } = req.body;
        if (!Array.isArray(processes) || !processes.length) {
            return res.status(400).json({ message: 'processes array is required' });
        }
        const docs = processes
            .filter(p => p.processName && p.processId)
            .map(p => ({
                userId:      req.userId,
                processName: p.processName.trim(),
                region:      (p.region || '').trim(),
                processId:   p.processId.trim(),
                providerName:(p.providerName || '').trim(),
                unit:        (p.unit || '').trim(),
                category:    (p.category || 'General').trim(),
                uuid:        (p.uuid || '').trim(),
                description: (p.description || '').trim()
            }));
        let inserted = 0, skipped = 0;
        try {
            const result = await WarehouseProcess.insertMany(docs, { ordered: false });
            inserted = result.length;
        } catch (bulkErr) {
            if (bulkErr.name === 'MongoBulkWriteError') {
                inserted = bulkErr.result ? bulkErr.result.nInserted : 0;
                skipped  = docs.length - inserted;
            } else {
                throw bulkErr;
            }
        }
        res.json({ inserted, skipped });
    } catch (err) {
        console.error('Batch insert error:', err);
        res.status(500).json({ message: 'Batch insert failed' });
    }
});

// Delete ALL processes for the user (bulk clear)
app.delete('/api/workbench/processes', verifyToken, async (req, res) => {
    try {
        const result = await WarehouseProcess.deleteMany({ userId: req.userId });
        res.json({ message: 'All processes deleted', deleted: result.deletedCount });
    } catch (err) {
        console.error('Error deleting all processes:', err);
        res.status(500).json({ message: 'Error deleting all processes' });
    }
});

// Delete a process from the warehouse
app.delete('/api/workbench/processes/:id', verifyToken, async (req, res) => {
    try {
        const proc = await WarehouseProcess.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!proc) return res.status(404).json({ message: 'Process not found' });
        res.json({ message: 'Process deleted' });
    } catch (err) {
        console.error('Error deleting process:', err);
        res.status(500).json({ message: 'Error deleting process' });
    }
});

// ============ Workbench – Value Chain (Construction) Endpoints ============

// Save a value chain draft
app.post('/api/workbench/chains', verifyToken, async (req, res) => {
    try {
        const { chainName, productName, functionalUnit, systemBoundary, notes, nodes } = req.body;
        if (!chainName) return res.status(400).json({ message: 'chainName is required' });
        const chain = new ValueChain({
            userId: req.userId,
            chainName: chainName.trim(),
            productName: (productName || '').trim(),
            functionalUnit: (functionalUnit || '').trim(),
            systemBoundary: systemBoundary || 'cradle-to-gate',
            notes: (notes || '').trim(),
            nodes: Array.isArray(nodes) ? nodes : []
        });
        await chain.save();
        res.status(201).json({ message: 'Value chain saved', chain });
    } catch (err) {
        console.error('Error saving value chain:', err);
        res.status(500).json({ message: 'Error saving value chain' });
    }
});

// ============ Workbench – Calculation History Endpoints ============

// Get all history records for the user
app.get('/api/workbench/history', verifyToken, async (req, res) => {
    try {
        const records = await WorkbenchHistory.find({ userId: req.userId }).sort({ runAt: -1 });
        res.json(records);
    } catch (err) {
        console.error('Error fetching workbench history:', err);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// Get a single history record
app.get('/api/workbench/history/:id', verifyToken, async (req, res) => {
    try {
        const record = await WorkbenchHistory.findOne({ _id: req.params.id, userId: req.userId });
        if (!record) return res.status(404).json({ message: 'Record not found' });
        res.json(record);
    } catch (err) {
        console.error('Error fetching history record:', err);
        res.status(500).json({ message: 'Error fetching record' });
    }
});

// Save a new history record (called after a run)
app.post('/api/workbench/history', verifyToken, async (req, res) => {
    try {
        const { chainName, productName, functionalUnit, systemBoundary, notes, nodes, results } = req.body;
        if (!chainName) return res.status(400).json({ message: 'chainName is required' });
        const record = new WorkbenchHistory({
            userId: req.userId,
            chainName: chainName.trim(),
            productName: (productName || '').trim(),
            functionalUnit: (functionalUnit || '').trim(),
            systemBoundary: systemBoundary || 'cradle-to-gate',
            notes: (notes || '').trim(),
            nodes: Array.isArray(nodes) ? nodes : [],
            results: results || null
        });
        await record.save();
        res.status(201).json({ message: 'History record saved', record });
    } catch (err) {
        console.error('Error saving history record:', err);
        res.status(500).json({ message: 'Error saving history record' });
    }
});

// Delete a history record
app.delete('/api/workbench/history/:id', verifyToken, async (req, res) => {
    try {
        const record = await WorkbenchHistory.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!record) return res.status(404).json({ message: 'Record not found' });
        res.json({ message: 'History record deleted' });
    } catch (err) {
        console.error('Error deleting history record:', err);
        res.status(500).json({ message: 'Error deleting history record' });
    }
});

// ============ Health Check ============

app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// ============ Static Routes ============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.get('/records.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'records.html'));
});

app.get('/settings.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/welcome.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.get('/workbench.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'workbench.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});