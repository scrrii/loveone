/**
 * App.js - Main application logic for Love Run
 * Handles UI interactions, screen transitions, and connects game with P2P functionality
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const screens = {
        welcome: document.getElementById('welcome-screen'),
        createRoom: document.getElementById('create-room-screen'),
        roomCreated: document.getElementById('room-created-screen'),
        joinRoom: document.getElementById('join-room-screen'),
        game: document.getElementById('game-screen'),
        results: document.getElementById('results-screen')
    };
    
    // Forms
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');
    
    // Buttons
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const shareResultsBtn = document.getElementById('share-results-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const backBtns = document.querySelectorAll('.back-btn');
    
    // Game state
    let gameState = {
        isHost: false,
        hostName: '',
        guestName: '',
        roomCode: '',
        gameStarted: false,
        gameResults: null
    };
    
    // Initialize PeerJS connection
    gameConnection.initializePeer();
    
    // Check URL parameters for room joining
    checkUrlParams();
    
    // Event Listeners
    createRoomBtn.addEventListener('click', () => showScreen('createRoom'));
    joinRoomBtn.addEventListener('click', () => showScreen('joinRoom'));
    
    createRoomForm.addEventListener('submit', handleCreateRoom);
    joinRoomForm.addEventListener('submit', handleJoinRoom);
    
    copyLinkBtn.addEventListener('click', copyShareLink);
    shareResultsBtn.addEventListener('click', shareResults);
    playAgainBtn.addEventListener('click', restartGame);
    
    backBtns.forEach(btn => {
        btn.addEventListener('click', () => showScreen('welcome'));
    });
    
    // Setup connection callbacks
    setupConnectionCallbacks();
    
    // Setup game callbacks
    setupGameCallbacks();
    
    /**
     * Check URL parameters for room joining
     */
    function checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        const hostName = urlParams.get('host');
        
        if (roomCode && hostName) {
            // Auto-fill the join room form
            document.getElementById('room-code-input').value = roomCode;
            showScreen('joinRoom');
        }
    }
    
    /**
     * Show a specific screen and hide others
     * @param {string} screenName - Name of the screen to show
     */
    function showScreen(screenName) {
        // Hide all screens
        Object.values(screens).forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show the requested screen
        screens[screenName].classList.add('active');
    }
    
    /**
     * Handle create room form submission
     * @param {Event} e - Form submit event
     */
    function handleCreateRoom(e) {
        e.preventDefault();
        
        const hostName = document.getElementById('host-name').value;
        const hostGender = document.querySelector('input[name="host-gender"]:checked').value;
        const hostPlayerType = document.querySelector('input[name="host-player-type"]:checked').value;
        
        // Create room using the connection
        const roomCode = gameConnection.createRoom(hostName, hostGender, hostPlayerType);
        
        // Update game state
        gameState.isHost = true;
        gameState.hostName = hostName;
        gameState.roomCode = roomCode;
        
        // Update UI
        document.getElementById('room-code').textContent = roomCode;
        const shareLink = gameConnection.getShareableLink();
        document.getElementById('share-link').value = shareLink;
        
        // Show room created screen
        showScreen('roomCreated');
    }
    
    /**
     * Handle join room form submission
     * @param {Event} e - Form submit event
     */
    function handleJoinRoom(e) {
        e.preventDefault();
        
        const guestName = document.getElementById('guest-name').value;
        const guestGender = document.querySelector('input[name="guest-gender"]:checked').value;
        const roomCode = document.getElementById('room-code-input').value;
        
        // Update game state
        gameState.isHost = false;
        gameState.guestName = guestName;
        gameState.roomCode = roomCode;
        
        // Show loading indicator
        const joinBtn = joinRoomForm.querySelector('button[type="submit"]');
        const originalBtnText = joinBtn.textContent;
        joinBtn.disabled = true;
        joinBtn.innerHTML = '<div class="loader-small"></div> Connecting...';
        
        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            // Reset button
            joinBtn.disabled = false;
            joinBtn.textContent = originalBtnText;
            
            // Show timeout error
            alert('Connection timed out. Please check the room code and try again.');
        }, 15000); // 15 seconds timeout
        
        // Add a one-time listener to reset the button when connection is established or fails
        const resetButton = () => {
            clearTimeout(connectionTimeout);
            joinBtn.disabled = false;
            joinBtn.textContent = originalBtnText;
        };
        
        const originalEstablishedCallback = gameConnection.callbacks.onConnectionEstablished;
        const originalErrorCallback = gameConnection.callbacks.onConnectionError;
        
        gameConnection.callbacks.onConnectionEstablished = (data) => {
            resetButton();
            if (originalEstablishedCallback) originalEstablishedCallback(data);
        };
        
        gameConnection.callbacks.onConnectionError = (err) => {
            resetButton();
            if (originalErrorCallback) originalErrorCallback(err);
        };
        
        // Join room using the connection
        gameConnection.joinRoom(roomCode, guestName, guestGender);
    }
    
    /**
     * Copy share link to clipboard
     */
    function copyShareLink() {
        const shareLink = document.getElementById('share-link');
        shareLink.select();
        document.execCommand('copy');
        
        // Show feedback
        const originalText = copyLinkBtn.textContent;
        copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyLinkBtn.textContent = originalText;
        }, 2000);
    }
    
    /**
     * Setup connection callbacks
     */
    function setupConnectionCallbacks() {
        // When connection is established
        gameConnection.onConnectionEstablished((data) => {
            console.log('Connection established:', data);
            
            // Update partner info
            if (data.isHost) {
                gameState.guestName = gameConnection.getPartnerName();
                document.getElementById('partner-name').textContent = gameState.guestName;
            } else {
                gameState.hostName = gameConnection.getPartnerName();
                document.getElementById('partner-name').textContent = gameState.hostName;
            }
            
            // Start the game
            startGame();
        });
        
        // When data is received
        gameConnection.onDataReceived((data) => {
            console.log('Data received:', data);
            
            if (data.type === 'game-update') {
                // Update partner's game state
                loveRunGame.updatePartnerState(data.gameData);
            } else if (data.type === 'game-results') {
                // Handle game results from partner
                handleGameResults(data.results);
            } else if (data.type === 'play-again') {
                // Restart the game
                restartGame();
            }
        });
        
        // When connection is closed
        gameConnection.onConnectionClosed(() => {
            console.log('Connection closed');
            alert('Your partner has disconnected. Returning to home screen.');
            showScreen('welcome');
        });
        
        // When connection error occurs
        gameConnection.onConnectionError((err) => {
            console.error('Connection error:', err);
            
            // Display a more user-friendly error message
            const errorMessage = err.message || 'Failed to establish connection';
            
            // Show error message with more context
            let userMessage = 'Connection error: ' + errorMessage;
            
            // Add helpful suggestions based on the error
            if (errorMessage.includes('Could not connect to peer')) {
                userMessage += '\n\nPossible reasons:\n' +
                    '- The room code may be incorrect\n' +
                    '- The host may have left or closed the room\n' +
                    '- There might be network connectivity issues';
            }
            
            alert(userMessage);
            
            // Return to welcome screen
            showScreen('welcome');
        });
    }
    
    /**
     * Setup game callbacks
     */
    function setupGameCallbacks() {
        // When game sends an update
        loveRunGame.onGameUpdate((gameData) => {
            gameConnection.sendGameUpdate(gameData);
        });
        
        // When game is over
        loveRunGame.onGameOver((results) => {
            handleGameResults(results);
            gameConnection.sendGameResults(results);
        });
    }
    
    /**
     * Start the game
     */
    function startGame() {
        // Initialize game with player data
        const playerData = {
            selfName: gameState.isHost ? gameState.hostName : gameState.guestName,
            selfGender: gameState.isHost ? document.querySelector('input[name="host-gender"]:checked').value : document.querySelector('input[name="guest-gender"]:checked').value,
            partnerName: gameState.isHost ? gameState.guestName : gameState.hostName,
            partnerGender: gameConnection.getPartnerGender()
        };
        
        loveRunGame.initGame(playerData);
        
        // Show game screen
        showScreen('game');
        
        // Start the game loop
        loveRunGame.startGame();
        gameState.gameStarted = true;
    }
    
    /**
     * Handle game results
     * @param {object} results - Game results
     */
    function handleGameResults(results) {
        gameState.gameResults = results;
        
        // Update results screen
        document.getElementById('compatibility-score').textContent = results.compatibility;
        document.getElementById('result-message').textContent = results.message;
        document.getElementById('player1-name').textContent = results.selfName;
        document.getElementById('player1-score').textContent = results.selfScore;
        document.getElementById('player2-name').textContent = results.partnerName;
        document.getElementById('player2-score').textContent = results.partnerScore;
        
        // Show results screen
        showScreen('results');
    }
    
    /**
     * Share results to social media
     */
    function shareResults() {
        if (!gameState.gameResults) return;
        
        const text = `${gameState.gameResults.selfName} and ${gameState.gameResults.partnerName} have a Love Compatibility of ${gameState.gameResults.compatibility}%! ${gameState.gameResults.message} Play Love Run now!`;
        
        // Try to use Web Share API if available
        if (navigator.share) {
            navigator.share({
                title: 'Love Run Results',
                text: text,
                url: window.location.origin
            }).catch(err => {
                console.error('Error sharing:', err);
                fallbackShare(text);
            });
        } else {
            fallbackShare(text);
        }
    }
    
    /**
     * Fallback sharing method
     * @param {string} text - Text to share
     */
    function fallbackShare(text) {
        // Create a temporary input to copy the text
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        
        alert('Results copied to clipboard! Share it on your favorite social media.');
    }
    
    /**
     * Restart the game
     */
    function restartGame() {
        // Notify partner about restart
        gameConnection.sendData({
            type: 'play-again'
        });
        
        // Start the game again
        startGame();
    }
});