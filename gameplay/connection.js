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
        this.callbacks = {
            onConnectionEstablished: null,
            onDataReceived: null,
            onConnectionClosed: null,
            onConnectionError: null
        };
    }

    /**
     * Initialize PeerJS connection
     */
    initializePeer() {
        // Create a new Peer with a random ID
        this.peer = new Peer(null, {
            debug: 2,
            // Add public STUN servers to help with NAT traversal
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
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
        
        // Generate a random room code
        this.roomCode = 'LOVE-' + Math.floor(1000 + Math.random() * 9000);
        
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

        // Make sure peer is ready before connecting
        const connectToPeer = () => {
            console.log('Attempting to connect to room:', roomCode);
            
            // Connect to the host peer
            const conn = this.peer.connect(roomCode, {
                reliable: true
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
        conn.on('data', (data) => {
            console.log('Received data:', data);
            
            // Handle different types of data
            if (data.type === 'guest-info' && this.isHost) {
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
            if (this.callbacks.onConnectionClosed) {
                this.callbacks.onConnectionClosed();
            }
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            if (this.callbacks.onConnectionError) {
                this.callbacks.onConnectionError(err);
            }
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
     * Close the connection and clean up
     */
    closeConnection() {
        if (this.connection) {
            this.connection.close();
        }
        if (this.peer) {
            this.peer.destroy();
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