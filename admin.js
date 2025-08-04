const bcrypt = require('bcryptjs');
const historyLogger = require('./history');

class AdminAuth {
    constructor() {
        // In production, these should be in environment variables
        this.adminCredentials = {
            username: process.env.ADMIN_USERNAME || 'admin',
            // Default password: 'rzzrzz123' - should be changed in production
            passwordHash: process.env.ADMIN_PASSWORD_HASH || '$2a$10$cM/ohnOckCG7c2sCXmTkTOyB6FH0CXbCCQH/TXvKZKvE6PpUUNMR2'
        };
    }

    async verifyCredentials(username, password) {
        try {
            if (username !== this.adminCredentials.username) {
                return false;
            }

            const isValid = await bcrypt.compare(password, this.adminCredentials.passwordHash);
            
            // Log admin login attempt
            await historyLogger.logAction({
                action: 'admin_login_attempt',
                userName: username,
                success: isValid,
                roomId: null,
                details: { attempt: isValid ? 'successful' : 'failed' }
            });

            return isValid;
        } catch (error) {
            console.error('❌ Admin auth error:', error.message);
            return false;
        }
    }

    async hashPassword(password) {
        try {
            const saltRounds = 10;
            return await bcrypt.hash(password, saltRounds);
        } catch (error) {
            console.error('❌ Password hashing error:', error.message);
            return null;
        }
    }

    isAdminSession(req) {
        return req.session && req.session.isAdmin === true;
    }

    requireAdmin(req, res, next) {
        if (this.isAdminSession(req)) {
            next();
        } else {
            res.status(401).json({ error: 'Admin authentication required' });
        }
    }
}

module.exports = new AdminAuth();