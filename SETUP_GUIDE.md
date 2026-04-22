# Sustainopedia - Enhanced Platform Setup & Deployment Guide

## Overview
Sustainopedia is an advanced Life Cycle Assessment (LCA) and ESG reporting platform with an integrated chatbot UI, historical LCA records tracking, and secure user authentication.

## Recent Enhancements

### 1. Authentication System
- Login and registration pages with secure password hashing using bcrypt
- JWT-based authentication for API endpoints
- User data stored securely in MongoDB

### 2. CSV Export Feature
- Download LCA analysis results directly as CSV files from chat responses
- Easily import data into spreadsheet applications for further analysis

### 3. Historical LCA Records Tab
- View all past LCA calculations in one place
- Interactive bar charts showing carbon emissions by process
- Filter and sort records by product name, date, or emissions level
- Download individual records as CSV files

### 4. MongoDB Integration
- Centralized user data storage
- Persistent chat history
- LCA records stored in the cloud
- Scalable database infrastructure

### 5. Professional UI/UX
- Warm and bright green color scheme (#2d6a4f, #40916c, #8ecaaf)
- Smooth animations and transitions
- Responsive design for all devices
- No emojis - professional appearance

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- MongoDB Atlas account (free tier available)

### Step 1: Install Dependencies

```bash
cd RAG-LLM-Web-Platform
npm install
```

### Step 2: Configure MongoDB

1. Create a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster (free tier M0 is sufficient)
3. Create a database user with username and password
4. Get your connection string

### Step 3: Set Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and fill in your MongoDB credentials:
```
MONGODB_URI=mongodb+srv://admin:<YOUR_PASSWORD>@YOUR_CLUSTER.mongodb.net/sustainopedia?retryWrites=true&w=majority
JWT_SECRET=generate-a-strong-random-string-here
PORT=3000
```

### Step 4: Run the Application

```bash
npm start
```

The server will start on `http://localhost:3000`

### Step 5: First Time Setup

1. Navigate to http://localhost:3000
2. You'll be redirected to the login page
3. Click "Register here" to create a new account
4. Fill in username, email, and password
5. After registration, you'll be logged in automatically
6. Start using the platform!

## Features

### Chatbot Tab
- Chat with the AI to get LCA insights
- Input product name and ask questions about life cycle assessment
- Markdown-formatted responses with detailed analysis
- Download LCA data as CSV for each analysis

### LCA Records Tab
- View all historical LCA calculations
- Interactive bar charts showing process contributions to emissions
- Search and filter records by product name
- Sort by date, emissions, or product name
- Download individual records as CSV
- Delete records to clean up old data

### Settings Tab
- View your account information
- Export all data (chat history + LCA records) as JSON
- Clear local data cache

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Chat History
- `GET /api/chat-histories` - Get all user's chat histories
- `POST /api/chat-histories` - Save/update chat history

### LCA Records
- `GET /api/lca-records` - Get all user's LCA records
- `POST /api/lca-records` - Save new LCA record
- `DELETE /api/lca-records/:id` - Delete LCA record

### Health
- `GET /api/health` - Server health check

## File Structure

```
RAG-LLM-Web-Platform/
├── public/
│   ├── index.html          # Main app
│   ├── login.html          # Login/Register page
│   ├── script.js           # Main app logic
│   ├── login.js            # Authentication logic
│   ├── records.js          # Records page logic
│   ├── style.css           # Main styling
│   ├── login-style.css     # Login page styling
│   ├── static/             # Images and assets
│   └── functions/          # Utility functions
├── server.js               # Express server & API
├── package.json            # Dependencies
├── .env.example            # Environment template
└── .env                    # Your environment config (don't commit)
```

## Database Schema

### User
```javascript
{
  username: String,
  email: String,
  password: String (hashed),
  createdAt: Date
}
```

### ChatHistory
```javascript
{
  userId: ObjectId,
  conversationName: String,
  messages: [{
    role: 'user' | 'bot',
    content: String,
    lciData: Object,
    timestamp: Date
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### LCARecord
```javascript
{
  userId: ObjectId,
  product: String,
  lciData: Object,
  carbonEmission: Number,
  timestamp: Date
}
```

## Important Notes

⚠️ **Security**
- Never commit `.env` file to version control
- Change JWT_SECRET in production
- Use strong MongoDB passwords
- Enable IP whitelist in MongoDB Atlas

⚠️ **Core LCA Functions**
- The core LCA calculation functions in the backend (Generation module) remain unchanged
- All enhancements are in the UI/UX and data persistence layers
- Backend API endpoints only handle data storage and retrieval

## Deployment

### For Local Testing
```bash
npm start
```

### For Azure/Cloud Deployment
1. Update CORS origin in server.js to your production URL
2. Set environment variables in your hosting platform
3. Ensure MongoDB Atlas allows connections from your server IP

## Troubleshooting

### MongoDB Connection Error
- Check your connection string in `.env`
- Ensure MongoDB Atlas whitelist includes your IP
- Verify credentials are correct

### Login Not Working
- Check if MongoDB is connected
- Verify JWT_SECRET is set in .env
- Check browser console for errors

### Charts Not Displaying
- Ensure Chart.js library is loaded
- Check if records have valid LCA data
- Open browser developer tools to see console errors

## Future Enhancements

- Batch LCA analysis uploads
- Comparison reports between products
- Export functionality to different formats (PDF, Excel)
- Advanced analytics and visualizations
- Collaborative team workspaces
- API for third-party integrations

## Support

For issues or questions:
1. Check the browser console for error messages
2. Review the server logs for API errors
3. Verify all environment variables are set correctly

---

**Last Updated**: April 2026
