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

// State
let currentRoom = null;
let currentUser = null;
let hasVoted = false;

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
                    <span class="stat-label">Average:</span>
                    <span class="stat-value">${stats.average}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Median:</span>
                    <span class="stat-value">${stats.median}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Min:</span>
                    <span class="stat-value">${stats.min}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Max:</span>
                    <span class="stat-value">${stats.max}</span>
                </div>
            </div>
        `;
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

socket.on('error', (data) => {
    showNotification(data.message, 'error');
});

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    showNotification('Disconnected from server', 'error');
}); 