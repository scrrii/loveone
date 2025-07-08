/**
 * Game.js - Core game mechanics for Love Run
 * Handles the side-scrolling race, heart collection, and obstacle avoidance
 */

class LoveRunGame {
    constructor(canvasId) {
        // Canvas setup
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Game state
        this.isRunning = false;
        this.gameTime = 60; // 60 seconds game duration
        this.timeRemaining = this.gameTime;
        this.lastTimestamp = 0;
        
        // Player data
        this.players = {
            self: {
                name: '',
                gender: '',
                x: 50,
                y: 0,
                width: 40,
                height: 60,
                speed: 5,
                jumpForce: 15,
                isJumping: false,
                velocity: 0,
                gravity: 0.8,
                score: 0,
                color: '#ff4b6e' // Pink for default
            },
            partner: {
                name: '',
                gender: '',
                x: 50,
                y: 0,
                width: 40,
                height: 60,
                speed: 5,
                jumpForce: 15,
                isJumping: false,
                velocity: 0,
                gravity: 0.8,
                score: 0,
                color: '#4b9eff' // Blue for default
            }
        };
        
        // Game objects
        this.hearts = [];
        this.obstacles = [];
        this.ground = 0;
        
        // Game settings
        this.heartSpawnRate = 1000; // ms
        this.obstacleSpawnRate = 2000; // ms
        this.lastHeartSpawn = 0;
        this.lastObstacleSpawn = 0;
        this.gameSpeed = 5;
        
        // Input handling
        this.keys = {};
        this.setupEventListeners();
        
        // Callbacks
        this.callbacks = {
            onGameUpdate: null,
            onGameOver: null
        };
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.ground = this.canvas.height - 80; // Ground position
        
        // Reset player positions after resize
        if (this.players.self) {
            this.players.self.y = this.ground - this.players.self.height;
            this.players.partner.y = this.ground - this.players.partner.height;
        }
    }
    
