// Socket.io connection
const socket = io();

// DOM elements
const landingPage = document.getElementById('landing-page');
const gameRoom = document.getElementById('game-room');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');
const notification = document.getElementById('notification');

// Game room elements
const roomNameDisplay = document.getElementById('room-name-display');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const leaveRoomBtn = document.getElementById('leave-room');
const storyInput = document.getElementById('story-input');
const setStoryBtn = document.getElementById('set-story-btn');
const currentStory = document.getElementById('current-story');
const votingCards = document.getElementById('voting-cards');
const participants = document.getElementById('participants');
const revealBtn = document.getElementById('reveal-btn');
const clearBtn = document.getElementById('clear-btn');
const myVote = document.getElementById('my-vote');
const myVoteValue = document.getElementById('my-vote-value');
const votingResults = document.getElementById('voting-results');
const resultsGrid = document.getElementById('results-grid');
const votingStats = document.getElementById('voting-stats');

// Jira import elements
const jiraImportSection = document.getElementById('jira-import-section');
const toggleJiraImportBtn = document.getElementById('toggle-jira-import');
const jiraImportContent = document.getElementById('jira-import-content');
const jiraSearchInput = document.getElementById('jira-search-input');
const jiraSearchBtn = document.getElementById('jira-search-btn');
const jiraFilterBtns = document.querySelectorAll('.jira-filter-btn');
const jiraResults = document.getElementById('jira-results');
const jiraStoriesList = document.getElementById('jira-stories-list');
const jiraResultsCount = document.getElementById('jira-results-count');
const roomProjectInfo = document.getElementById('room-project-info');

// State
let currentRoom = null;
let currentUser = null;
let hasVoted = false;
let jiraStories = [];
let currentStoryFromJira = null;
let selectedProject = null;

// Utility functions
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function createVotingCards(cardValues) {
    votingCards.innerHTML = '';
    cardValues.forEach(value => {
        const card = document.createElement('div');
        card.className = 'voting-card';
        card.textContent = value;
        card.dataset.value = value;
        card.addEventListener('click', () => castVote(value));
        votingCards.appendChild(card);
    });
}

function castVote(vote) {
    if (currentRoom && !currentRoom.votingRevealed) {
        socket.emit('cast-vote', { vote });
        hasVoted = true;
        myVoteValue.textContent = vote;
        myVote.style.display = 'block';
        
        // Update card appearance
        document.querySelectorAll('.voting-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.value === vote) {
                card.classList.add('selected');
            }
        });
    }
}

function updateParticipants(room) {
    participants.innerHTML = '';
    room.users.forEach(user => {
        const participant = document.createElement('div');
        participant.className = 'participant';
        
        const hasUserVoted = room.votes && room.votes[user.id];
        const voteDisplay = room.votingRevealed && hasUserVoted ? room.votes[user.id] : (hasUserVoted ? '✓' : '⏳');
        
        participant.innerHTML = `
            <div class="participant-info">
                <span class="participant-name">${user.name}</span>
                <span class="participant-vote ${hasUserVoted ? 'voted' : ''}">${voteDisplay}</span>
            </div>
        `;
        participants.appendChild(participant);
    });
}

function updateRevealButton(room) {
    const totalUsers = room.users.filter(u => !u.isSpectator).length;
    const totalVotes = Object.keys(room.votes || {}).length;
    
    if (totalVotes > 0 && !room.votingRevealed) {
        revealBtn.disabled = false;
        revealBtn.textContent = `Reveal Votes (${totalVotes}/${totalUsers})`;
    } else {
        revealBtn.disabled = true;
        revealBtn.textContent = 'Reveal Votes';
    }
}

