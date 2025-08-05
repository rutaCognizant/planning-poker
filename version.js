const fs = require('fs');
const path = require('path');

class VersionInfo {
    constructor() {
        this.packageJson = this.loadPackageJson();
        this.buildDate = new Date().toISOString();
        this.environment = process.env.NODE_ENV || 'development';
        this.buildInfo = this.generateBuildInfo();
    }

    loadPackageJson() {
        try {
            const packagePath = path.join(__dirname, 'package.json');
            const packageData = fs.readFileSync(packagePath, 'utf8');
            return JSON.parse(packageData);
        } catch (error) {
            console.error('Error loading package.json:', error);
            return { version: '0.0.0', name: 'RzzRzz-poker' };
        }
    }

    generateBuildInfo() {
        const now = new Date();
        return {
            version: this.packageJson.version,
            name: this.packageJson.name,
            buildDate: this.buildDate,
            buildTimestamp: now.getTime(),
            environment: this.environment,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            buildDateFormatted: now.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            uptime: null // Will be calculated dynamically
        };
    }

    getVersionInfo() {
        const startTime = process.uptime();
        const uptimeHours = Math.floor(startTime / 3600);
        const uptimeMinutes = Math.floor((startTime % 3600) / 60);
        
        return {
            ...this.buildInfo,
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            uptimeSeconds: Math.floor(startTime)
        };
    }

    getShortVersion() {
        return {
            version: this.buildInfo.version,
            environment: this.buildInfo.environment,
            buildDate: this.buildInfo.buildDateFormatted
        };
    }

    getBuildHash() {
        // Generate a short hash based on build date and version
        const str = `${this.buildInfo.version}-${this.buildInfo.buildTimestamp}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 7);
    }
}

module.exports = new VersionInfo();