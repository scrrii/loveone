/**
 * Connection.js - Handles peer-to-peer connections for Love Run game
 * Uses PeerJS for WebRTC connections
 */

class GameConnection {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.isHost = false;
        this.roomCode = null;
        this.hostName = null;
        this.guestName = null;
        this.hostGender = null;
        this.guestGender = null;
        this.hostPlayerType = null;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.isReconnecting = false;
        this.manualDisconnect = false;
        this.callbacks = {
            onConnectionEstablished: null,
            onDataReceived: null,
            onConnectionClosed: null,
            onConnectionError: null,
            onReconnecting: null,
            onReconnected: null,
            onReconnectFailed: null
        };
    }

    /**
     * Initialize PeerJS connection with a random ID
     */
    initializePeer() {
        this.initializePeerWithId(null);
    }
    
    /**
     * Initialize PeerJS connection with a specific ID
     * @param {string|null} id - Peer ID to use (null for random ID)
     */
    initializePeerWithId(id) {
        // Create a new Peer with the specified ID or random if null
        this.peer = new Peer(id, {
            debug: 2,
            // Use PeerJS public server for signaling
            host: 'peerjs-server.herokuapp.com',
            secure: true,
            port: 443,
            // Add both STUN and TURN servers for NAT traversal
            config: {
                'iceServers': [
                    // STUN servers
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Free TURN servers (with credentials)
                    {
                        urls: 'turn:numb.viagenie.ca',
                        credential: 'muazkh',
                        username: 'webrtc@live.com'
                    },
                    {
                        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                        credential: 'webrtc',
                        username: 'webrtc'
                    }
                ]
            }
        });

        this.peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
        });

        this.peer.on('error', (err) => {
            console.error('Peer connection error:', err);
            if (this.callbacks.onConnectionError) {
                this.callbacks.onConnectionError(err);
            }
        });

        // Handle incoming connections (for host)
        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });
    }

    /**
     * Create a new game room (host)
     * @param {string} hostName - Host player name
     * @param {string} hostGender - Host gender
     * @param {string} hostPlayerType - Host player type (real/phantom)
     * @returns {string} - Room code
     */
    createRoom(hostName, hostGender, hostPlayerType) {
        this.isHost = true;
        this.hostName = hostName;
        this.hostGender = hostGender;
        this.hostPlayerType = hostPlayerType;
        
        // Reset manual disconnect flag when creating a room
        this.manualDisconnect = false;
        this.reconnectAttempts = 0;
        
        // Generate a random room code
        this.roomCode = 'LOVE-' + Math.floor(1000 + Math.random() * 9000);
        
        // Destroy any existing peer
        if (this.peer) {
            this.peer.destroy();
        }
        
        // Create a new peer with the room code as ID
        this.initializePeerWithId(this.roomCode);
        
        return this.roomCode;
    }

    /**
     * Get shareable link for the room
     * @returns {string} - Shareable link
     */
    getShareableLink() {
        const url = new URL(window.location.href);
        url.searchParams.set('room', this.roomCode);
        url.searchParams.set('host', this.hostName);
        return url.toString();
    }

    /**
     * Join an existing room (guest)
     * @param {string} roomCode - Room code to join
     * @param {string} guestName - Guest player name
     * @param {string} guestGender - Guest gender
     */
    joinRoom(roomCode, guestName, guestGender) {
        this.isHost = false;
        this.roomCode = roomCode;
        this.guestName = guestName;
        this.guestGender = guestGender;
        
        // Reset manual disconnect flag when attempting to join
        this.manualDisconnect = false;

        // Destroy any existing peer
        if (this.peer) {
            this.peer.destroy();
            // Reinitialize peer with random ID
            this.initializePeer();
        }

        // Make sure peer is ready before connecting
        const connectToPeer = () => {
            console.log('Attempting to connect to room:', roomCode);
            
            // Connect to the host peer
            const conn = this.peer.connect(roomCode, {
                reliable: true,
                metadata: {
                    name: guestName,
                    gender: guestGender
                }
            });

            conn.on('open', () => {
                this.connection = conn;
                console.log('Connected to host!');
                
                // Send guest info to host
                this.sendData({
                    type: 'guest-info',
                    name: guestName,
                    gender: guestGender
                });

                if (this.callbacks.onConnectionEstablished) {
                    this.callbacks.onConnectionEstablished({
                        isHost: false,
                        hostName: null, // Will be set when host sends data
                        guestName: guestName
                    });
                }
            });

            // Handle connection failure
            conn.on('error', (err) => {
                console.error('Connection error in joinRoom:', err);
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError({
                        message: `Could not connect to peer ${roomCode}. The room may not exist or the host may have disconnected.`
                    });
                }
            });

            this.setupConnectionListeners(conn);
        };

        // If peer is already open, connect immediately
        if (this.peer.open) {
            connectToPeer();
        } else {
            // Otherwise wait for peer to open
            this.peer.on('open', () => {
                connectToPeer();
            });
        }
        
        // Set a timeout for connection attempts
        setTimeout(() => {
            if (!this.connection || !this.connection.open) {
                console.error('Connection timeout');
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(new Error('Connection timeout. The host may not be available.'));
                }
            }
        }, 15000); // 15 seconds timeout
    }

    /**
     * Handle incoming connection from guest (for host)
     * @param {object} conn - PeerJS connection object
     */
    handleIncomingConnection(conn) {
        console.log('Incoming connection from:', conn.peer);
        this.connection = conn;

        conn.on('open', () => {
            console.log('Connection established with guest!');
            
            // Send host info to guest
            this.sendData({
                type: 'host-info',
                name: this.hostName,
                gender: this.hostGender,
                playerType: this.hostPlayerType
            });

            if (this.callbacks.onConnectionEstablished) {
                this.callbacks.onConnectionEstablished({
                    isHost: true,
                    hostName: this.hostName,
                    guestName: null // Will be set when guest sends data
                });
            }
        });

        this.setupConnectionListeners(conn);
    }

    /**
     * Setup event listeners for the connection
     * @param {object} conn - PeerJS connection object
     */
    setupConnectionListeners(conn) {
        // Store the connection object
        this.connection = conn;
        
        // Set up a ping interval to keep the connection alive
        this.pingInterval = setInterval(() => {
            if (this.connection && this.connection.open) {
                this.sendData({
                    type: 'ping',
                    timestamp: Date.now()
                });
            }
        }, 30000); // Send ping every 30 seconds
        
        conn.on('data', (data) => {
            console.log('Received data:', data);
            
            // Handle different types of data
            if (data.type === 'ping') {
                // Respond to ping with pong
                this.sendData({
                    type: 'pong',
                    timestamp: data.timestamp
                });
                return; // Don't process pings further
            } else if (data.type === 'pong') {
                // Calculate latency
                const latency = Date.now() - data.timestamp;
                console.log('Connection latency:', latency + 'ms');
                return; // Don't process pongs further
            } else if (data.type === 'guest-info' && this.isHost) {
                this.guestName = data.name;
                this.guestGender = data.gender;
            } else if (data.type === 'host-info' && !this.isHost) {
                this.hostName = data.name;
                this.hostGender = data.gender;
                this.hostPlayerType = data.playerType;
            }
            
            if (this.callbacks.onDataReceived) {
                this.callbacks.onDataReceived(data);
            }
        });

        conn.on('close', () => {
            console.log('Connection closed');
            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
            
            // Attempt to reconnect if not manually closed
            if (!this.manualDisconnect) {
                this.attemptReconnect();
            } else {
                if (this.callbacks.onConnectionClosed) {
                    this.callbacks.onConnectionClosed();
                }
            }
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
            
            // Attempt to reconnect on error
            this.attemptReconnect(err);
        });
    }

    /**
     * Send data to the connected peer
     * @param {object} data - Data to send
     */
    sendData(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
            console.log('Sent data:', data);
            return true;
        } else {
            console.error('Cannot send data: Connection not established');
            return false;
        }
    }

    /**
     * Send game update to the connected peer
     * @param {object} gameData - Game data to send
     */
    sendGameUpdate(gameData) {
        return this.sendData({
            type: 'game-update',
            gameData: gameData
        });
    }

    /**
     * Send final game results to the connected peer
     * @param {object} results - Game results
     */
    sendGameResults(results) {
        return this.sendData({
            type: 'game-results',
            results: results
        });
    }

    /**
     * Set callback for when connection is established
     * @param {function} callback - Callback function
     */
    onConnectionEstablished(callback) {
        this.callbacks.onConnectionEstablished = callback;
    }

    /**
     * Set callback for when data is received
     * @param {function} callback - Callback function
     */
    onDataReceived(callback) {
        this.callbacks.onDataReceived = callback;
    }

    /**
     * Set callback for when connection is closed
     * @param {function} callback - Callback function
     */
    onConnectionClosed(callback) {
        this.callbacks.onConnectionClosed = callback;
    }

    /**
     * Set callback for when connection error occurs
     * @param {function} callback - Callback function
     */
    onConnectionError(callback) {
        this.callbacks.onConnectionError = callback;
    }
    
    /**
     * Set callback for when reconnection attempt starts
     * @param {function} callback - Callback function
     */
    onReconnecting(callback) {
        this.callbacks.onReconnecting = callback;
    }
    
    /**
     * Set callback for when reconnection is successful
     * @param {function} callback - Callback function
     */
    onReconnected(callback) {
        this.callbacks.onReconnected = callback;
    }
    
    /**
     * Set callback for when reconnection fails after all attempts
     * @param {function} callback - Callback function
     */
    onReconnectFailed(callback) {
        this.callbacks.onReconnectFailed = callback;
    }

    /**
     * Close the connection and clean up
     */
    closeConnection() {
        // Set manual disconnect flag to prevent auto-reconnect
        this.manualDisconnect = true;
        
        // Clear ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Close connection
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        
        // Destroy peer
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        
        console.log('Connection resources cleaned up');
    }
    
    /**
     * Attempt to reconnect to the peer
     * @param {Error} [error] - The error that caused the reconnection attempt
     */
    attemptReconnect(error) {
        // If already reconnecting, don't start another attempt
        if (this.isReconnecting) {
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        // Notify about reconnection attempt
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        if (this.callbacks.onReconnecting) {
            this.callbacks.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts);
        }
        
        // If error was provided, notify about it
        if (error && this.callbacks.onConnectionError) {
            this.callbacks.onConnectionError(error);
        }
        
        // If we've exceeded max attempts, give up
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.isReconnecting = false;
            
            if (this.callbacks.onReconnectFailed) {
                this.callbacks.onReconnectFailed();
            }
            
            if (this.callbacks.onConnectionClosed) {
                this.callbacks.onConnectionClosed();
            }
            
            return;
        }
        
        // Wait before attempting to reconnect (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
        
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            
            // Reinitialize peer if needed
            if (!this.peer || this.peer.destroyed) {
                this.initializePeer();
            }
            
            // Attempt to reconnect based on role
            if (this.isHost) {
                // Host just needs to wait for new connections
                this.isReconnecting = false;
                
                // Reset reconnect attempts if successful
                if (this.callbacks.onReconnected) {
                    this.callbacks.onReconnected();
                }
            } else {
                // Guest needs to reconnect to the host
                this.joinRoom(this.roomCode, this.guestName, this.guestGender);
                
                // Check if connection was established after a short delay
                setTimeout(() => {
                    if (this.isConnected()) {
                        console.log('Reconnection successful');
                        this.isReconnecting = false;
                        this.reconnectAttempts = 0;
                        
                        if (this.callbacks.onReconnected) {
                            this.callbacks.onReconnected();
                        }
                    } else {
                        console.log('Reconnection failed, trying again');
                        this.isReconnecting = false;
                        this.attemptReconnect();
                    }
                }, 5000); // Give 5 seconds to establish connection
            }
        }, delay);
    }

    /**
     * Check if connected to a peer
     * @returns {boolean} - Connection status
     */
    isConnected() {
        return this.connection && this.connection.open;
    }

    /**
     * Get the name of the partner player
     * @returns {string} - Partner name
     */
    getPartnerName() {
        return this.isHost ? this.guestName : this.hostName;
    }

    /**
     * Get the gender of the partner player
     * @returns {string} - Partner gender
     */
    getPartnerGender() {
        return this.isHost ? this.guestGender : this.hostGender;
    }

    /**
     * Get the player type (real/phantom) of the host
     * @returns {string} - Host player type
     */
    getHostPlayerType() {
        return this.hostPlayerType;
    }
}

// Create a global instance
const gameConnection = new GameConnection();