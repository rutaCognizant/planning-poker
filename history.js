const { MongoClient } = require('mongodb');

class HistoryLogger {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // MongoDB Atlas connection string (to be set via environment variable)
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rzzrzz-poker';
            
            this.client = new MongoClient(mongoUri);
            await this.client.connect();
            this.db = this.client.db('rzzrzz-poker');
            this.isConnected = true;
            
            console.log('✅ Connected to MongoDB for history logging');
            
            // Create indexes for better query performance
            await this.createIndexes();
            
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error.message);
            console.log('📝 History logging will be disabled');
            this.isConnected = false;
        }
    }

    async createIndexes() {
        if (!this.isConnected) return;
        
        try {
            const collection = this.db.collection('actions');
            
            // Index for date-based queries
            await collection.createIndex({ timestamp: -1 });
            
            // Index for user-based queries
            await collection.createIndex({ userName: 1, timestamp: -1 });
            
            // Index for room-based queries
            await collection.createIndex({ roomId: 1, timestamp: -1 });
            
            // Index for action type queries
            await collection.createIndex({ action: 1, timestamp: -1 });
            
        } catch (error) {
            console.error('⚠️  Failed to create indexes:', error.message);
        }
    }

    async logAction(actionData) {
        if (!this.isConnected) {
            console.log('📝 Action logged (console only):', actionData);
            return;
        }

        try {
            const logEntry = {
                ...actionData,
                timestamp: new Date(),
                ip: actionData.ip || 'unknown',
                userAgent: actionData.userAgent || 'unknown'
            };

            await this.db.collection('actions').insertOne(logEntry);
            
        } catch (error) {
            console.error('❌ Failed to log action:', error.message);
        }
    }

    async getActionsByDate(startDate, endDate = null) {
        if (!this.isConnected) return [];

        try {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            
            const end = endDate ? new Date(endDate) : new Date(startDate);
            end.setHours(23, 59, 59, 999);

            const actions = await this.db.collection('actions')
                .find({
                    timestamp: {
                        $gte: start,
                        $lte: end
                    }
                })
                .sort({ timestamp: -1 })
                .toArray();

            return actions;
        } catch (error) {
            console.error('❌ Failed to get actions by date:', error.message);
            return [];
        }
    }

    async getActionsByUser(userName, limit = 100) {
        if (!this.isConnected) return [];

        try {
            const actions = await this.db.collection('actions')
                .find({ userName: userName })
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();

            return actions;
        } catch (error) {
            console.error('❌ Failed to get actions by user:', error.message);
            return [];
        }
    }

    async getActionsSummary() {
        if (!this.isConnected) return {};

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayActions = await this.db.collection('actions')
                .countDocuments({ timestamp: { $gte: today } });

            const totalActions = await this.db.collection('actions')
                .countDocuments({});

            const uniqueUsers = await this.db.collection('actions')
                .distinct('userName');

            const topActions = await this.db.collection('actions')
                .aggregate([
                    { $group: { _id: '$action', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ]).toArray();

            return {
                todayActions,
                totalActions,
                uniqueUsersCount: uniqueUsers.length,
                topActions
            };
        } catch (error) {
            console.error('❌ Failed to get actions summary:', error.message);
            return {};
        }
    }

    async getRecentActions(limit = 50) {
        if (!this.isConnected) return [];

        try {
            const actions = await this.db.collection('actions')
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();

            return actions;
        } catch (error) {
            console.error('❌ Failed to get recent actions:', error.message);
            return [];
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            console.log('📝 MongoDB connection closed');
        }
    }
}

// Export singleton instance
const historyLogger = new HistoryLogger();

module.exports = historyLogger;