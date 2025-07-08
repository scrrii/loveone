# Love Run - A Romantic 2-Player Web Game

## Overview

Love Run is a romantic, 2-player web-based game designed to go viral. It's a lightweight, fast, and fully functional game that doesn't require a database. Players race to collect love points (hearts) while avoiding obstacles, and the game dynamically shows who's winning in love.

## Features

- **No Database Required**: All session data is temporary and peer-to-peer
- **Room System**: Players connect via unique room codes shared through URLs
- **Real-time Multiplayer**: Uses PeerJS for peer-to-peer connections
- **Engaging Gameplay**: Side-scrolling race with heart collection and obstacle avoidance
- **Love Compatibility**: Calculates a love score at the end of the game
- **Mobile Support**: Works on phones and tablets
- **Social Sharing**: Players can share their results on social media

## How to Play

### For Player 1 (Host):

1. Click "Create Room"
2. Enter your name
3. Select your gender
4. Choose if you are the real player or the phantom (shadow)
5. Share the generated link with your partner
6. Wait for your partner to join

### For Player 2 (Guest):

1. Open the link shared by Player 1
2. Enter your name
3. Select your gender
4. Click "Join Room"
5. The game will start automatically once connected

### Game Controls:

- **Move Left**: Left Arrow or A key
- **Move Right**: Right Arrow or D key
- **Jump**: Spacebar, Up Arrow, or tap the screen (on mobile)

## Technical Details

- **Frontend**: HTML, CSS, JavaScript
- **Multiplayer**: PeerJS for WebRTC connections
- **No Backend**: All game logic runs client-side

## Setup Instructions

1. Clone or download this repository
2. Open `index.html` in a web browser
3. No server setup required!

## Game Flow

1. **Room Creation**: Player 1 creates a room and gets a unique code
2. **Invitation**: Player 1 shares the link with Player 2
3. **Connection**: Players connect via peer-to-peer
4. **Gameplay**: 60-second race to collect hearts and avoid obstacles
5. **Results**: Love compatibility score is calculated based on performance
6. **Share**: Players can share their results or play again

## Files Structure

- `index.html`: Main HTML structure
- `styles.css`: Game styling
- `connection.js`: Handles peer-to-peer connections
- `game.js`: Core game mechanics
- `app.js`: Main application logic

## Future Enhancements

- Love Cards: Optional purchasable digital cards
- More character customization
- Additional game modes
- Enhanced visual effects

---

Enjoy playing Love Run with your special someone! ❤️