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
        this.maxReconnectAttempts = 8;
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
     * @param {function} [callback] - Optional callback function to be called after initialization
     */
    initializePeer(callback) {
        this.initializePeerWithId(null, callback);
    }
    
    /**
     * Initialize PeerJS connection with a specific ID
     * @param {string|null} id - Peer ID to use (null for random ID)
     * @param {function} [callback] - Optional callback function to be called after initialization
     */
    initializePeerWithId(id, callback) {
        // Destroy any existing peer connection
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (e) {
                console.error('Error destroying existing peer:', e);
            }
            this.peer = null;
        }
        
        // Clear any existing peer open timeout
        if (this.peerOpenTimeout) {
            clearTimeout(this.peerOpenTimeout);
            this.peerOpenTimeout = null;
        }
        
        try {
            // Create a new Peer with the specified ID or random if null
            console.log('Creating new PeerJS instance...');
            this.peer = new Peer(id, {
                debug: 2,
                // Use reliable PeerJS server for signaling
                host: 'peerjs-server.herokuapp.com',
                secure: true,
                port: 443,
                path: '/',
                // Add extensive STUN and TURN servers for better NAT traversal
                config: {
                    'iceServers': [
                        // STUN servers (Google)
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        // Additional STUN servers
                        { urls: 'stun:stun.stunprotocol.org:3478' },
                        { urls: 'stun:stun.voiparound.com' },
                        { urls: 'stun:stun.voipbuster.com' },
                        { urls: 'stun:stun.voipstunt.com' },
                        { urls: 'stun:stun.voxgratia.org' },
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
                        },
                        // Additional TURN servers
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ],
                    'iceTransportPolicy': 'all',
                    'sdpSemantics': 'unified-plan'
                },
                // Set higher timeout for connections
                pingInterval: 5000,
                retryTimes: 5
            });
            
            // Set a timeout for the peer to open
            this.peerOpenTimeout = setTimeout(() => {
                console.error('Peer failed to initialize within timeout period');
                const timeoutError = new Error('Failed to connect to signaling server - please try again');
                
                if (callback) {
                    callback(timeoutError);
                }
                
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(timeoutError);
                }
            }, 15000); // 15 second timeout for peer initialization
            
            // Log peer creation
            console.log('Initializing peer with ID:', id || 'random');
            
            // Use one-time event handlers to prevent multiple handlers
            const onPeerOpen = (peerId) => {
                console.log('My peer ID is: ' + peerId);
                
                // Clear the timeout since we're connected
                if (this.peerOpenTimeout) {
                    clearTimeout(this.peerOpenTimeout);
                    this.peerOpenTimeout = null;
                }
                
                // Call the callback with no error
                if (callback) callback(null);
            };
            
            this.peer.on('open', onPeerOpen);
            
            // connectToPeer method is defined outside of this scope
            
            /**
             * Connect to a peer using their ID
             * @param {string} peerId - The ID of the peer to connect to
             * @param {function} callback - Callback function to be called after connection attempt
             */
            this.connectToPeer = function(peerId, callback) {
                console.log('Connecting to peer:', peerId);
                
                // Reset connection state
                this.manualDisconnect = false;
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                
                // Clear any existing connection timeout
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                
                // Set a timeout for the connection attempt
                this.connectionTimeout = setTimeout(() => {
                    console.error('Connection attempt timed out after 20 seconds');
                    if (callback) callback(new Error('Connection timed out - peer may be offline or behind restrictive firewall'));
                }, 20000); // 20 second timeout (increased from 15)
                
                try {
                    // Connect to the peer with enhanced metadata
                    const conn = this.peer.connect(peerId, {
                        reliable: true,
                        serialization: 'json',
                        metadata: {
                            type: 'game-connection',
                            timestamp: Date.now(),
                            reconnect: this.isReconnecting,
                            attempt: this.reconnectAttempts
                        }
                    });
                    
                    // Handle connection opening
                    conn.on('open', () => {
                        console.log('Connection established successfully');
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                        
                        // Setup connection listeners
                        this.setupConnectionListeners(conn);
                        
                        // Send guest info to host
                        if (!this.isHost) {
                            this.sendData({
                                type: 'guest-info',
                                name: this.guestName,
                                gender: this.guestGender,
                                reconnected: this.isReconnecting
                            });
                        }
                        
                        // Call the callback with no error
                        if (callback) callback(null);
                        
                        // Notify that connection is established
                        if (this.callbacks.onConnectionEstablished) {
                            this.callbacks.onConnectionEstablished(this.isReconnecting);
                        }
                    });
                    
                    // Handle connection errors
                    conn.on('error', (err) => {
                        console.error('Error connecting to peer:', err);
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                        
                        // Provide more specific error messages based on the error type
                        let errorMessage = 'Connection error';
                        if (err.type === 'peer-unavailable') {
                            errorMessage = 'The room code is invalid or the host has left';
                        } else if (err.type === 'network') {
                            errorMessage = 'Network error - check your internet connection';
                        } else if (err.type === 'server-error') {
                            errorMessage = 'Server error - the signaling server may be down';
                        } else if (err.type === 'browser-incompatible') {
                            errorMessage = 'Your browser may not support WebRTC connections';
                        }
                        
                        const enhancedError = new Error(errorMessage);
                        enhancedError.originalError = err;
                        
                        if (callback) callback(enhancedError);
                    });
                    
                    // Handle unexpected issues
                    conn.on('close', () => {
                        console.warn('Connection closed during connection attempt');
                        if (this.connectionTimeout) {
                            clearTimeout(this.connectionTimeout);
                            this.connectionTimeout = null;
                            if (callback) callback(new Error('Connection closed unexpectedly during setup'));
                        }
                    });
                } catch (err) {
                    console.error('Exception during peer.connect():', err);
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                    if (callback) callback(new Error('Failed to create connection: ' + err.message));
                }
            };


            this.peer.on('error', (err) => {
                console.error('Peer connection error:', err);
                
                // Clear the timeout since we got a response (even if it's an error)
                if (this.peerOpenTimeout) {
                    clearTimeout(this.peerOpenTimeout);
                    this.peerOpenTimeout = null;
                }
                
                // Provide more specific error messages based on the error type
                let errorMessage = 'Connection error';
                if (err.type === 'peer-unavailable') {
                    errorMessage = 'The room code is invalid or the host has left';
                } else if (err.type === 'network') {
                    errorMessage = 'Network error - check your internet connection';
                } else if (err.type === 'server-error') {
                    errorMessage = 'Server error - the signaling server may be down';
                } else if (err.type === 'browser-incompatible') {
                    errorMessage = 'Your browser may not support WebRTC connections';
                } else if (err.type === 'socket-error') {
                    errorMessage = 'Socket error - there may be a firewall blocking connections';
                } else if (err.type === 'socket-closed') {
                    errorMessage = 'Connection to signaling server was closed';
                }
                
                const enhancedError = new Error(errorMessage);
                enhancedError.originalError = err;
                
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(enhancedError);
                }
            });

            // Handle incoming connections (for host)
            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });
            
            // Handle peer disconnection from signaling server
            this.peer.on('disconnected', () => {
                console.log('Peer disconnected from signaling server');
                
                // Try to reconnect to the signaling server
                setTimeout(() => {
                    if (this.peer && !this.peer.destroyed) {
                        console.log('Attempting to reconnect to signaling server...');
                        this.peer.reconnect();
                    }
                }, 3000); // Try sooner (3 seconds)
            });
            
            // Handle peer destruction
            this.peer.on('close', () => {
                console.log('Peer connection closed');
                this.peer = null;
                
                // Only trigger error if not manually disconnected
                if (!this.manualDisconnect && this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(new Error('Connection to signaling server was closed'));
                }
            });
        } catch (err) {
            console.error('Exception during peer creation:', err);
            if (this.callbacks.onConnectionError) {
                this.callbacks.onConnectionError(new Error('Failed to initialize connection: ' + err.message));
            }
        }
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
        
        // Reset connection state
        this.manualDisconnect = false;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        
        console.log('Joining room:', roomCode, 'as', guestName);

        // Clear any existing connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        // Destroy any existing peer
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (e) {
                console.error('Error destroying existing peer:', e);
            }
            // Reinitialize peer with random ID
            this.initializePeer();
        }

        // Make sure peer is ready before connecting
        const connectToPeer = () => {
            console.log('Attempting to connect to room:', roomCode);
            
            try {
                // Connect to the host peer with more options for reliability
                const conn = this.peer.connect(roomCode, {
                    reliable: true,
                    serialization: 'json',
                    metadata: {
                        name: guestName,
                        gender: guestGender,
                        timestamp: Date.now(),
                        type: 'game-connection',
                        reconnect: this.isReconnecting,
                        attempt: this.reconnectAttempts
                    }
                });

                // Set connection timeout - longer timeout for better reliability
                this.connectionTimeout = setTimeout(() => {
                    if (!this.connection || !this.connection.open) {
                        console.error('Connection timeout after 20 seconds');
                        
                        // Try to close the connection if it exists
                        if (conn) {
                            try {
                                conn.close();
                            } catch (e) {
                                console.error('Error closing timed-out connection:', e);
                            }
                        }
                        
                        if (this.callbacks.onConnectionError) {
                            this.callbacks.onConnectionError(new Error('Connection timed out - host may be offline or behind restrictive firewall'));
                        }
                    }
                }, 20000); // 20 seconds timeout

                conn.on('open', () => {
                    // Clear the timeout since connection succeeded
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                    }
                    
                    this.connection = conn;
                    console.log('Connected to host successfully!');
                    
                    // Setup connection listeners
                    this.setupConnectionListeners(conn);
                    
                    // Send guest info to host
                    this.sendData({
                        type: 'guest-info',
                        name: guestName,
                        gender: guestGender,
                        reconnected: this.isReconnecting,
                        timestamp: Date.now()
                    });

                    // Notify that connection is established
                    if (this.callbacks.onConnectionEstablished) {
                        this.callbacks.onConnectionEstablished(this.isReconnecting);
                    }
                });

                // Handle connection failure
                conn.on('error', (err) => {
                    // Clear the timeout since we got an error response
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                    }
                    
                    console.error('Connection error in joinRoom:', err);
                    
                    // Provide more detailed error information
                    let errorMessage = 'Connection error';
                    if (err.type === 'peer-unavailable') {
                        errorMessage = 'The room code is invalid or the host has left';
                    } else if (err.type === 'network') {
                        errorMessage = 'Network error - check your internet connection';
                    } else if (err.type === 'server-error') {
                        errorMessage = 'Server error - the signaling server may be down';
                    } else if (err.type === 'browser-incompatible') {
                        errorMessage = 'Your browser may not support WebRTC connections';
                    }
                    
                    const enhancedError = new Error(errorMessage);
                    enhancedError.originalError = err;
                    
                    if (this.callbacks.onConnectionError) {
                        this.callbacks.onConnectionError(enhancedError);
                    }
                });

                // Handle unexpected issues
                conn.on('close', () => {
                    console.warn('Connection closed during connection attempt');
                    if (this.connectionTimeout) {
                        clearTimeout(this.connectionTimeout);
                        this.connectionTimeout = null;
                        if (this.callbacks.onConnectionError) {
                            this.callbacks.onConnectionError(new Error('Connection closed unexpectedly during setup'));
                        }
                    }
                });
            } catch (err) {
                console.error('Exception during peer.connect():', err);
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(new Error('Failed to create connection: ' + err.message));
                }
            }
        };

        // If peer is already open, connect immediately
        if (this.peer && this.peer.open) {
            connectToPeer();
        } else if (this.peer) {
            // Otherwise wait for peer to open with timeout
            const peerOpenTimeout = setTimeout(() => {
                console.error('Peer open timeout');
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(new Error('Failed to initialize connection. Please check your internet connection and try again.'));
                }
            }, 15000); // 15 seconds timeout for peer to open
            
            // One-time open event handler
            const onPeerOpen = () => {
                clearTimeout(peerOpenTimeout);
                this.peer.off('open', onPeerOpen);
                this.peer.off('error', onPeerError);
                connectToPeer();
            };
            
            // One-time error event handler
            const onPeerError = (err) => {
                clearTimeout(peerOpenTimeout);
                this.peer.off('open', onPeerOpen);
                this.peer.off('error', onPeerError);
                console.error('Peer initialization error:', err);
                if (this.callbacks.onConnectionError) {
                    this.callbacks.onConnectionError(new Error('Failed to initialize connection: ' + (err.message || 'Unknown error')));
                }
            };
            
            this.peer.on('open', onPeerOpen);
            this.peer.on('error', onPeerError);
        } else {
            console.error('No peer object available');
            if (this.callbacks.onConnectionError) {
                this.callbacks.onConnectionError(new Error('Internal error: Failed to initialize connection system.'));
            }
        }
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
                // Check if this is a reconnection based on metadata
                const isReconnect = conn.metadata && conn.metadata.reconnect;
                this.callbacks.onConnectionEstablished(isReconnect);
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
        
        // Track last received message time for connection health monitoring
        this.lastMessageTime = Date.now();
        this.lastPingSent = 0;
        this.lastPingReceived = 0;
        this.pingHistory = [];
        this.pingSequence = 0;
        this.connectionHealthy = true;
        
        // Clear any existing ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Clear any existing health check interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        // Set up a more frequent ping interval to keep the connection alive
        this.pingInterval = setInterval(() => {
            if (this.connection && this.connection.open) {
                try {
                    const now = Date.now();
                    this.lastPingSent = now;
                    this.sendData({
                        type: 'ping',
                        timestamp: now,
                        sequence: this.pingSequence++
                    });
                } catch (e) {
                    console.error('Error sending ping:', e);
                    this.connectionHealthy = false;
                }
            }
        }, 10000); // Send ping every 10 seconds (more frequent than before)
        
        // Set up a health check interval to detect stale connections
        this.healthCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageTime;
            
            // If no message received in 40 seconds, connection might be stale
            if (timeSinceLastMessage > 40000) {
                console.warn('Connection may be stale. Last message received', timeSinceLastMessage/1000, 'seconds ago');
                this.connectionHealthy = false;
                
                // Try to send a health check ping
                try {
                    this.sendData({
                        type: 'health_check',
                        timestamp: now
                    });
                    
                    // If still no response after 10 more seconds, trigger reconnection
                    setTimeout(() => {
                        const newTimeSinceLastMessage = Date.now() - this.lastMessageTime;
                        if (newTimeSinceLastMessage > 50000) { // No message for 50+ seconds
                            console.error('Connection is stale, forcing reconnection');
                            // Force close and reconnect
                            if (this.connection) {
                                try {
                                    this.connection.close();
                                } catch (e) {
                                    console.error('Error closing stale connection:', e);
                                }
                                this.connection = null;
                                this.attemptReconnect(new Error('Connection timeout - no response to health check'));
                            }
                        }
                    }, 10000); // Reduced from 15 to 10 seconds for faster recovery
                } catch (e) {
                    console.error('Error sending health check:', e);
                    // Connection is definitely broken, try to reconnect
                    if (this.connection) {
                        try {
                            this.connection.close();
                        } catch (e) {
                            console.error('Error closing broken connection:', e);
                        }
                        this.connection = null;
                        this.attemptReconnect(new Error('Connection broken - cannot send health check'));
                    }
                }
            }
        }, 20000); // Check health every 20 seconds (more frequent than before)
        
        conn.on('data', (data) => {
            // Update last message time for health monitoring
            this.lastMessageTime = Date.now();
            this.connectionHealthy = true;
            
            console.log('Received data:', data);
            
            // Handle different types of data
            if (data.type === 'ping') {
                // Respond to ping with pong immediately
                this.sendData({
                    type: 'pong',
                    timestamp: data.timestamp,
                    sequence: data.sequence,
                    received_at: Date.now()
                });
                return; // Don't process pings further
            } else if (data.type === 'pong') {
                // Calculate latency
                const latency = Date.now() - data.timestamp;
                this.lastPingReceived = Date.now();
                
                // Store ping history (keep last 5 pings)
                this.pingHistory.push(latency);
                if (this.pingHistory.length > 5) {
                    this.pingHistory.shift();
                }
                
                // Calculate average ping
                const avgPing = this.pingHistory.reduce((sum, ping) => sum + ping, 0) / this.pingHistory.length;
                console.log('Connection latency:', latency + 'ms (avg: ' + Math.round(avgPing) + 'ms)');
                return; // Don't process pongs further
            } else if (data.type === 'health_check') {
                // Respond to health check immediately with high priority
                this.sendData({
                    type: 'health_response',
                    timestamp: data.timestamp,
                    received_at: Date.now()
                });
                return; // Don't process health checks further
            } else if (data.type === 'health_response') {
                // Calculate round trip time
                const rtt = Date.now() - data.timestamp;
                console.log('Health check RTT:', rtt + 'ms');
                return; // Don't process health responses further
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
            // Clear intervals
            this.clearConnectionIntervals();
            
            // Attempt to reconnect if not manually closed
            if (!this.manualDisconnect) {
                this.attemptReconnect(new Error('Connection closed unexpectedly'));
            } else {
                if (this.callbacks.onConnectionClosed) {
                    this.callbacks.onConnectionClosed();
                }
            }
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            // Clear intervals
            this.clearConnectionIntervals();
            
            // Attempt to reconnect on error
            this.attemptReconnect(err);
        });
    }
    
    /**
     * Clear all connection-related intervals
     */
    clearConnectionIntervals() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
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
        if (this.isReconnecting || this.manualDisconnect) {
            return;
        }
        
        // Clear any existing reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        // Clear any existing connection intervals
        this.clearConnectionIntervals();
        
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
        
        // Wait before attempting to reconnect (exponential backoff with jitter)
        const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 10000);
        const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
        const delay = baseDelay + jitter;
        
        console.log(`Waiting ${Math.round(delay/1000)} seconds before reconnection attempt...`);
        
        this.reconnectTimeout = setTimeout(() => {
            console.log('Attempting to reconnect...');
            
            // Reinitialize peer if needed
            if (!this.peer || this.peer.destroyed) {
                console.log('Recreating peer for reconnection...');
                this.initializePeer();
                
                // Wait for peer to initialize before continuing
                const peerInitTimeout = setTimeout(() => {
                    if (!this.peer || !this.peer.open) {
                        console.error('Peer failed to initialize during reconnection');
                        this.isReconnecting = false;
                        this.attemptReconnect(new Error('Failed to initialize peer during reconnection'));
                    }
                }, 5000);
                
                // One-time open event handler for peer initialization
                const onPeerOpen = () => {
                    clearTimeout(peerInitTimeout);
                    this.peer.off('open', onPeerOpen);
                    this._continueReconnection(error);
                };
                
                this.peer.on('open', onPeerOpen);
                return;
            }
            
            this._continueReconnection(error);
        }, delay);
    }
    
    /**
     * Continue the reconnection process after peer initialization
     * @private
     * @param {Error} [error] - The original error that caused reconnection
     */
    _continueReconnection(error) {
        // Attempt to reconnect based on role
        if (this.isHost) {
            console.log('Host waiting for guest to reconnect...');
            // Host just needs to wait for new connections
            
            // Set a timeout to give up waiting after a while
            const hostWaitTimeout = setTimeout(() => {
                this.isReconnecting = false;
                console.error('Host gave up waiting for guest reconnection after timeout');
                if (this.callbacks.onReconnectFailed) {
                    this.callbacks.onReconnectFailed(new Error('Reconnection timeout - guest did not reconnect'));
                }
                if (this.callbacks.onConnectionClosed) {
                    this.callbacks.onConnectionClosed();
                }
            }, 60000); // Wait for 1 minute
            
            this.reconnectTimeout = hostWaitTimeout;
        } else {
            // Guest needs to reconnect to the host
            console.log('Guest attempting to reconnect to host:', this.roomCode);
            
            // Try to join the room again with more reliable error handling
            try {
                this.joinRoom(this.roomCode, this.guestName, this.guestGender);
                
                // Set a timeout for this specific reconnection attempt
                const attemptTimeout = setTimeout(() => {
                    console.error('Reconnection attempt timed out');
                    this.isReconnecting = false;
                    this.attemptReconnect(new Error('Reconnection attempt timed out'));
                }, 25000); // 25 second timeout for each attempt (increased from 20)
                
                // Check if connection was established after a short delay
                setTimeout(() => {
                    // Clear the attempt timeout since we got a response
                    clearTimeout(attemptTimeout);
                    
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
                        this.attemptReconnect(new Error('Failed to establish connection'));
                    }
                }, 5000); // Give 5 seconds to establish connection
            } catch (err) {
                console.error('Exception during reconnection attempt:', err);
                this.isReconnecting = false;
                
                // Wait a bit before trying again
                setTimeout(() => {
                    this.attemptReconnect(new Error('Exception during reconnection: ' + err.message));
                }, 3000); // 3 second delay before next attempt
            }
        }
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