const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ──
const ROUNDS_PER_GAME    = 5;
const ROUND_TIME_SECONDS = 30;
const CORRECT_POINTS     = 5;
const FIRST_BONUS        = 2;
const FLAG_WIN_SCORE     = 25;
const FLAG_WRONG_PENALTY = 2;

// ── Country data ──
const ALL_COUNTRIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'countries.json'), 'utf8')
);
const OUTLINE_COUNTRIES = ALL_COUNTRIES.filter(c => c.id);
const FLAG_COUNTRIES    = ALL_COUNTRIES.filter(c => c.alpha2);

const rooms = new Map();

// ── Helpers ──
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomCountry(pool, usedIds) {
  const available = pool.filter(c => !usedIds.includes(c.id || c.alpha2));
  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function normalizeGuess(str) {
  return str.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

function isGuessCorrect(guess, country) {
  const g = normalizeGuess(guess);
  if (normalizeGuess(country.name) === g) return true;
  return (country.aliases || []).some(a => normalizeGuess(a) === g);
}

// ── Round management ──
function startRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.currentRound++;
  room.gameState = 'playing';
  room.roundGuesses = {};
  room.firstCorrect = null;

  const pool = room.gameMode === 'flag' ? FLAG_COUNTRIES : OUTLINE_COUNTRIES;
  const country = getRandomCountry(pool, room.usedCountryKeys);
  room.currentCountry = country;
  room.usedCountryKeys.push(country.id || country.alpha2);

  const payload = {
    round: room.currentRound,
    totalRounds: room.gameMode === 'outline' ? ROUNDS_PER_GAME : null,
    gameMode: room.gameMode,
    timeLimit: ROUND_TIME_SECONDS,
    winScore: room.gameMode === 'flag' ? FLAG_WIN_SCORE : null,
  };
  if (room.gameMode === 'outline') payload.countryId = country.id;
  if (room.gameMode === 'flag')    payload.flagAlpha2 = country.alpha2;

  io.to(roomCode).emit('roundStart', payload);
  room.roundTimer = setTimeout(() => endRound(roomCode), ROUND_TIME_SECONDS * 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.gameState !== 'playing') return;

  clearTimeout(room.roundTimer);
  room.roundTimer = null;
  room.gameState = 'roundEnd';

  io.to(roomCode).emit('roundEnd', {
    correctAnswer: room.currentCountry.name,
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    round: room.currentRound,
    totalRounds: room.gameMode === 'outline' ? ROUNDS_PER_GAME : null,
    gameMode: room.gameMode,
  });

  const shouldEnd = room.gameMode === 'outline' && room.currentRound >= ROUNDS_PER_GAME;
  if (shouldEnd) {
    setTimeout(() => endGame(roomCode), 4000);
  } else {
    setTimeout(() => startRound(roomCode), 4000);
  }
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.gameState = 'gameEnd';
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const topPlayers = sorted.filter(p => p.score === topScore);
  const isDraw = topPlayers.length > 1;

  io.to(roomCode).emit('gameEnd', {
    results: sorted.map(p => ({ id: p.id, name: p.name, score: p.score })),
    winner: isDraw ? null : sorted[0],
    isDraw,
    drawPlayers: isDraw ? topPlayers.map(p => p.name) : [],
  });
}

// ── Socket handlers ──
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('createRoom', ({ name }) => {
    if (!name || !name.trim()) return;
    const code = generateRoomCode();
    const room = {
      code,
      host: socket.id,
      players: [{ id: socket.id, name: name.trim(), score: 0 }],
      gameState: 'lobby',
      gameMode: 'outline',
      currentRound: 0,
      currentCountry: null,
      roundGuesses: {},
      firstCorrect: null,
      roundTimer: null,
      usedCountryKeys: [],
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, players: room.players, isHost: true });
  });

  socket.on('joinRoom', ({ code, name }) => {
    if (!name || !name.trim()) return;
    const room = rooms.get((code || '').toUpperCase().trim());
    if (!room) { socket.emit('joinError', { message: 'Room not found.' }); return; }
    if (room.gameState !== 'lobby') { socket.emit('joinError', { message: 'Game already in progress.' }); return; }
    if (room.players.length >= 8) { socket.emit('joinError', { message: 'Room is full (max 8).' }); return; }

    room.players.push({ id: socket.id, name: name.trim(), score: 0 });
    socket.join(room.code);
    socket.emit('roomJoined', { code: room.code, players: room.players, isHost: false });
    socket.to(room.code).emit('lobbyUpdate', { players: room.players });
  });

  socket.on('startGame', ({ gameMode }) => {
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'lobby') {
        room.players.forEach(p => { p.score = 0; });
        room.currentRound = 0;
        room.usedCountryKeys = [];
        room.gameMode = gameMode || 'outline';
        startRound(code);
        return;
      }
    }
  });

  socket.on('submitGuess', ({ guess }) => {
    if (!guess || !guess.trim()) return;

    for (const [code, room] of rooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (!player) continue;
      if (room.gameState !== 'playing') return;

      const alreadyCorrect = room.roundGuesses[socket.id] === true;
      if (alreadyCorrect) return;

      // Outline mode: one guess total
      if (room.gameMode === 'outline' && room.roundGuesses[socket.id] !== undefined) return;

      const correct = isGuessCorrect(guess, room.currentCountry);

      if (correct) {
        room.roundGuesses[socket.id] = true;
        let points = CORRECT_POINTS;
        const isFirst = room.firstCorrect === null;
        if (isFirst) { room.firstCorrect = socket.id; points += FIRST_BONUS; }
        player.score += points;

        socket.emit('guessResult', { correct: true, points, isFirst, totalScore: player.score });
        socket.to(code).emit('playerGuessed', { playerName: player.name, correct: true, isFirst });

        // Flag mode: check win condition immediately
        if (room.gameMode === 'flag' && player.score >= FLAG_WIN_SCORE) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
          endGame(code);
          return;
        }

        // End round if everyone answered correctly
        const allCorrect = room.players.every(p => room.roundGuesses[p.id] === true);
        if (allCorrect) endRound(code);

      } else {
        if (room.gameMode === 'flag') {
          // Wrong in flag mode: -2 penalty, keep guessing allowed
          room.roundGuesses[socket.id] = false;
          player.score -= FLAG_WRONG_PENALTY;
          socket.emit('guessResult', { correct: false, penalty: FLAG_WRONG_PENALTY, totalScore: player.score });
        } else {
          // Wrong in outline mode: locked out for round
          room.roundGuesses[socket.id] = false;
          socket.emit('guessResult', { correct: false, totalScore: player.score });
        }
      }
      return;
    }
  });

  socket.on('giveUp', () => {
    for (const [code, room] of rooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (!player) continue;
      if (room.gameState !== 'playing') return;
      if (room.roundGuesses[socket.id] === true) return;

      room.roundGuesses[socket.id] = false;
      socket.emit('guessResult', { correct: false, gaveUp: true, totalScore: player.score });
      socket.to(code).emit('playerGuessed', { playerName: player.name, correct: false });

      if (room.gameMode === 'outline') {
        const allDone = room.players.every(p => room.roundGuesses[p.id] !== undefined);
        if (allDone) endRound(code);
      }
      return;
    }
  });

  socket.on('playAgain', () => {
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'gameEnd') {
        room.players.forEach(p => { p.score = 0; });
        room.currentRound = 0;
        room.usedCountryKeys = [];
        room.gameState = 'lobby';
        io.to(code).emit('backToLobby', { players: room.players });
        return;
      }
    }
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      room.players.splice(idx, 1);
      if (room.players.length === 0) {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        rooms.delete(code);
      } else {
        if (room.host === socket.id) {
          room.host = room.players[0].id;
          io.to(code).emit('newHost', { hostId: room.host });
        }
        io.to(code).emit('lobbyUpdate', { players: room.players });

        if (room.gameState === 'playing') {
          const allDone = room.gameMode === 'outline'
            ? room.players.every(p => room.roundGuesses[p.id] !== undefined)
            : room.players.every(p => room.roundGuesses[p.id] === true);
          if (allDone && room.players.length > 0) endRound(code);
        }
      }
      break;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GeoManiac running at http://localhost:${PORT}`));
