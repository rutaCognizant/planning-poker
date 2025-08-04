# SQLite Database Setup Guide

## ✅ **Good News: Almost No Setup Required!**

Your RzzRzz Poker app now uses **SQLite** - a file-based database that requires **zero external setup**!

## 🗄️ **How SQLite Works:**

- **File-based**: Database stored as a single file (`rzzrzz-poker.db`)
- **Zero configuration**: Works immediately with no external services
- **Perfect for**: Small to medium apps with thousands of actions
- **No limits**: Unlike cloud databases, no row/storage limits
- **Fast**: Excellent performance for read/write operations

## 🚀 **What Happens Automatically:**

### **Local Development:**
1. Run `npm run dev`
2. SQLite database file created automatically: `rzzrzz-poker.db`
3. Tables and indexes created on first start
4. Action logging starts immediately ✅

### **Production (Render):**
1. Deploy your code (already done!)
2. Database file created automatically on first request
3. All user actions logged instantly
4. No environment variables needed

## 📊 **Database Schema:**

Your actions are stored in a simple table:
```sql
CREATE TABLE actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    userName TEXT,
    roomId TEXT,
    details TEXT,
    ip TEXT,
    userAgent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 **Optional Configuration:**

Set these environment variables if needed:

### **For Custom Database Location:**
```env
DATABASE_PATH=/path/to/your/database.db
```

### **For Admin Security:**
```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=your_bcrypt_hash
SESSION_SECRET=your-random-secret-key
```

## 📈 **What Gets Tracked:**

- ✅ **Room Creation** - Who created which rooms
- ✅ **User Joins** - When users join rooms
- ✅ **Voting Actions** - All votes cast with values
- ✅ **Story Updates** - When stories are set
- ✅ **Vote Reveals** - When votes are revealed
- ✅ **Admin Logins** - Security tracking
- ✅ **Server Events** - Startup/shutdown logs

## 🔍 **Admin Dashboard Features:**

Access your admin panel at: `/admin.html`

**Default Login:**
- Username: `admin`
- Password: `rzzrzz123`

**Features:**
- 📊 **Real-time Statistics** - Today's actions, total actions, unique users
- 🔍 **Action History** - Filter by date, user, or action type
- 📱 **Mobile Responsive** - Works on all devices
- 🔄 **Auto-refresh** - Updates every 30 seconds

## 🛠️ **Database Management:**

### **View Database Contents:**
```bash
# Install sqlite3 command line tool (optional)
sqlite3 rzzrzz-poker.db
```

### **Basic Queries:**
```sql
-- View recent actions
SELECT * FROM actions ORDER BY timestamp DESC LIMIT 10;

-- Count actions by user
SELECT userName, COUNT(*) FROM actions GROUP BY userName;

-- Actions by date
SELECT DATE(timestamp), COUNT(*) FROM actions GROUP BY DATE(timestamp);
```

### **Database Size:**
- Typical action: ~200 bytes
- 10,000 actions ≈ 2MB
- Very efficient storage

## 🚀 **Benefits of SQLite:**

✅ **Zero Setup** - Works immediately  
✅ **No External Dependencies** - Self-contained  
✅ **Fast Performance** - Optimized for your use case  
✅ **Free Forever** - No usage limits or costs  
✅ **Backup Friendly** - Single file to backup  
✅ **Version Control** - Can be committed (if small)  

## 🔒 **Data Persistence:**

### **Local Development:**
- Database file stays on your machine
- Survives server restarts
- Perfect for testing

### **Production (Render):**
- Database persists across deployments
- Automatic backups by Render
- Data survives app restarts

## ⚠️ **Production Notes:**

1. **Database file location**: Render stores it in the app container
2. **Backups**: Render handles basic persistence 
3. **Scale considerations**: SQLite handles thousands of concurrent reads
4. **Migration**: Easy to export data if you need to scale up later

## 🎯 **You're All Set!**

Your SQLite database is working immediately with:
- ✅ Zero configuration required
- ✅ All actions being logged
- ✅ Admin dashboard functional
- ✅ Statistics and filtering working

**No additional setup needed - start using your admin dashboard now!** 🎉