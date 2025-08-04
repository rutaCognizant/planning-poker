const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class HistoryLogger {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'rzzrzz-poker.db');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('❌ SQLite connection failed:', err.message);
                        console.log('📝 History logging will be disabled');
                        this.isConnected = false;
                        resolve(); // Don't reject, just continue without DB
                        return;
                    }
                    
                    console.log('✅ Connected to SQLite database for history logging');
                    this.isConnected = true;
                    
                    // Create tables and indexes
                    this.initializeDatabase()
                        .then(() => resolve())
                        .catch(reject);
                });
            } catch (error) {
                console.error('❌ SQLite setup failed:', error.message);
                this.isConnected = false;
                resolve(); // Continue without DB
            }
        });
    }

    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                resolve();
                return;
            }

            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    userName TEXT,
                    roomId TEXT,
                    details TEXT,
                    ip TEXT,
                    userAgent TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createIndexes = [
                'CREATE INDEX IF NOT EXISTS idx_timestamp ON actions(timestamp DESC)',
                'CREATE INDEX IF NOT EXISTS idx_userName ON actions(userName, timestamp DESC)',
                'CREATE INDEX IF NOT EXISTS idx_roomId ON actions(roomId, timestamp DESC)',
                'CREATE INDEX IF NOT EXISTS idx_action ON actions(action, timestamp DESC)'
            ];

            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error('⚠️  Failed to create actions table:', err.message);
                    reject(err);
                    return;
                }

                // Create indexes
                let indexCount = 0;
                const totalIndexes = createIndexes.length;

                createIndexes.forEach((indexSQL) => {
                    this.db.run(indexSQL, (err) => {
                        if (err) {
                            console.error('⚠️  Failed to create index:', err.message);
                        }
                        
                        indexCount++;
                        if (indexCount === totalIndexes) {
                            console.log('✅ SQLite database initialized with indexes');
                            resolve();
                        }
                    });
                });
            });
        });
    }

    async logAction(actionData) {
        if (!this.isConnected) {
            console.log('📝 Action logged (console only):', actionData);
            return;
        }

        return new Promise((resolve) => {
            try {
                const {
                    action,
                    userName,
                    roomId,
                    details,
                    ip,
                    userAgent
                } = actionData;

                const sql = `
                    INSERT INTO actions (action, userName, roomId, details, ip, userAgent, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                `;

                const params = [
                    action,
                    userName || null,
                    roomId || null,
                    details ? JSON.stringify(details) : null,
                    ip || 'unknown',
                    userAgent || 'unknown'
                ];

                this.db.run(sql, params, function(err) {
                    if (err) {
                        console.error('❌ Failed to log action:', err.message);
                    }
                    resolve();
                });

            } catch (error) {
                console.error('❌ Failed to log action:', error.message);
                resolve();
            }
        });
    }

    async getActionsByDate(startDate, endDate = null) {
        if (!this.isConnected) return [];

        return new Promise((resolve) => {
            try {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                
                const end = endDate ? new Date(endDate) : new Date(startDate);
                end.setHours(23, 59, 59, 999);

                const sql = `
                    SELECT * FROM actions 
                    WHERE timestamp BETWEEN ? AND ?
                    ORDER BY timestamp DESC
                `;

                this.db.all(sql, [start.toISOString(), end.toISOString()], (err, rows) => {
                    if (err) {
                        console.error('❌ Failed to get actions by date:', err.message);
                        resolve([]);
                        return;
                    }

                    const actions = rows.map(row => ({
                        ...row,
                        details: row.details ? JSON.parse(row.details) : null
                    }));
                    
                    resolve(actions);
                });

            } catch (error) {
                console.error('❌ Failed to get actions by date:', error.message);
                resolve([]);
            }
        });
    }

    async getActionsByUser(userName, limit = 100) {
        if (!this.isConnected) return [];

        return new Promise((resolve) => {
            try {
                const sql = `
                    SELECT * FROM actions 
                    WHERE userName = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                `;

                this.db.all(sql, [userName, limit], (err, rows) => {
                    if (err) {
                        console.error('❌ Failed to get actions by user:', err.message);
                        resolve([]);
                        return;
                    }

                    const actions = rows.map(row => ({
                        ...row,
                        details: row.details ? JSON.parse(row.details) : null
                    }));
                    
                    resolve(actions);
                });

            } catch (error) {
                console.error('❌ Failed to get actions by user:', error.message);
                resolve([]);
            }
        });
    }

    async getActionsSummary() {
        if (!this.isConnected) return {};

        return new Promise((resolve) => {
            try {
                const queries = {
                    todayActions: `
                        SELECT COUNT(*) as count FROM actions 
                        WHERE date(timestamp) = date('now')
                    `,
                    totalActions: `
                        SELECT COUNT(*) as count FROM actions
                    `,
                    uniqueUsers: `
                        SELECT COUNT(DISTINCT userName) as count FROM actions 
                        WHERE userName IS NOT NULL
                    `,
                    topActions: `
                        SELECT action, COUNT(*) as count FROM actions 
                        GROUP BY action 
                        ORDER BY count DESC 
                        LIMIT 5
                    `
                };

                let results = {};
                let completedQueries = 0;
                const totalQueries = Object.keys(queries).length;

                Object.entries(queries).forEach(([key, sql]) => {
                    this.db.all(sql, [], (err, rows) => {
                        if (err) {
                            console.error(`❌ Failed to get ${key}:`, err.message);
                            results[key] = 0;
                        } else {
                            if (key === 'topActions') {
                                results[key] = rows;
                            } else {
                                results[key] = rows[0]?.count || 0;
                            }
                        }

                        completedQueries++;
                        if (completedQueries === totalQueries) {
                            resolve({
                                todayActions: results.todayActions || 0,
                                totalActions: results.totalActions || 0,
                                uniqueUsersCount: results.uniqueUsers || 0,
                                topActions: results.topActions || []
                            });
                        }
                    });
                });

            } catch (error) {
                console.error('❌ Failed to get actions summary:', error.message);
                resolve({});
            }
        });
    }

    async getRecentActions(limit = 50) {
        if (!this.isConnected) return [];

        return new Promise((resolve) => {
            try {
                const sql = `
                    SELECT * FROM actions 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                `;

                this.db.all(sql, [limit], (err, rows) => {
                    if (err) {
                        console.error('❌ Failed to get recent actions:', err.message);
                        resolve([]);
                        return;
                    }

                    const actions = rows.map(row => ({
                        ...row,
                        details: row.details ? JSON.parse(row.details) : null
                    }));
                    
                    resolve(actions);
                });

            } catch (error) {
                console.error('❌ Failed to get recent actions:', error.message);
                resolve([]);
            }
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db && this.isConnected) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('📝 SQLite database connection closed');
                    }
                    this.isConnected = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Export singleton instance
const historyLogger = new HistoryLogger();

module.exports = historyLogger;