function showVotingResults(room, stats) {
    if (!room.votingRevealed) {
        votingResults.style.display = 'none';
        return;
    }

    resultsGrid.innerHTML = '';
    Object.entries(room.votes || {}).forEach(([userId, vote]) => {
        const user = room.users.find(u => u.id === userId);
        if (user) {
            const result = document.createElement('div');
            result.className = 'result-item';
            result.innerHTML = `
                <span class="result-name">${user.name}</span>
                <span class="result-vote">${vote}</span>
            `;
            resultsGrid.appendChild(result);
        }
    });

    if (stats) {
        votingStats.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${stats.average}</span>
                    <span class="stat-label">Average</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.median}</span>
                    <span class="stat-label">Median</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.min}</span>
                    <span class="stat-label">Min</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.max}</span>
                    <span class="stat-label">Max</span>
                </div>
            </div>
        `;
        
        // Add save to Jira button if we have a Jira story
        if (currentStoryFromJira && stats.average) {
            const saveToJiraBtn = document.createElement('button');
            saveToJiraBtn.className = 'jira-save-btn';
            saveToJiraBtn.textContent = `💾 Save ${stats.average} points to ${currentStoryFromJira.key}`;
            saveToJiraBtn.style.marginTop = '15px';
            saveToJiraBtn.style.width = '100%';
            
            saveToJiraBtn.addEventListener('click', () => {
                saveEstimateToJira(currentStoryFromJira.key, stats.average, room.id);
            });
            
            votingStats.appendChild(saveToJiraBtn);
        }
    }

    votingResults.style.display = 'block';
    revealBtn.style.display = 'none';
    clearBtn.style.display = 'inline-block';
}

// Event listeners
createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('room-name').value.trim();
    const userName = document.getElementById('creator-name').value.trim();
    
    if (roomName && userName) {
        currentUser = userName;
        socket.emit('create-room', { roomName, userName });
    }
});

joinRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomId = document.getElementById('room-id').value.trim();
    const userName = document.getElementById('joiner-name').value.trim();
    
    if (roomId && userName) {
        currentUser = userName;
        socket.emit('join-room', { roomId, userName });
    }
});

copyRoomIdBtn.addEventListener('click', () => {
    if (currentRoom) {
        navigator.clipboard.writeText(currentRoom.id).then(() => {
            showNotification('Room ID copied to clipboard!', 'success');
        });
    }
});

leaveRoomBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the room?')) {
        location.reload();
    }
});

setStoryBtn.addEventListener('click', () => {
    const story = storyInput.value.trim();
    if (story && currentRoom) {
        socket.emit('set-story', { story });
        storyInput.value = '';
    }
});

revealBtn.addEventListener('click', () => {
    socket.emit('reveal-votes');
});

clearBtn.addEventListener('click', () => {
    socket.emit('clear-votes');
});

// Socket event handlers
socket.on('room-created', (data) => {
    currentRoom = data.room;
    roomNameDisplay.textContent = data.room.name;
    roomIdDisplay.textContent = data.roomId;
    showPage('game-room');
    createVotingCards(data.room.cardValues);
    updateParticipants(data.room);
    showNotification('Room created successfully!', 'success');
    
    // Check Jira configuration and load selected project
    checkJiraConfiguration();
    loadSelectedProject();
});

socket.on('room-joined', (data) => {
    currentRoom = data.room;
    roomNameDisplay.textContent = data.room.name;
    roomIdDisplay.textContent = data.room.id;
    showPage('game-room');
    createVotingCards(data.room.cardValues);
    updateParticipants(data.room);
    updateRevealButton(data.room);
    
    if (data.room.currentStory) {
        currentStory.textContent = data.room.currentStory;
    }
    
    if (data.room.votingRevealed) {
        showVotingResults(data.room);
    }
    
    showNotification('Joined room successfully!', 'success');
    
    // Check Jira configuration and load selected project
    checkJiraConfiguration();
    loadSelectedProject();
});

socket.on('user-joined', (data) => {
    currentRoom = data.room;
    updateParticipants(data.room);
    updateRevealButton(data.room);
    showNotification(`${data.user.name} joined the room`, 'info');
});

socket.on('user-left', (data) => {
    currentRoom = data.room;
    updateParticipants(data.room);
    updateRevealButton(data.room);
    showNotification(`${data.userName} left the room`, 'info');
});

socket.on('story-updated', (data) => {
    currentRoom = data.room;
    currentStory.textContent = data.story;
    hasVoted = false;
    myVote.style.display = 'none';
    votingResults.style.display = 'none';
    revealBtn.style.display = 'inline-block';
    clearBtn.style.display = 'none';
    
    // Reset card selection
    document.querySelectorAll('.voting-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    updateParticipants(data.room);
    updateRevealButton(data.room);
    showNotification('New story set! You can vote now.', 'info');
});

socket.on('vote-cast', (data) => {
    currentRoom = data.room;
    updateParticipants(data.room);
    updateRevealButton(data.room);
});

socket.on('votes-revealed', (data) => {
    currentRoom = data.room;
    updateParticipants(data.room);
    showVotingResults(data.room, data.stats);
    showNotification('Votes revealed!', 'success');
});

socket.on('votes-cleared', (data) => {
    currentRoom = data.room;
    hasVoted = false;
    myVote.style.display = 'none';
    votingResults.style.display = 'none';
    revealBtn.style.display = 'inline-block';
    clearBtn.style.display = 'none';
    
    // Reset card selection
    document.querySelectorAll('.voting-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    updateParticipants(data.room);
    updateRevealButton(data.room);
    showNotification('New voting round started!', 'info');
});

// Jira Integration Functions
async function checkJiraConfiguration() {
    try {
        const response = await fetch('/api/jira/status');
        const status = await response.json();
        
        if (status.enabled) {
            jiraImportSection.style.display = 'block';
            return true;
        } else {
            jiraImportSection.style.display = 'none';
            return false;
        }
    } catch (error) {
        console.error('Failed to check Jira config:', error);
        jiraImportSection.style.display = 'none';
        return false;
    }
}

async function loadSelectedProject() {
    try {
        console.log(`🔄 Room: Loading selected project...`);
        const response = await fetch('/api/jira/selected-project');
        const result = await response.json();
        console.log(`📡 Room: Selected project response:`, result);
        
        if (result.success) {
            if (result.selectedProject && result.projectInfo) {
                selectedProject = result.projectInfo;
                console.log(`✅ Room: Project selected: ${result.projectInfo.key}`);
                roomProjectInfo.innerHTML = `<strong>${result.projectInfo.key}</strong> - ${result.projectInfo.name}`;
                roomProjectInfo.style.color = '#059669';
                
                // Update search placeholder to indicate project filtering
                jiraSearchInput.placeholder = `Search in ${result.projectInfo.key} project or enter JQL...`;
            } else {
                selectedProject = null;
                console.log(`⚠️ Room: No project selected`);
                roomProjectInfo.innerHTML = '<span style="color: #d97706;">⚠️ No project selected</span>';
                roomProjectInfo.style.color = '#d97706';
                jiraSearchInput.placeholder = 'Search stories or enter JQL...';
            }
        } else {
            selectedProject = null;
            console.error(`❌ Room: Error loading project:`, result.error);
            roomProjectInfo.innerHTML = '<span style="color: #dc2626;">❌ Error loading project</span>';
            roomProjectInfo.style.color = '#dc2626';
        }
    } catch (error) {
        console.error('Error loading selected project:', error);
        selectedProject = null;
        roomProjectInfo.innerHTML = '<span style="color: #dc2626;">❌ Connection error</span>';
        roomProjectInfo.style.color = '#dc2626';
    }
}

function toggleJiraImport() {
    const isVisible = jiraImportContent.style.display !== 'none';
    jiraImportContent.style.display = isVisible ? 'none' : 'block';
    toggleJiraImportBtn.textContent = isVisible ? 'Show Jira Import' : 'Hide Jira Import';
}

async function searchJiraStories(query = '', quickFilter = '') {
    try {
        jiraStoriesList.innerHTML = '<div class="jira-loading">🔍 Searching Jira stories...</div>';
        jiraResults.style.display = 'block';
        
        let jql = '';
        
        // Build base JQL with project filter if selected project exists
        const projectFilter = selectedProject ? `project = "${selectedProject.key}"` : '';
        console.log(`🔍 Room: Search with project filter: ${projectFilter || 'No filter'}`);
        
        if (quickFilter) {
            switch (quickFilter) {
                case 'unestimated':
                    jql = 'cf[10016] is EMPTY AND status != Done';
                    break;
                case 'current-sprint':
                    jql = 'sprint in openSprints()';
                    break;
                case 'backlog':
                    jql = 'sprint is EMPTY AND status != Done';
                    break;
            }
        } else if (query) {
            // If it looks like JQL, use it directly (assume user knows what they're doing)
            if (query.toLowerCase().includes('project') || query.toLowerCase().includes('status') || query.toLowerCase().includes('sprint')) {
                jql = query;
            } else {
                // Otherwise, search in summary and description
                jql = `(summary ~ "${query}" OR description ~ "${query}") AND status != Done`;
            }
        } else {
            jql = 'status != Done';
        }
        
        // Add project filter if we have a selected project and JQL doesn't already contain "project"
        if (projectFilter && !jql.toLowerCase().includes('project')) {
            jql = `${projectFilter} AND ${jql}`;
        }
        
        // Add default ordering if not present
        if (!jql.toLowerCase().includes('order by')) {
            if (quickFilter === 'current-sprint') {
                jql += ' ORDER BY rank';
            } else if (quickFilter === 'backlog') {
                jql += ' ORDER BY priority DESC';
            } else {
                jql += ' ORDER BY created DESC';
            }
        }
        
        console.log(`📝 Room: Final JQL query: ${jql}`);
        
        const response = await fetch('/api/jira/search-public', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jql: jql,
                maxResults: 50
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            jiraStories = result.issues;
            displayJiraStories(result.issues);
            jiraResultsCount.textContent = `${result.issues.length} stories found`;
        } else {
            jiraStoriesList.innerHTML = `<div class="jira-error">❌ ${result.error}</div>`;
            jiraResultsCount.textContent = '0 stories found';
        }
    } catch (error) {
        console.error('Jira search error:', error);
        jiraStoriesList.innerHTML = '<div class="jira-error">❌ Failed to search Jira stories</div>';
        jiraResultsCount.textContent = '0 stories found';
    }
}

function displayJiraStories(stories) {
    if (stories.length === 0) {
        jiraStoriesList.innerHTML = '<div class="jira-loading">No stories found</div>';
        return;
    }
    
    jiraStoriesList.innerHTML = stories.map(story => `
        <div class="jira-story-item" data-story-key="${story.key}">
            <div class="jira-story-header">
                <span class="jira-story-key">${story.key}</span>
                <span class="jira-story-points ${story.storyPoints ? '' : 'empty'}">${story.storyPoints || '?'}</span>
            </div>
            <div class="jira-story-title">${story.summary}</div>
            <div class="jira-story-description">${story.description || 'No description'}</div>
            <div class="jira-story-meta">
                <span class="jira-story-status">📊 ${story.status || 'Unknown'}</span>
                ${story.assignee ? `<span class="jira-story-assignee">👤 ${story.assignee}</span>` : ''}
                ${story.priority ? `<span class="jira-story-priority">⚡ ${story.priority}</span>` : ''}
            </div>
            <div class="jira-import-actions">
                <button class="jira-import-btn" onclick="importStoryToRoom('${story.key}')">📥 Import Story</button>
                ${story.url ? `<a href="${story.url}" target="_blank" class="btn btn-secondary" style="font-size: 12px; padding: 8px 12px;">🔗 View in Jira</a>` : ''}
            </div>
        </div>
    `).join('');
}

function importStoryToRoom(storyKey) {
    const story = jiraStories.find(s => s.key === storyKey);
    if (!story) {
        showNotification('Story not found', 'error');
        return;
    }
    
    currentStoryFromJira = story;
    
    // Format the story for the poker session
    const storyText = `[${story.key}] ${story.summary}\n\n${story.description || 'No description provided'}`;
    
    // Set it in the story input
    storyInput.value = storyText;
    
    // Automatically set the story
    socket.emit('setStory', {
        roomId: currentRoom.id,
        story: storyText,
        jiraKey: story.key,
        jiraUrl: story.url
    });
    
    // Show success message
    showNotification(`📥 Imported: ${story.key}`, 'success');
    
    // Hide Jira import section
    jiraImportContent.style.display = 'none';
    toggleJiraImportBtn.textContent = 'Show Jira Import';
}

async function saveEstimateToJira(storyKey, storyPoints, roomId) {
    if (!currentStoryFromJira || currentStoryFromJira.key !== storyKey) {
        return;
    }
    
    // Show editable story points modal
    showEditStoryPointsModal(storyKey, storyPoints, roomId);
}

function showEditStoryPointsModal(storyKey, storyPoints, roomId) {
    // Create modal elements
    const modal = document.createElement('div');
    modal.className = 'jira-save-modal';
    modal.innerHTML = `
        <div class="jira-save-modal-content">
            <div class="jira-save-modal-header">
                <h3>💾 Save to Jira</h3>
                <button class="jira-save-modal-close">&times;</button>
            </div>
            <div class="jira-save-modal-body">
                <p><strong>Story:</strong> ${storyKey}</p>
                <div class="story-points-input-group">
                    <label for="jira-story-points">Story Points:</label>
                    <input type="number" id="jira-story-points" value="${storyPoints}" min="0" max="100" step="0.5">
                    <div class="fibonacci-buttons">
                        <button class="fib-btn" data-value="1">1</button>
                        <button class="fib-btn" data-value="2">2</button>
                        <button class="fib-btn" data-value="3">3</button>
                        <button class="fib-btn" data-value="5">5</button>
                        <button class="fib-btn" data-value="8">8</button>
                        <button class="fib-btn" data-value="13">13</button>
                        <button class="fib-btn" data-value="21">21</button>
                    </div>
                </div>
                <div class="comment-input-group">
                    <label for="jira-comment">Comment (optional):</label>
                    <textarea id="jira-comment" placeholder="Add a comment about this estimation..." rows="3">Story estimated in RzzRzz Poker session (Room: ${roomId})
