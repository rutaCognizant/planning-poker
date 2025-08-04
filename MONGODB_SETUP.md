# MongoDB Atlas Setup Guide

## Free MongoDB Atlas Setup (Recommended)

### 1. Create MongoDB Atlas Account
1. Go to [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Click "Try Free" and create an account
3. Choose "Build a database" → "Free" (M0 Sandbox)

### 2. Configure Database
1. **Cloud Provider**: AWS (default)
2. **Region**: Choose closest to your users
3. **Cluster Name**: `rzzrzz-poker-cluster` (or any name)
4. Click "Create Cluster"

### 3. Setup Database Access
1. Go to "Database Access" → "Add New Database User"
2. **Authentication Method**: Password
3. **Username**: `rzzrzz-admin` (or your preference)
4. **Password**: Generate a secure password
5. **Database User Privileges**: "Read and write to any database"
6. Click "Add User"

### 4. Setup Network Access
1. Go to "Network Access" → "Add IP Address"
2. Choose "Allow Access from Anywhere" (0.0.0.0/0)
3. Or add your specific IP addresses for better security
4. Click "Confirm"

### 5. Get Connection String
1. Go to "Clusters" → Click "Connect" on your cluster
2. Choose "Connect your application"
3. **Driver**: Node.js
4. **Version**: 4.1 or later
5. Copy the connection string (looks like):
   ```
   mongodb+srv://rzzrzz-admin:<password>@rzzrzz-poker-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### 6. Set Environment Variables

**For Render Deployment:**
1. Go to your Render dashboard
2. Select your web service
3. Go to "Environment" tab
4. Add these variables:
   - `MONGODB_URI`: Your connection string (replace `<password>` with actual password)
   - `ADMIN_USERNAME`: `admin` (or your choice)
   - `ADMIN_PASSWORD_HASH`: (optional - uses default if not set)
   - `SESSION_SECRET`: A random secret key for sessions

**For Local Development:**
Create a `.env` file (already in .gitignore):
```env
MONGODB_URI=mongodb+srv://rzzrzz-admin:YOUR_PASSWORD@rzzrzz-poker-cluster.xxxxx.mongodb.net/rzzrzz-poker?retryWrites=true&w=majority
ADMIN_USERNAME=admin
SESSION_SECRET=your-super-secret-session-key-here
```

## Alternative: Local MongoDB (Development Only)

If you prefer local development:
1. Install MongoDB locally
2. Start MongoDB: `mongod`
3. Use connection string: `mongodb://localhost:27017/rzzrzz-poker`

## Admin Access

**Default Credentials:**
- Username: `admin`
- Password: `rzzrzz123`

**Admin Dashboard:** `/admin.html`

⚠️ **IMPORTANT**: Change the default password in production!

## Database Collections

The system will automatically create these collections:
- `actions`: User action logs with timestamps
- Indexes will be created automatically for optimal performance

## Troubleshooting

**Can't connect to database:**
- Check your IP is whitelisted in MongoDB Atlas
- Verify the connection string is correct
- Ensure the database user has proper permissions

**Admin login fails:**
- Check ADMIN_USERNAME environment variable
- Verify the password (default: rzzrzz123)
- Check browser console for errors

**Actions not logging:**
- Database connection failed (check server logs)
- MongoDB Atlas may take a few minutes to provision initially