// Frontend and Authentication Server
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Derive backend origin from env var — used in both CSP and /config.js
const _backendUri = process.env.BACKEND_URI || 'http://localhost:5052';

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", _backendUri, 'ws://localhost:42877/'],
            scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
            styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        }
    }
}));

app.use(cors({ origin: 'https://www.sustainopedia.net' }));
app.use(express.json({ limit: '10mb' }));

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
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
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
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Generate token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});