Team consensus: ${storyPoints} story points</textarea>
                </div>
            </div>
            <div class="jira-save-modal-footer">
                <button class="btn btn-secondary jira-save-cancel">Cancel</button>
                <button class="btn btn-primary jira-save-confirm">💾 Save to Jira</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    const storyPointsInput = modal.querySelector('#jira-story-points');
    const commentInput = modal.querySelector('#jira-comment');
    const fibButtons = modal.querySelectorAll('.fib-btn');
    const closeBtn = modal.querySelector('.jira-save-modal-close');
    const cancelBtn = modal.querySelector('.jira-save-cancel');
    const confirmBtn = modal.querySelector('.jira-save-confirm');

    // Fibonacci button handlers
    fibButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            storyPointsInput.value = btn.dataset.value;
            // Highlight selected button
            fibButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Highlight current value if it matches a fibonacci number
    const currentValue = storyPoints.toString();
    fibButtons.forEach(btn => {
        if (btn.dataset.value === currentValue) {
            btn.classList.add('active');
        }
    });

    // Close modal handlers
    const closeModal = () => {
        document.body.removeChild(modal);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Save handler
    confirmBtn.addEventListener('click', async () => {
        const finalStoryPoints = parseFloat(storyPointsInput.value);
        const comment = commentInput.value.trim();

        if (isNaN(finalStoryPoints) || finalStoryPoints < 0) {
            showNotification('Please enter a valid story points value', 'error');
            return;
        }

        confirmBtn.innerHTML = '<span class="loading-spinner"></span>Saving...';
        confirmBtn.disabled = true;

        try {
            const response = await fetch('/api/jira/update-story-points-public', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    issueKey: storyKey,
                    storyPoints: parseInt(finalStoryPoints),
                    comment: comment || `Story estimated in RzzRzz Poker session (Room: ${roomId})\nTeam consensus: ${finalStoryPoints} story points`
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`✅ Saved ${finalStoryPoints} points to ${storyKey} in Jira`, 'success');
                
                // Add/update the save button in voting results
                const saveToJiraBtn = document.createElement('button');
                saveToJiraBtn.className = 'jira-save-btn';
                saveToJiraBtn.textContent = `✅ Saved ${finalStoryPoints} to ${storyKey}`;
                saveToJiraBtn.disabled = true;
                saveToJiraBtn.style.marginTop = '10px';
                
                if (!votingStats.querySelector('.jira-save-btn')) {
                    votingStats.appendChild(saveToJiraBtn);
                }
                
                closeModal();
            } else {
                showNotification(`❌ Failed to save to Jira: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Save to Jira error:', error);
            showNotification('❌ Failed to save estimate to Jira', 'error');
        } finally {
            confirmBtn.innerHTML = '💾 Save to Jira';
            confirmBtn.disabled = false;
        }
    });

    // Focus on story points input
    setTimeout(() => storyPointsInput.focus(), 100);
}

// Jira Event Listeners
if (toggleJiraImportBtn) {
    toggleJiraImportBtn.addEventListener('click', toggleJiraImport);
}

if (jiraSearchBtn) {
    jiraSearchBtn.addEventListener('click', () => {
        const query = jiraSearchInput.value.trim();
        searchJiraStories(query);
    });
}

if (jiraSearchInput) {
    jiraSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = jiraSearchInput.value.trim();
            searchJiraStories(query);
        }
    });
}

jiraFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons
        jiraFilterBtns.forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        btn.classList.add('active');
        
        const filter = btn.getAttribute('data-filter');
        searchJiraStories('', filter);
    });
});

socket.on('error', (data) => {
    showNotification(data.message, 'error');
});

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
});

// Version Info Functions
async function loadVersionInfo() {
    try {
        const response = await fetch('/api/version/short');
        const versionData = await response.json();
        
        const versionText = document.getElementById('version-text');
        const environmentBadge = document.getElementById('environment-badge');
        const versionInfo = document.getElementById('version-info');
        
        if (versionText && environmentBadge && versionInfo) {
            versionText.textContent = `v${versionData.version}`;
            environmentBadge.textContent = versionData.environment.toUpperCase();
            environmentBadge.className = `environment-badge ${versionData.environment}`;
            
            // Add detailed tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'version-tooltip';
            tooltip.innerHTML = `
                <div class="version-detail"><span>Version:</span> <strong>v${versionData.version}</strong></div>
                <div class="version-detail"><span>Environment:</span> <strong>${versionData.environment}</strong></div>
                <div class="version-detail"><span>Built:</span> <strong>${versionData.buildDate}</strong></div>
            `;
            versionInfo.appendChild(tooltip);
        }
    } catch (error) {
        console.error('Failed to load version info:', error);
        const versionText = document.getElementById('version-text');
        if (versionText) {
            versionText.textContent = 'v2.1.0';
        }
    }
}

// Load version info on page load
document.addEventListener('DOMContentLoaded', loadVersionInfo); 
document.addEventListener('DOMContentLoaded', loadVersionInfo); 