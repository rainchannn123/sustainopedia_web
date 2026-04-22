# Quick Start Checklist

## Pre-Setup Requirements
- [ ] Node.js v14+ installed
- [ ] MongoDB Atlas account created
- [ ] MongoDB cluster created
- [ ] Database user created with strong password

## Installation Steps

### 1. Install Dependencies
```bash
cd RAG-LLM-Web-Platform
npm install
```
- [ ] Command completed without errors
- [ ] Check that these packages were installed:
  - mongoose
  - jsonwebtoken
  - bcrypt
  - dotenv

### 2. Create Environment File
```bash
cp .env.example .env
```
- [ ] .env file created in root directory
- [ ] Opened .env file for editing

### 3. Configure MongoDB Connection
Edit `.env` file with your MongoDB credentials:
```
MONGODB_URI=mongodb+srv://admin:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/sustainopedia?retryWrites=true&w=majority
```
- [ ] Replaced `YOUR_PASSWORD` with your actual MongoDB password
- [ ] Replaced `YOUR_CLUSTER` with your cluster name
- [ ] Verified no special characters are breaking the URL (encode if needed)

### 4. Set JWT Secret
In `.env` file, update:
```
JWT_SECRET=your-secure-random-string-at-least-32-characters
```
- [ ] Generated a strong random string
- [ ] Updated JWT_SECRET value

### 5. Start the Server
```bash
npm start
```
Expected output:
```
MongoDB connected
Server running at http://localhost:3000
```
- [ ] Both messages appear in console
- [ ] No error messages
- [ ] Server is accessible at http://localhost:3000

## First-Time User Setup

### 1. Create Account
1. Navigate to http://localhost:3000
2. Click "Register here"
3. Fill in:
   - [ ] Username (minimum 3 characters)
   - [ ] Email (valid email format)
   - [ ] Password (minimum 6 characters)
   - [ ] Confirm Password
4. Click "Register"
- [ ] Account created successfully
- [ ] Redirected to main app

### 2. Verify Authentication
- [ ] Username appears in top-right dropdown
- [ ] Can click on avatar to see dropdown menu
- [ ] Logout button is present

## Feature Testing

### Chatbot Tab
1. [ ] Chatbot tab is active when app loads
2. [ ] Product input field is visible
3. [ ] Chat message input area is functional
4. [ ] Can type message and click send
5. [ ] Message appears in chat window
6. [ ] Can switch between conversations

### Chat Response with LCA
When bot sends LCA response:
- [ ] Response text is formatted (markdown)
- [ ] LCIA table is displayed
- [ ] **Download CSV button appears below table**
- [ ] Can click "Download CSV" button
- [ ] CSV file downloads to computer
- [ ] Open CSV in Excel/Sheets - data is properly formatted

### LCA Records Tab
1. [ ] "LCA Records" tab visible in left navigation
2. [ ] After running LCA from chat, switch to Records tab
3. [ ] LCA record appears as a card
4. [ ] Card shows:
   - [ ] Product name
   - [ ] Date and time
   - [ ] Total emissions badge
   - [ ] Bar chart visualization
5. [ ] Bar chart shows:
   - [ ] All processes as bars
   - [ ] Animated appearance
   - [ ] Hover tooltips with details

### Search & Filter
- [ ] Search box works (filter by product name)
- [ ] Sort dropdown works:
   - [ ] Most Recent
   - [ ] Oldest First
   - [ ] Product Name
   - [ ] Highest Emissions

### Record Actions
- [ ] "Download CSV" button downloads individual record
- [ ] "Delete" button removes record (with confirmation)
- [ ] Records update in real-time

### Settings Tab
1. [ ] Settings tab accessible
2. [ ] Shows username and email
3. [ ] "Export All Data" button visible
4. [ ] Can export data as JSON
5. [ ] JSON file contains chat history and LCA records
6. [ ] "Clear Local Data" button visible
7. [ ] Clear data requires confirmation

### Logout
- [ ] Click logout button
- [ ] Redirected to login page
- [ ] Can login with same credentials

## Browser Storage Verification

### Check Local Storage
1. Open Developer Tools (F12)
2. Go to Application/Storage tab
3. Check Local Storage:
   - [ ] `token` - JWT token value
   - [ ] `userId` - User ID value
   - [ ] `username` - Your username
   - [ ] `chatHistory` - Chat conversation data
   - [ ] `lcaRecords` - LCA records array

### Check MongoDB (Optional)
1. Log into MongoDB Atlas
2. Go to your cluster
3. View "sustainopedia" database
4. Collections should exist:
   - [ ] users (your account)
   - [ ] chathistories (conversations)
   - [ ] lcarecords (LCA calculations)

## Common Issues & Solutions

### MongoDB Connection Error
**Error**: "MongoDB connection error"
**Solution**: 
- [ ] Verify connection string in .env
- [ ] Check MongoDB Atlas IP whitelist includes your IP
- [ ] Verify username and password

### Can't Login
**Error**: "Login failed"
**Solution**:
- [ ] Check that server is running
- [ ] Clear browser cache and cookies
- [ ] Check browser console (F12) for errors
- [ ] Verify MongoDB is connected

### CSV Download Not Working
**Error**: No file downloads
**Solution**:
- [ ] Check browser download settings
- [ ] Ensure popups/downloads not blocked
- [ ] Try a different browser
- [ ] Check browser console for JavaScript errors

### Charts Not Showing
**Error**: Records appear but no chart
**Solution**:
- [ ] Verify Chart.js library loaded (Network tab in F12)
- [ ] Ensure LCA records have valid data
- [ ] Check browser console for errors
- [ ] Try refreshing the page

### Tab Switching Not Working
**Error**: Clicking tabs doesn't change page
**Solution**:
- [ ] Check browser console for JavaScript errors
- [ ] Verify all script files loaded (Network tab)
- [ ] Try hard refresh (Ctrl+Shift+R)

## Performance Checklist

- [ ] Page loads in under 2 seconds
- [ ] Chat responses appear smoothly
- [ ] Charts render smoothly with animation
- [ ] CSV downloads complete quickly
- [ ] No console errors or warnings

## Security Checklist

- [ ] Never committed .env file to git
- [ ] JWT_SECRET is strong and unique
- [ ] MongoDB password is strong
- [ ] Using HTTPS in production (not just localhost)
- [ ] CORS origins properly configured
- [ ] No sensitive data in localStorage (only tokens)

## Production Deployment Checklist

When ready to deploy:
- [ ] Update MONGODB_URI for production database
- [ ] Change JWT_SECRET to strong random string
- [ ] Update CORS origins in server.js
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS
- [ ] Test all features in production environment
- [ ] Set up database backups
- [ ] Monitor server logs
- [ ] Consider adding rate limiting
- [ ] Set up error logging service

## Support Resources

If you encounter issues:
1. Check browser console (F12) for error messages
2. Check server terminal for error logs
3. Review IMPLEMENTATION_SUMMARY.md for detailed docs
4. Check SETUP_GUIDE.md for comprehensive setup
5. Verify all environment variables are set

## Next Steps

After successful setup:
1. [ ] Customize UI colors if needed (update CSS variables)
2. [ ] Configure backend LCA API endpoint
3. [ ] Test LCA calculations with sample data
4. [ ] Set up analytics/monitoring
5. [ ] Plan data backup strategy
6. [ ] Create user documentation
7. [ ] Plan beta testing with users

---

**Setup Complete!** Your platform is ready to use.

For questions or issues, refer to the detailed guides included in the project.
