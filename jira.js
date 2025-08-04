const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class JiraIntegration {
    constructor() {
        this.config = {
            url: null,
            email: null,
            apiToken: null,
            projects: [],
            enabled: false,
            storyPointsField: null
        };
        this.configFile = path.join(__dirname, 'jira-config.json');
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = fs.readFileSync(this.configFile, 'utf8');
                this.config = { ...this.config, ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('Error loading Jira config:', error);
        }
    }

    saveConfig() {
        try {
            // Don't save sensitive data to file, use environment variables instead
            const configToSave = {
                url: this.config.url,
                email: this.config.email,
                projects: this.config.projects,
                enabled: this.config.enabled
            };
            fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2));
        } catch (error) {
            console.error('Error saving Jira config:', error);
        }
    }

    configure(config) {
        this.config = { ...this.config, ...config };
        this.saveConfig();
        return this.config;
    }

    getConfig() {
        return {
            url: this.config.url,
            email: this.config.email,
            projects: this.config.projects,
            enabled: this.config.enabled,
            hasApiToken: !!this.config.apiToken
        };
    }

    setApiToken(token) {
        this.config.apiToken = token;
        // Don't save API token to file for security
    }

    isConfigured() {
        return !!(this.config.url && this.config.email && this.config.apiToken);
    }

    async makeJiraRequest(endpoint, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('Jira integration not configured');
        }

        const url = new URL(endpoint, this.config.url);
        const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
        
        const requestOptions = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        return new Promise((resolve, reject) => {
            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(requestOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(data ? JSON.parse(data) : {});
                        } else {
                            reject(new Error(`Jira API error: ${res.statusCode} - ${data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse Jira response: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);

            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }

            req.end();
        });
    }

    async testConnection() {
        try {
            const result = await this.makeJiraRequest('/rest/api/3/myself');
            return {
                success: true,
                user: result.displayName,
                email: result.emailAddress
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async detectStoryPointsField() {
        try {
            // Get field configurations to find Story Points field
            const fields = await this.makeJiraRequest('/rest/api/3/field');
            
            // Look for Story Points field by name
            const storyPointsField = fields.find(field => 
                field.name.toLowerCase().includes('story points') ||
                field.name.toLowerCase().includes('story point') ||
                field.name.toLowerCase() === 'points' ||
                field.id === 'customfield_10016' // fallback to common default
            );
            
            if (storyPointsField) {
                this.config.storyPointsField = storyPointsField.id;
                this.saveConfig();
                return {
                    success: true,
                    fieldId: storyPointsField.id,
                    fieldName: storyPointsField.name
                };
            } else {
                // Try alternative method - look at create metadata for a story
                try {
                    const projects = await this.getProjects();
                    if (projects.success && projects.projects.length > 0) {
                        const projectKey = projects.projects[0].key;
                        const metadata = await this.makeJiraRequest(`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`);
                        
                        if (metadata.projects && metadata.projects[0] && metadata.projects[0].issuetypes) {
                            for (const issueType of metadata.projects[0].issuetypes) {
                                if (issueType.fields) {
                                    for (const [fieldId, fieldInfo] of Object.entries(issueType.fields)) {
                                        if (fieldInfo.name && fieldInfo.name.toLowerCase().includes('story point')) {
                                            this.config.storyPointsField = fieldId;
                                            this.saveConfig();
                                            return {
                                                success: true,
                                                fieldId: fieldId,
                                                fieldName: fieldInfo.name
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (metaError) {
                    console.error('Error getting create metadata:', metaError);
                }
                
                return {
                    success: false,
                    error: 'Story Points field not found. Please check your Jira configuration.'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getProjects() {
        try {
            const projects = await this.makeJiraRequest('/rest/api/3/project/search?maxResults=100');
            return {
                success: true,
                projects: projects.values.map(p => ({
                    key: p.key,
                    name: p.name,
                    id: p.id,
                    projectTypeKey: p.projectTypeKey
                }))
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async searchIssues(jql, fields = null, maxResults = 50) {
        if (!fields) {
            const storyPointsField = this.config.storyPointsField || 'customfield_10016';
            fields = ['summary', 'description', 'status', 'assignee', 'priority', storyPointsField];
        }
        try {
            const searchBody = {
                jql,
                fields,
                maxResults
            };

            const result = await this.makeJiraRequest('/rest/api/3/search', {
                method: 'POST',
                body: searchBody
            });

            return {
                success: true,
                issues: result.issues.map(issue => ({
                    key: issue.key,
                    id: issue.id,
                    summary: issue.fields.summary,
                    description: this.extractTextFromDescription(issue.fields.description),
                    status: issue.fields.status?.name,
                    assignee: issue.fields.assignee?.displayName,
                    priority: issue.fields.priority?.name,
                    storyPoints: issue.fields[this.config.storyPointsField || 'customfield_10016'] || null,
                    url: `${this.config.url}/browse/${issue.key}`
                })),
                total: result.total
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    extractTextFromDescription(description) {
        if (!description) return '';
        
        // Handle Atlassian Document Format (ADF)
        if (description.type === 'doc' && description.content) {
            return this.extractTextFromADF(description.content);
        }
        
        // Handle plain text
        if (typeof description === 'string') {
            return description;
        }
        
        return '';
    }

    extractTextFromADF(content) {
        let text = '';
        
        for (const item of content) {
            if (item.type === 'paragraph' && item.content) {
                for (const textItem of item.content) {
                    if (textItem.type === 'text') {
                        text += textItem.text + ' ';
                    }
                }
                text += '\n';
            } else if (item.type === 'heading' && item.content) {
                text += '\n';
                for (const textItem of item.content) {
                    if (textItem.type === 'text') {
                        text += textItem.text + ' ';
                    }
                }
                text += '\n';
            }
        }
        
        return text.trim();
    }

    async updateIssueStoryPoints(issueKey, storyPoints, comment = null) {
        try {
            // Auto-detect story points field if not already detected
            if (!this.config.storyPointsField) {
                const detection = await this.detectStoryPointsField();
                if (!detection.success) {
                    return {
                        success: false,
                        error: `Story Points field not found: ${detection.error}`
                    };
                }
            }
            
            const storyPointsField = this.config.storyPointsField || 'customfield_10016';
            const updateBody = {
                fields: {
                    [storyPointsField]: storyPoints
                }
            };

            await this.makeJiraRequest(`/rest/api/3/issue/${issueKey}`, {
                method: 'PUT',
                body: updateBody
            });

            // Add comment if provided
            if (comment) {
                await this.addComment(issueKey, comment);
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addComment(issueKey, comment) {
        try {
            const commentBody = {
                body: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: comment
                                }
                            ]
                        }
                    ]
                }
            };

            await this.makeJiraRequest(`/rest/api/3/issue/${issueKey}/comment`, {
                method: 'POST',
                body: commentBody
            });

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getIssueTransitions(issueKey) {
        try {
            const result = await this.makeJiraRequest(`/rest/api/3/issue/${issueKey}/transitions`);
            return {
                success: true,
                transitions: result.transitions.map(t => ({
                    id: t.id,
                    name: t.name,
                    to: t.to.name
                }))
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    generateJQL(filters = {}) {
        let jql = [];
        
        if (filters.project) {
            jql.push(`project = "${filters.project}"`);
        }
        
        if (filters.assignee) {
            jql.push(`assignee = "${filters.assignee}"`);
        }
        
        if (filters.status) {
            jql.push(`status = "${filters.status}"`);
        }
        
        if (filters.sprint) {
            jql.push(`sprint = "${filters.sprint}"`);
        }
        
        if (filters.issueType) {
            jql.push(`issueType = "${filters.issueType}"`);
        }
        
        if (filters.noStoryPoints) {
            jql.push('cf[10016] is EMPTY');
        }
        
        let query = jql.join(' AND ');
        
        // Default ordering
        if (query && !query.toLowerCase().includes('order by')) {
            query += ' ORDER BY created DESC';
        }
        
        return query || 'project is not EMPTY ORDER BY created DESC';
    }
}

module.exports = new JiraIntegration();