    /**
     * Setup keyboard event listeners
     */
    setupEventListeners() {
        // Keyboard events
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Jump with spacebar or up arrow
            if ((e.code === 'Space' || e.code === 'ArrowUp') && !this.players.self.isJumping) {
                this.jump('self');
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', () => {
            if (!this.players.self.isJumping) {
                this.jump('self');
            }
        });
    }
    
    /**
     * Initialize the game with player data
     * @param {object} playerData - Player information
     */
    initGame(playerData) {
        this.players.self.name = playerData.selfName;
        this.players.self.gender = playerData.selfGender;
        this.players.partner.name = playerData.partnerName;
        this.players.partner.gender = playerData.partnerGender;
        
        // Set player colors based on gender
        this.players.self.color = playerData.selfGender === 'male' ? '#4b9eff' : '#ff4b6e';
        this.players.partner.color = playerData.partnerGender === 'male' ? '#4b9eff' : '#ff4b6e';
        
        // Reset positions
        this.players.self.x = 50;
        this.players.self.y = this.ground - this.players.self.height;
        this.players.partner.x = 150;
        this.players.partner.y = this.ground - this.players.partner.height;
        
        // Reset scores
        this.players.self.score = 0;
        this.players.partner.score = 0;
        
        // Reset game objects
        this.hearts = [];
        this.obstacles = [];
        
        // Reset time
        this.timeRemaining = this.gameTime;
        
        // Update game feedback
        this.updateGameFeedback();
    }
    
    /**
     * Start the game loop
     */
    startGame() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTimestamp = performance.now();
            requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
        }
    }
    
    /**
     * Stop the game
     */
    stopGame() {
        this.isRunning = false;
    }
    
    /**
     * Main game loop
     * @param {number} timestamp - Current timestamp
     */
    gameLoop(timestamp) {
        if (!this.isRunning) return;
        
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        // Update time remaining
        this.timeRemaining -= deltaTime / 1000;
        if (this.timeRemaining <= 0) {
            this.endGame();
            return;
        }
        
        // Update game elements
        this.update(deltaTime);
        
        // Render the game
        this.render();
        
        // Continue the loop
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }
    
    /**
     * Update game state
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime) {
        // Get current timestamp
        const timestamp = performance.now();
        
        // Update player positions
        this.updatePlayer('self', deltaTime);
        
        // Spawn hearts and obstacles
        if (timestamp - this.lastHeartSpawn > this.heartSpawnRate) {
            this.spawnHeart();
            this.lastHeartSpawn = timestamp;
        }
        
        if (timestamp - this.lastObstacleSpawn > this.obstacleSpawnRate) {
            this.spawnObstacle();
            this.lastObstacleSpawn = timestamp;
        }
        
        // Update hearts
        for (let i = this.hearts.length - 1; i >= 0; i--) {
            const heart = this.hearts[i];
            heart.x -= this.gameSpeed;
            
            // Check if heart is collected by self
            if (this.checkCollision(this.players.self, heart)) {
                this.players.self.score++;
                this.hearts.splice(i, 1);
                this.updateGameFeedback();
                continue;
            }
            
            // Remove hearts that go off screen
            if (heart.x + heart.width < 0) {
                this.hearts.splice(i, 1);
            }
        }
        
        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.x -= this.gameSpeed;
            
            // Check if player hits obstacle
            if (this.checkCollision(this.players.self, obstacle)) {
                if (this.players.self.score > 0) {
                    this.players.self.score--;
                }
                this.obstacles.splice(i, 1);
                this.updateGameFeedback();
                continue;
            }
            
            // Remove obstacles that go off screen
            if (obstacle.x + obstacle.width < 0) {
                this.obstacles.splice(i, 1);
            }
        }
        
        // Send game update to partner
        if (this.callbacks.onGameUpdate) {
            this.callbacks.onGameUpdate({
                playerX: this.players.self.x,
                playerY: this.players.self.y,
                score: this.players.self.score,
                isJumping: this.players.self.isJumping
            });
        }
    }
    
    /**
     * Update player position and state
     * @param {string} playerKey - 'self' or 'partner'
     * @param {number} deltaTime - Time since last update
     */
    updatePlayer(playerKey, deltaTime) {
        const player = this.players[playerKey];
        
        // Handle horizontal movement for self player
        if (playerKey === 'self') {
            if (this.keys['ArrowRight'] || this.keys['KeyD']) {
                player.x += player.speed;
            }
            if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
                player.x -= player.speed;
            }
            
            // Keep player within bounds
            if (player.x < 0) player.x = 0;
            if (player.x + player.width > this.canvas.width) {
                player.x = this.canvas.width - player.width;
            }
        }
        
        // Apply gravity and handle jumping
        if (player.isJumping) {
            player.y += player.velocity;
            player.velocity += player.gravity;
            
            // Check if player has landed
            if (player.y >= this.ground - player.height) {
                player.y = this.ground - player.height;
                player.isJumping = false;
                player.velocity = 0;
            }
        }
    }
    
    /**
     * Make a player jump
     * @param {string} playerKey - 'self' or 'partner'
     */
    jump(playerKey) {
        const player = this.players[playerKey];
        if (!player.isJumping) {
            player.isJumping = true;
            player.velocity = -player.jumpForce;
        }
    }
    
    /**
     * Spawn a new heart
     */
    spawnHeart() {
        const heartSize = 30;
        const yPos = Math.random() * (this.ground - 150) + 50; // Random height
        
        this.hearts.push({
            x: this.canvas.width,
            y: yPos,
            width: heartSize,
            height: heartSize
        });
    }
    
    /**
     * Spawn a new obstacle
     */
    spawnObstacle() {
        const height = 30 + Math.random() * 50; // Random height
        
        this.obstacles.push({
            x: this.canvas.width,
            y: this.ground - height,
            width: 30,
            height: height
        });
    }
    
    /**
     * Check collision between two objects
     * @param {object} obj1 - First object
     * @param {object} obj2 - Second object
     * @returns {boolean} - True if collision detected
     */
    checkCollision(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }
    
    /**
     * Render the game
     */
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.drawBackground();
        
        // Draw ground
        this.drawGround();
        
        // Draw hearts
        this.hearts.forEach(heart => this.drawHeart(heart));
        
        // Draw obstacles
        this.obstacles.forEach(obstacle => this.drawObstacle(obstacle));
        
        // Draw players
        this.drawPlayer('self');
        this.drawPlayer('partner');
        
        // Draw timer
        this.drawTimer();
    }
    
    /**
     * Draw the background
     */
    drawBackground() {
        // Create gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#c2e9fb');
        gradient.addColorStop(1, '#a1c4fd');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw some clouds
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(100, 80, 30, 0, Math.PI * 2);
        this.ctx.arc(130, 70, 40, 0, Math.PI * 2);
        this.ctx.arc(160, 80, 30, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(500, 100, 35, 0, Math.PI * 2);
        this.ctx.arc(540, 90, 45, 0, Math.PI * 2);
        this.ctx.arc(580, 100, 35, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    /**
     * Draw the ground
     */
    drawGround() {
        this.ctx.fillStyle = '#7ed957';
        this.ctx.fillRect(0, this.ground, this.canvas.width, this.canvas.height - this.ground);
        
        // Draw ground line
        this.ctx.strokeStyle = '#5aaa3d';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.ground);
        this.ctx.lineTo(this.canvas.width, this.ground);
        this.ctx.stroke();
    }
    
    /**
     * Draw a player
     * @param {string} playerKey - 'self' or 'partner'
     */
    drawPlayer(playerKey) {
        const player = this.players[playerKey];
        
        // Draw player body
        this.ctx.fillStyle = player.color;
        this.ctx.fillRect(player.x, player.y, player.width, player.height);
        
        // Draw player name
        this.ctx.fillStyle = '#333';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, player.x + player.width / 2, player.y - 10);
    }
    
    /**
     * Draw a heart
     * @param {object} heart - Heart object
     */
    drawHeart(heart) {
        this.ctx.fillStyle = '#ff4b6e';
        
        // Draw heart shape
        this.ctx.beginPath();
        const topLeftX = heart.x + heart.width / 4;
        const topLeftY = heart.y + heart.height / 4;
        const topRightX = heart.x + heart.width * 3 / 4;
        const topRightY = heart.y + heart.height / 4;
        const bottomX = heart.x + heart.width / 2;
        const bottomY = heart.y + heart.height * 3 / 4;
        
        // Left curve
        this.ctx.moveTo(bottomX, bottomY);
        this.ctx.bezierCurveTo(
            heart.x, heart.y + heart.height / 2,
            heart.x, heart.y,
            topLeftX, topLeftY
        );
        
        // Right curve
        this.ctx.bezierCurveTo(
            heart.x + heart.width / 2, heart.y,
            heart.x + heart.width / 2, heart.y,
            topRightX, topRightY
        );
        
        this.ctx.bezierCurveTo(
            heart.x + heart.width, heart.y,
            heart.x + heart.width, heart.y + heart.height / 2,
            bottomX, bottomY
        );
        
        this.ctx.fill();
    }
    
    /**
     * Draw an obstacle
     * @param {object} obstacle - Obstacle object
     */
    drawObstacle(obstacle) {
        this.ctx.fillStyle = '#8b4513'; // Brown color
        this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
    
    /**
     * Draw the timer
     */
    drawTimer() {
        document.getElementById('time-left').textContent = Math.ceil(this.timeRemaining);
    }
    
    /**
     * Update game feedback based on scores
     */
    updateGameFeedback() {
        const feedbackElement = document.getElementById('game-feedback');
        const scoreDiff = this.players.self.score - this.players.partner.score;
        
        if (scoreDiff > 5) {
            feedbackElement.textContent = "You're pulling ahead in love! ❤️";
        } else if (scoreDiff < -5) {
            feedbackElement.textContent = "Your lover is catching up! Hurry! 💔";
        } else if (scoreDiff >= 0) {
            feedbackElement.textContent = "You're neck and neck in love! 💕";
        } else {
            feedbackElement.textContent = "Don't give up! Collect more hearts! 💖";
        }
    }
    
    /**
     * Update partner's game state
     * @param {object} partnerData - Partner's game data
     */
    updatePartnerState(partnerData) {
        this.players.partner.x = partnerData.playerX;
        this.players.partner.y = partnerData.playerY;
        this.players.partner.score = partnerData.score;
        this.players.partner.isJumping = partnerData.isJumping;
        
        // Update game feedback
        this.updateGameFeedback();
    }
    
    /**
     * End the game and calculate results
     */
    endGame() {
        this.isRunning = false;
        
        // Calculate love compatibility
        const totalHearts = this.players.self.score + this.players.partner.score;
        const maxPossibleHearts = 100; // Theoretical maximum
        const compatibility = Math.min(Math.round((totalHearts / maxPossibleHearts) * 100), 100);
        
        // Determine result message
        let resultMessage = '';
        if (compatibility >= 90) {
            resultMessage = "You are today's Perfect Couple! 🥇";
        } else if (compatibility >= 70) {
            resultMessage = "Amazing chemistry between you two! 💞";
        } else if (compatibility >= 50) {
            resultMessage = "You make a lovely couple! 💑";
        } else if (compatibility >= 30) {
            resultMessage = "There's potential for more love! 💫";
        } else {
            resultMessage = "Keep working on your relationship! 🌱";
        }
        
        // Prepare results
        const results = {
            compatibility: compatibility,
            message: resultMessage,
            selfScore: this.players.self.score,
            partnerScore: this.players.partner.score,
            selfName: this.players.self.name,
            partnerName: this.players.partner.name
        };
        
        // Call the game over callback
        if (this.callbacks.onGameOver) {
            this.callbacks.onGameOver(results);
        }
    }
    
    /**
     * Set callback for game updates
     * @param {function} callback - Callback function
     */
    onGameUpdate(callback) {
        this.callbacks.onGameUpdate = callback;
    }
    
    /**
     * Set callback for game over
     * @param {function} callback - Callback function
     */
    onGameOver(callback) {
        this.callbacks.onGameOver = callback;
    }
}

// Create a global instance
const loveRunGame = new LoveRunGame('game-canvas');