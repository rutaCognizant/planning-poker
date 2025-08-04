const bcrypt = require('bcryptjs');
const historyLogger = require('./history');

class AdminAuth {
    constructor() {
        // In production, these should be in environment variables
        this.adminCredentials = {
            username: process.env.ADMIN_USERNAME || 'admin',
            // Default password: 'rzzrzz123' - should be changed in production
            passwordHash: process.env.ADMIN_PASSWORD_HASH || '$2a$10$gUouoZeaklF2hpxJ5cvGbuKCy2s4eygyAZ2nmja4lE7s5GmRQMkmi'
        };
    }

    async verifyCredentials(username, password) {
        try {
            if (username !== this.adminCredentials.username) {
                return false;
            }

            let isValid = false;
            
            // Try bcrypt first
            try {
                isValid = await bcrypt.compare(password, this.adminCredentials.passwordHash);
            } catch (bcryptError) {
                console.log('Bcrypt error, trying fallback:', bcryptError.message);
                // Fallback: check if it's the default password directly
                if (password === 'rzzrzz123' && !process.env.ADMIN_PASSWORD_HASH) {
                    isValid = true;
                    console.log('✅ Using fallback password verification');
                }
            }
            
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

    requireAdmin = (req, res, next) => {
        if (this.isAdminSession(req)) {
            next();
        } else {
            res.status(401).json({ error: 'Admin authentication required' });
        }
    }
}

module.exports = new AdminAuth();