# Sustainopedia - Advanced LCA & ESG Platform

> A modern, professional Life Cycle Assessment platform with integrated AI chatbot, secure user authentication, historical analysis tracking, and cloud data storage.

## Overview

Sustainopedia is an enhanced version of the LCA chatbot platform that combines:

- **Secure Authentication**: User login/registration with JWT and bcrypt
- **LCA Chatbot**: AI-powered questions and analysis for life cycle assessments
- **CSV Export**: Download LCA results directly from chat responses
- **Historical Records**: Track all past LCA calculations with interactive visualizations
- **Cloud Storage**: MongoDB integration for persistent data storage
- **Professional UI**: Warm and bright green theme, fully responsive design

## Quick Start

### Prerequisites
- Node.js v14+
- MongoDB Atlas account (free tier)

### Installation

1. **Install dependencies**
```bash
cd RAG-LLM-Web-Platform
npm install
```

2. **Configure MongoDB**
```bash
cp .env.example .env
# Edit .env with your MongoDB credentials
```

3. **Start the server**
```bash
npm start
```

4. **Access the app**
- Open http://localhost:3000
- Register a new account
- Start using the platform!

## What's New

### ✨ New Features

#### 1. CSV Export for LCA Data
- Download LCA analysis results directly from chat responses
- Properly formatted CSV with all process details
- Filename includes product name and timestamp

#### 2. Historical LCA Records Tab
- View all past LCA calculations in one dashboard
- Interactive bar charts with animations
- Filter by product name
- Sort by date, product, or emissions level
- Download/delete individual records

#### 3. Secure User Authentication
- Login and registration system
- JWT-based authentication
- Password hashing with bcrypt
- Persistent user sessions

#### 4. MongoDB Integration
- Cloud-based data storage
- Persistent chat history
- LCA records storage
- Scalable architecture

#### 5. Settings Dashboard
- Account information display
- Export all data as JSON
- Clear local cache
- User profile management

## Key Components

### Frontend Files
- `public/index.html` - Main app interface with tabs
- `public/login.html` - Login/registration page
- `public/script.js` - Main app logic and chat handler
- `public/login.js` - Authentication logic
- `public/records.js` - LCA records dashboard
- `public/style.css` - Main styling
- `public/login-style.css` - Login page styling

### Backend Files
- `server.js` - Express server with API endpoints
- `package.json` - Dependencies and configuration

### Configuration
- `.env` - Environment variables (create from .env.example)
- `.env.example` - Template for environment variables

## Setup Instructions

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your MongoDB credentials:
```
MONGODB_URI=mongodb+srv://admin:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/sustainopedia?retryWrites=true&w=majority
JWT_SECRET=your-secure-random-string
PORT=3000
NODE_ENV=development
```

### Step 3: Start the Server
```bash
npm start
```

Expected output:
```
MongoDB connected
Server running at http://localhost:3000
```

### Step 4: Register and Login
1. Navigate to http://localhost:3000
2. Click "Register here"
3. Fill in username, email, and password
4. Click "Register"
5. You'll be logged in automatically

## Usage

### Chatbot Tab
1. Enter a product name (e.g., "Crude Steel")
2. Ask an LCA-related question
3. Get AI-powered response with detailed analysis
4. **Download CSV** of the LCA results directly

### LCA Records Tab
1. View all historical LCA calculations
2. Search by product name
3. Sort by various criteria
4. View interactive bar charts
5. Download or delete records

### Settings Tab
1. View account information
2. Export all data as JSON
3. Clear local data cache
4. Manage preferences

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - User login

### Chat History
- `GET /api/chat-histories` - Get all conversations
- `POST /api/chat-histories` - Save conversation

### LCA Records
- `GET /api/lca-records` - Get all LCA records
- `POST /api/lca-records` - Save new record
- `DELETE /api/lca-records/:id` - Delete record

### Health
- `GET /api/health` - Server status

## Database

### MongoDB Collections
- `users` - User accounts
- `chathistories` - Chat conversations
- `lcarecords` - LCA calculation records

### Schemas
Each collection has structured schemas stored in MongoDB ensuring data integrity and proper relationships between user and their data.

## Color Theme

Professional warm and bright green palette:
- Primary: #2d6a4f (Deep green)
- Secondary: #40916c (Forest green)
- Tertiary: #8ecaaf (Light green)
- Text: #1b4332 (Dark green)

## Important Notes

⚠️ **Never Commit .env File** - Keep MongoDB credentials secure

✅ **Core LCA Unchanged** - All LCA calculations remain untouched

✅ **Professional Design** - No emojis, corporate-focused UI

✅ **Dual Storage** - LocalStorage for speed, MongoDB for persistence

## Troubleshooting

### MongoDB Connection Error
- Verify connection string in .env
- Check IP whitelist in MongoDB Atlas
- Confirm username and password

### Login Issues
- Clear browser cache
- Check server is running
- Look at browser console (F12) for errors

### CSV Not Downloading
- Check browser download settings
- Ensure popups not blocked
- Try different browser

### Charts Not Showing
- Verify Chart.js loaded
- Check browser console
- Refresh page

## Documentation

- **SETUP_GUIDE.md** - Detailed setup guide
- **IMPLEMENTATION_SUMMARY.md** - Feature breakdown
- **QUICK_START_CHECKLIST.md** - Step-by-step verification
- **README.md** - This file

## Support

For issues:
1. Check browser console (F12)
2. Check server terminal logs
3. Review documentation
4. Verify environment variables

## License

Part of Sustainopedia initiative.

---

**Version**: 1.0.0  
**Last Updated**: April 2026  
**Status**: Production Ready