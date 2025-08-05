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
            storyPointsField: null,
            epicNameField: null,
            selectedProject: null
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
                enabled: this.config.enabled,
                storyPointsField: this.config.storyPointsField,
                epicNameField: this.config.epicNameField,
                selectedProject: this.config.selectedProject
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
                field.id === 'customfield_10015' || // your specific Jira instance field (priority)
                field.name.toLowerCase().includes('story point estimate') ||
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
                                        if (fieldInfo.name && (
                                            fieldInfo.name.toLowerCase().includes('story point estimate') ||
                                            fieldInfo.name.toLowerCase().includes('story point')
                                        )) {
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
            let allProjects = [];
            let startAt = 0;
            const maxResults = 100; // Jira's max per request
            let hasMoreResults = true;

            // Paginate through ALL projects
            while (hasMoreResults) {
                const response = await this.makeJiraRequest(
                    `/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}`
                );
                
                const projects = response.values.map(p => ({
                    key: p.key,
                    name: p.name,
                    id: p.id,
                    projectTypeKey: p.projectTypeKey
                }));
                
                allProjects = allProjects.concat(projects);
                
                // Check if there are more results
                hasMoreResults = response.values.length === maxResults;
                startAt += maxResults;
                
                // Safety check to prevent infinite loops
                if (allProjects.length > 10000) {
                    console.warn('⚠️ Loaded 10,000+ projects, stopping pagination for safety');
                    break;
                }
            }

            console.log(`✅ Loaded ${allProjects.length} Jira projects total`);
            
            // Save projects to config for validation purposes
            this.config.projects = allProjects;
            this.saveConfig();
            
            return {
                success: true,
                projects: allProjects
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

    async createEpic(projectKey, epicData) {
        try {
            // Detect Epic Name field if not already cached
            if (!this.config.epicNameField) {
                const fieldDetection = await this.detectEpicNameField(projectKey);
                if (fieldDetection.success) {
                    this.config.epicNameField = fieldDetection.fieldId;
                    this.saveConfig();
                }
            }

            const issueData = {
                fields: {
                    project: { key: projectKey },
                    issuetype: { name: 'Epic' },
                    summary: epicData.summary,
                    description: this.formatDescription(epicData.description),
                    priority: epicData.priority ? { name: epicData.priority } : undefined,
                    assignee: epicData.assignee ? { name: epicData.assignee } : undefined
                }
            };

            // Add Epic Name field if detected
            if (this.config.epicNameField) {
                issueData.fields[this.config.epicNameField] = epicData.epicName || epicData.summary;
            }

            // Remove undefined fields
            Object.keys(issueData.fields).forEach(key => {
                if (issueData.fields[key] === undefined) {
                    delete issueData.fields[key];
                }
            });

            const result = await this.makeJiraRequest('/rest/api/3/issue', {
                method: 'POST',
                body: issueData
            });

            return {
                success: true,
                epic: {
                    key: result.key,
                    id: result.id,
                    url: `${this.config.url}/browse/${result.key}`
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async detectEpicNameField(projectKey) {
        try {
            // Get field configurations for Epic issue type
            const metadata = await this.makeJiraRequest(`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&issuetypeNames=Epic&expand=projects.issuetypes.fields`);

            if (metadata.projects && metadata.projects[0] && metadata.projects[0].issuetypes) {
                const epicIssueType = metadata.projects[0].issuetypes.find(it => it.name === 'Epic');
                
                if (epicIssueType && epicIssueType.fields) {
                    // Look for Epic Name field by name patterns
                    for (const [fieldId, fieldInfo] of Object.entries(epicIssueType.fields)) {
                        if (fieldInfo.name && (
                            fieldInfo.name.toLowerCase().includes('epic name') ||
                            fieldInfo.name.toLowerCase().includes('epic link') ||
                            fieldInfo.name.toLowerCase() === 'epic' ||
                            fieldId === 'customfield_10011' || // Common default
                            fieldId === 'customfield_10004'    // Another common ID
                        )) {
                            return {
                                success: true,
                                fieldId: fieldId,
                                fieldName: fieldInfo.name
                            };
                        }
                    }
                }
            }

            return { success: false, error: 'Epic Name field not found. Epic will be created without Epic Name field.' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async createStory(projectKey, storyData, epicKey = null) {
        try {
            const issueData = {
                fields: {
                    project: { key: projectKey },
                    issuetype: { name: 'Story' },
                    summary: storyData.summary,
                    description: this.formatDescription(storyData.description),
                    priority: storyData.priority ? { name: storyData.priority } : undefined,
                    assignee: storyData.assignee ? { name: storyData.assignee } : undefined
                }
            };

            // Add epic link if provided
            if (epicKey) {
                // Epic Link field (customfield_10014 is common, but may vary)
                issueData.fields.customfield_10014 = epicKey;
            }

            // Add story points if provided
            if (storyData.storyPoints && this.config.storyPointsField) {
                issueData.fields[this.config.storyPointsField] = storyData.storyPoints;
            }

            // Remove undefined fields
            Object.keys(issueData.fields).forEach(key => {
                if (issueData.fields[key] === undefined) {
                    delete issueData.fields[key];
                }
            });

            const result = await this.makeJiraRequest('/rest/api/3/issue', {
                method: 'POST',
                body: issueData
            });

            return {
                success: true,
                story: {
                    key: result.key,
                    id: result.id,
                    url: `${this.config.url}/browse/${result.key}`
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    formatDescription(description) {
        if (!description) return null;

        // Convert plain text to Atlassian Document Format (ADF)
        return {
            type: 'doc',
            version: 1,
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: description
                        }
                    ]
                }
            ]
        };
    }

    async getEpics(projectKey) {
        try {
            // Detect Epic Name field if not already cached
            if (!this.config.epicNameField) {
                const fieldDetection = await this.detectEpicNameField(projectKey);
                if (fieldDetection.success) {
                    this.config.epicNameField = fieldDetection.fieldId;
                    this.saveConfig();
                }
            }

            const jql = `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`;
            
            // Include Epic Name field in search if detected
            const fieldsToFetch = ['summary', 'status'];
            if (this.config.epicNameField) {
                fieldsToFetch.push(this.config.epicNameField);
            }
            
            const result = await this.searchIssues(jql, fieldsToFetch, 50);
            
            if (result.success) {
                return {
                    success: true,
                    epics: result.issues.map(epic => ({
                        key: epic.key,
                        id: epic.id,
                        summary: epic.summary,
                        status: epic.status,
                        epicName: this.config.epicNameField ? 
                            epic.fields?.[this.config.epicNameField] || epic.summary : 
                            epic.summary,
                        url: epic.url
                    }))
                };
            } else {
                return result;
            }
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

    // Selected Project Management
    getSelectedProject() {
        return {
            success: true,
            selectedProject: this.config.selectedProject
        };
    }

    setSelectedProject(projectKey) {
        try {
            console.log(`🎯 Setting selected project: ${projectKey}`);
            console.log(`📋 Available projects: ${this.config.projects.length}`);
            
            // Validate project exists in our projects list (only if projectKey is provided)
            if (projectKey && this.config.projects.length > 0) {
                const project = this.config.projects.find(p => p.key === projectKey);
                if (!project) {
                    console.error(`❌ Project ${projectKey} not found in available projects`);
                    return {
                        success: false,
                        error: `Project '${projectKey}' not found in available projects. Please refresh projects first.`
                    };
                }
                console.log(`✅ Project ${projectKey} validated successfully`);
            } else if (projectKey) {
                console.warn(`⚠️ No projects loaded for validation, allowing project selection: ${projectKey}`);
            } else {
                console.log(`🗑️ Clearing selected project`);
            }

            this.config.selectedProject = projectKey || null;
            this.saveConfig();
            
            console.log(`💾 Saved selected project: ${this.config.selectedProject}`);
            
            return {
                success: true,
                selectedProject: this.config.selectedProject
            };
        } catch (error) {
            console.error(`❌ Error setting selected project:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getSelectedProjectInfo() {
        try {
            if (!this.config.selectedProject) {
                return {
                    success: true,
                    selectedProject: null,
                    projectInfo: null
                };
            }

            const project = this.config.projects.find(p => p.key === this.config.selectedProject);
            
            return {
                success: true,
                selectedProject: this.config.selectedProject,
                projectInfo: project || null
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new JiraIntegration();