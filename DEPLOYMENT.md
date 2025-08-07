# 🦟 RzzRzz Poker - Production Deployment Guide

## 🚀 Quick Deploy Options

### **Option 1: Simple Production Deploy**
```bash
# Clone and deploy
git clone <your-repo-url>
cd planning-poker
./deploy.sh
```

### **Option 2: Docker Deployment**
```bash
# Build and run with Docker
npm run docker:build
npm run docker:run

# Or use Docker Compose (recommended)
npm run docker:compose
```

### **Option 3: Manual Production Setup**
```bash
# Install dependencies
npm ci --only=production

# Set environment
export NODE_ENV=production
export SESSION_SECRET="your-secure-secret-here"

# Start production server
npm start
```

## 🌐 **Deployment Platforms**

### **Render (Recommended)**
1. Connect your GitHub repository to Render
2. Set build command: `npm ci`
3. Set start command: `npm start`
4. Add environment variables:
   - `NODE_ENV=production`
   - `SESSION_SECRET=your-secure-secret`
   - `ADMIN_PASSWORD_HASH=your-bcrypt-hash`

### **Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### **Heroku**
```bash
# Install Heroku CLI and deploy
heroku create your-app-name
git push heroku main
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET="your-secure-secret"
```

### **DigitalOcean App Platform**
1. Connect GitHub repository
2. Set build command: `npm ci`
3. Set run command: `npm start`
4. Configure environment variables

### **AWS/Google Cloud/Azure**
Use the provided Dockerfile for container deployment on any cloud platform.

## ⚙️ **Environment Configuration**

### **Required Environment Variables**
```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-super-secret-key-here
```

### **Optional Environment Variables**
```bash
# Admin Security
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=your-bcrypt-hash

# Database
DATABASE_PATH=./rzzrzz-poker.db

# Jira Integration
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your_jira_api_token
```

## 🔒 **Security Configuration**

### **1. Change Admin Password**
```bash
# Generate new password hash
node -e "console.log(require('bcryptjs').hashSync('your-new-password', 10))"
```

### **2. Generate Secure Session Secret**
```bash
# Generate random secret
openssl rand -base64 32
```

### **3. Set Strong Environment Variables**
- Use environment-specific secrets
- Never commit secrets to version control
- Use your platform's secret management

## 📊 **Production Monitoring**

### **Health Check Endpoint**
- URL: `http://your-domain.com/api/version`
- Returns: Application version and status

### **Admin Dashboard**
- URL: `http://your-domain.com/admin.html`
- Monitor user activity and system stats
- Download database backups

### **Database Backup**
```bash
# Manual backup
cp rzzrzz-poker.db backup-$(date +%Y%m%d).db

# Automated backup via admin dashboard
curl -X GET http://your-domain.com/api/admin/download-database \
  -H "Cookie: your-admin-session-cookie" \
  -o backup.db
```

## 🔧 **Troubleshooting**

### **Common Issues**
1. **Port already in use**: Change PORT environment variable
2. **Database permissions**: Ensure write access to database directory
3. **Memory issues**: Increase server memory allocation
4. **SQLite errors**: Check file permissions and disk space

### **Logs and Debugging**
```bash
# Check application logs
tail -f /var/log/rzzrzz-poker.log

# Debug mode (development only)
DEBUG=* npm start
```

## 🎯 **Performance Optimization**

### **Production Recommendations**
- Use reverse proxy (nginx/Apache) for SSL termination
- Enable gzip compression
- Set up CDN for static assets
- Configure database connection pooling
- Use PM2 for process management

### **PM2 Deployment**
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name "rzzrzz-poker" --env production

# Monitor
pm2 monit

# Auto-restart on reboot
pm2 startup
pm2 save
```

## 📈 **Scaling**

### **Horizontal Scaling**
- Use load balancer with sticky sessions
- Configure Redis for session storage
- Use external database (PostgreSQL/MySQL)

### **Database Migration**
```javascript
// Example: SQLite to PostgreSQL migration
// Update server.js to use PostgreSQL adapter
// Migrate data using appropriate tools
```

## 🎉 **Post-Deployment Checklist**

- [ ] Application accessible at production URL
- [ ] Admin dashboard working with secure credentials
- [ ] Database persisting data correctly
- [ ] SSL certificate configured (if applicable)
- [ ] Environment variables set securely
- [ ] Monitoring and logging configured
- [ ] Backup strategy implemented
- [ ] Performance testing completed

## 📞 **Support**

For deployment issues or questions:
- Check the main README.md for feature documentation
- Review server logs for error messages
- Ensure all environment variables are properly set
- Verify database permissions and connectivity

---

**🦟 RzzRzz Poker** - Making agile estimation collaborative, efficient, and enjoyable in production! 🚀