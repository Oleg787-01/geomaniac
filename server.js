const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ── Audio cache (OpenAI TTS) ──
const AUDIO_CACHE_DIR = path.join(__dirname, 'audio_cache');
if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
app.use('/audio', express.static(AUDIO_CACHE_DIR));

app.use(express.static(path.join(__dirname, 'public')));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateLanguageAudio(text, gender) {
  const hash = crypto.createHash('md5').update(text + '|' + gender).digest('hex');
  const filename = `${hash}.mp3`;
  const filepath = path.join(AUDIO_CACHE_DIR, filename);
  if (fs.existsSync(filepath)) return filename;
  if (!openai) throw new Error('OPENAI_API_KEY not set');
  const voice = gender === 'female' ? 'nova' : 'onyx';
  const mp3 = await openai.audio.speech.create({ model: 'tts-1', voice, input: text, speed: 0.85 });
  fs.writeFileSync(filepath, Buffer.from(await mp3.arrayBuffer()));
  return filename;
}

const ROUNDS_PER_GAME    = 5;
const ROUND_TIME_SECONDS = 30;
const CORRECT_POINTS     = 5;
const FIRST_BONUS        = 2;
const FLAG_WIN_SCORE     = 25;
const FLAG_WRONG_PENALTY = 2;
const LANG_WIN_SCORE     = 25;
const LANG_WRONG_PENALTY = 2;

const ALL_COUNTRIES      = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'countries.json'), 'utf8'));
const OUTLINE_COUNTRIES  = ALL_COUNTRIES.filter(c => c.id);
const FLAG_COUNTRIES     = ALL_COUNTRIES.filter(c => c.alpha2);
const LANGUAGE_COUNTRIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'languages.json'), 'utf8'));

const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomCountry(pool, usedKeys) {
  const available = pool.filter(c => !usedKeys.includes(c.id || c.alpha2));
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

function removePlayerFromRoom(socketId, socketObj) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx === -1) continue;

    room.players.splice(idx, 1);
    if (socketObj) socketObj.leave(code);

    if (room.players.length === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      rooms.delete(code);
    } else {
      if (room.host === socketId) {
        room.host = room.players[0].id;
        io.to(code).emit('newHost', { hostId: room.host });
      }
      io.to(code).emit('lobbyUpdate', { players: room.players, hostId: room.host });

      if (room.gameState === 'playing') {
        const usesFlags = room.gameMode === 'flag' || room.gameMode === 'language';
        const allDone = usesFlags
          ? room.players.every(p => room.flagGuesses[p.id] !== undefined)
          : room.players.every(p => room.roundGuesses[p.id] !== undefined);
        if (allDone && room.players.length > 0) endRound(code);
      }
    }
    break;
  }
}

// ── Round management ──
async function startRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.currentRound++;
  room.gameState    = 'playing';
  room.roundGuesses = {};
  room.flagGuesses  = {};
  room.firstCorrect = null;

  const payload = {
    round: room.currentRound,
    totalRounds: room.gameMode === 'outline' ? ROUNDS_PER_GAME : null,
    gameMode: room.gameMode,
    timeLimit: ROUND_TIME_SECONDS,
    winScore: (room.gameMode === 'flag' || room.gameMode === 'language') ? room.winScore : null,
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
  };

  if (room.gameMode === 'language') {
    const available = LANGUAGE_COUNTRIES.filter(l => !room.usedCountryKeys.includes(l.name));
    const pool = available.length > 0 ? available : LANGUAGE_COUNTRIES;
    const lang = pool[Math.floor(Math.random() * pool.length)];
    room.currentCountry = lang;
    room.usedCountryKeys.push(lang.name);
    const sentence = lang.sentences[Math.floor(Math.random() * lang.sentences.length)];
    room.currentSentence = sentence;
    const gender = Math.random() < 0.5 ? 'male' : 'female';

    try {
      const audioFilename = await generateLanguageAudio(sentence, gender);
      if (!rooms.get(roomCode)) return;
      payload.audioUrl = `/audio/${audioFilename}`;
      room.currentAudioUrl = payload.audioUrl;
    } catch (err) {
      console.error('TTS error:', err.message);
      if (!rooms.get(roomCode)) return;
      payload.audioUrl = null;
    }
    room.roundStartTime = Date.now();
  } else {
    const pool    = room.gameMode === 'flag' ? FLAG_COUNTRIES : OUTLINE_COUNTRIES;
    const country = getRandomCountry(pool, room.usedCountryKeys);
    room.currentCountry = country;
    room.usedCountryKeys.push(country.id || country.alpha2);
    room.roundStartTime = Date.now();
    if (room.gameMode === 'outline') payload.countryId  = country.id;
    if (room.gameMode === 'flag')    payload.flagAlpha2 = country.alpha2;
  }

  io.to(roomCode).emit('roundStart', payload);
  room.roundTimer = setTimeout(() => endRound(roomCode), ROUND_TIME_SECONDS * 1000);
}

function endRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.gameState !== 'playing') return;

  clearTimeout(room.roundTimer);
  room.roundTimer = null;
  room.gameState  = 'roundEnd';

  let playerResults = [];
  let flagHasWinner = false;

  if (room.gameMode === 'flag' || room.gameMode === 'language') {
    const correctSubs = Object.entries(room.flagGuesses)
      .filter(([, g]) => g.correct)
      .sort((a, b) => a[1].submittedAt - b[1].submittedAt);
    const firstCorrectId = correctSubs.length > 0 ? correctSubs[0][0] : null;

    room.players.forEach(p => {
      const g = room.flagGuesses[p.id];
      let points = 0;
      let isFirst = false;

      if (g && g.correct) {
        isFirst = p.id === firstCorrectId;
        if (room.gameMode === 'language') {
          const elapsed = (g.submittedAt - room.roundStartTime) / 1000;
          const base = elapsed <= 10 ? 5 : elapsed <= 20 ? 3 : 2;
          points = base + (isFirst ? FIRST_BONUS : 0);
        } else {
          points = CORRECT_POINTS + (isFirst ? FIRST_BONUS : 0);
        }
      } else if (g && !g.correct && !g.gaveUp) {
        points = room.gameMode === 'language' ? -LANG_WRONG_PENALTY : -FLAG_WRONG_PENALTY;
      }

      p.score += points;
      playerResults.push({
        id: p.id, name: p.name,
        correct: !!(g && g.correct),
        submitted: !!g,
        gaveUp: !!(g && g.gaveUp),
        points,
        isFirst,
        totalScore: p.score,
        elapsed: g ? Math.round((g.submittedAt - room.roundStartTime) / 1000) : null,
      });
    });

    flagHasWinner = (room.gameMode === 'flag' || room.gameMode === 'language') &&
      room.players.some(p => p.score >= room.winScore);
  } else {
    room.players.forEach(p => {
      playerResults.push({
        id: p.id, name: p.name,
        correct: room.roundGuesses[p.id] === true,
        submitted: room.roundGuesses[p.id] !== undefined,
        points: null,
        isFirst: room.firstCorrect === p.id,
        totalScore: p.score,
      });
    });
  }

  io.to(roomCode).emit('roundEnd', {
    correctAnswer: room.currentCountry.name,
    scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
    playerResults,
    round: room.currentRound,
    totalRounds: room.gameMode === 'outline' ? ROUNDS_PER_GAME : null,
    gameMode: room.gameMode,
  });

  const shouldEnd =
    (room.gameMode === 'outline'  && room.currentRound >= ROUNDS_PER_GAME) ||
    ((room.gameMode === 'flag' || room.gameMode === 'language') && flagHasWinner);

  setTimeout(() => shouldEnd ? endGame(roomCode) : startRound(roomCode), 4000);
}

function endGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.gameState = 'gameEnd';
  const sorted   = [...room.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const topGroup = sorted.filter(p => p.score === topScore);
  const isDraw   = topGroup.length > 1;

  io.to(roomCode).emit('gameEnd', {
    results: sorted.map(p => ({ id: p.id, name: p.name, score: p.score })),
    winner: isDraw ? null : sorted[0],
    isDraw,
    drawPlayers: isDraw ? topGroup.map(p => p.name) : [],
  });
}

// ── Socket handlers ──
io.on('connection', (socket) => {

  socket.on('createRoom', ({ name, avatar }) => {
    if (!name || !name.trim()) return;
    const code = generateRoomCode();
    const room = {
      code,
      host: socket.id,
      players: [{ id: socket.id, name: name.trim(), score: 0, avatar: avatar || null }],
      gameState: 'lobby',
      gameMode: 'outline',
      winScore: 25,
      roomName: `${name.trim()}'s Room`,
      isPublic: true,
      currentRound: 0,
      currentCountry: null,
      currentSentence: null,
      roundStartTime: null,
      roundGuesses: {},
      flagGuesses: {},
      firstCorrect: null,
      roundTimer: null,
      usedCountryKeys: [],
      currentAudioUrl: null,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, players: room.players, isHost: true, hostId: room.host, gameMode: room.gameMode, winScore: room.winScore, roomName: room.roomName, isPublic: room.isPublic });
  });

  socket.on('joinRoom', ({ code, name, avatar }) => {
    if (!name || !name.trim()) return;
    const room = rooms.get((code || '').toUpperCase().trim());
    if (!room)                       { socket.emit('joinError', { message: 'Room not found.' }); return; }
    if (room.gameState === 'gameEnd'){ socket.emit('joinError', { message: 'This game has already ended.' }); return; }
    if (room.players.length >= 8)    { socket.emit('joinError', { message: 'Room is full (max 8).' }); return; }

    room.players.push({ id: socket.id, name: name.trim(), score: 0, avatar: avatar || null });
    socket.join(room.code);

    if (room.gameState === 'lobby') {
      socket.emit('roomJoined', { code: room.code, players: room.players, isHost: false, hostId: room.host, gameMode: room.gameMode, winScore: room.winScore, roomName: room.roomName, isPublic: room.isPublic });
      socket.to(room.code).emit('lobbyUpdate', { players: room.players, hostId: room.host });
    } else {
      // Mid-game join: auto-skip this round for the new player
      if (room.gameMode === 'flag' || room.gameMode === 'language') {
        room.flagGuesses[socket.id] = { guess: null, correct: false, gaveUp: true, submittedAt: Date.now() };
      } else {
        room.roundGuesses[socket.id] = false;
      }

      const timeElapsed  = room.roundStartTime ? Math.floor((Date.now() - room.roundStartTime) / 1000) : ROUND_TIME_SECONDS;
      const timeRemaining = Math.max(0, ROUND_TIME_SECONDS - timeElapsed);

      const midPayload = {
        code: room.code,
        players: room.players,
        isHost: false,
        gameMode: room.gameMode,
        winScore: room.winScore,
        midGame: true,
        gameState: room.gameState,
        round: room.currentRound,
        totalRounds: room.gameMode === 'outline' ? ROUNDS_PER_GAME : null,
        timeLimit: ROUND_TIME_SECONDS,
        timeRemaining,
        scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
      };
      if (room.gameMode === 'outline')  midPayload.countryId  = room.currentCountry && room.currentCountry.id;
      if (room.gameMode === 'flag')     midPayload.flagAlpha2 = room.currentCountry && room.currentCountry.alpha2;
      if (room.gameMode === 'language') midPayload.audioUrl   = room.currentAudioUrl;

      socket.emit('roomJoined', midPayload);
      socket.to(room.code).emit('lobbyUpdate', { players: room.players, hostId: room.host });
    }
  });

  socket.on('leaveRoom', () => {
    removePlayerFromRoom(socket.id, socket);
  });

  socket.on('changeGameMode', ({ gameMode }) => {
    if (!['outline', 'flag', 'language'].includes(gameMode)) return;
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'lobby') {
        room.gameMode = gameMode;
        io.to(code).emit('gameModeChanged', { gameMode, winScore: room.winScore });
        return;
      }
    }
  });

  socket.on('changeWinScore', ({ winScore }) => {
    if (![25, 50, 75, 100].includes(winScore)) return;
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'lobby') {
        room.winScore = winScore;
        io.to(code).emit('winScoreChanged', { winScore });
        return;
      }
    }
  });

  socket.on('startGame', () => {
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'lobby') {
        room.players.forEach(p => { p.score = 0; });
        room.currentRound    = 0;
        room.usedCountryKeys = [];
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

      if (room.gameMode === 'flag' || room.gameMode === 'language') {
        if (room.flagGuesses[socket.id] !== undefined) return;

        const correct = isGuessCorrect(guess, room.currentCountry);
        room.flagGuesses[socket.id] = { guess: guess.trim(), correct, submittedAt: Date.now() };

        socket.emit('guessSubmitted');
        socket.to(code).emit('playerSubmitted', { playerName: player.name });

        const allIn = room.players.every(p => room.flagGuesses[p.id] !== undefined);
        if (allIn) endRound(code);

      } else {
        if (room.roundGuesses[socket.id] !== undefined) return;

        const correct = isGuessCorrect(guess, room.currentCountry);
        room.roundGuesses[socket.id] = correct;

        if (correct) {
          const isFirst = room.firstCorrect === null;
          if (isFirst) room.firstCorrect = socket.id;
          const points = CORRECT_POINTS + (isFirst ? FIRST_BONUS : 0);
          player.score += points;
          socket.emit('guessResult', { correct: true, points, isFirst, totalScore: player.score });
          socket.to(code).emit('playerGuessed', { playerName: player.name, correct: true, isFirst });
        } else {
          socket.emit('guessResult', { correct: false, totalScore: player.score });
          socket.to(code).emit('playerGuessed', { playerName: player.name, correct: false });
        }

        const allDone = room.players.every(p => room.roundGuesses[p.id] !== undefined);
        if (allDone) endRound(code);
      }
      return;
    }
  });

  socket.on('giveUp', () => {
    for (const [code, room] of rooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (!player) continue;
      if (room.gameState !== 'playing') return;

      if (room.gameMode === 'flag' || room.gameMode === 'language') {
        if (room.flagGuesses[socket.id] !== undefined) return;
        room.flagGuesses[socket.id] = { guess: null, correct: false, gaveUp: true, submittedAt: Date.now() };
        socket.emit('guessSubmitted', { gaveUp: true });
        socket.to(code).emit('playerSubmitted', { playerName: player.name });
        const allIn = room.players.every(p => room.flagGuesses[p.id] !== undefined);
        if (allIn) endRound(code);
      } else {
        if (room.roundGuesses[socket.id] !== undefined) return;
        room.roundGuesses[socket.id] = false;
        socket.emit('guessResult', { correct: false, gaveUp: true, totalScore: player.score });
        socket.to(code).emit('playerGuessed', { playerName: player.name, correct: false });
        const allDone = room.players.every(p => room.roundGuesses[p.id] !== undefined);
        if (allDone) endRound(code);
      }
      return;
    }
  });

  socket.on('changeRoomName', ({ roomName }) => {
    const name = (roomName || '').trim();
    if (!name) return;
    for (const [code, room] of rooms) {
      if (room.host === socket.id) {
        room.roomName = name;
        io.to(code).emit('roomNameChanged', { roomName: name });
        return;
      }
    }
  });

  socket.on('changeRoomPrivacy', ({ isPublic }) => {
    for (const [code, room] of rooms) {
      if (room.host === socket.id) {
        room.isPublic = !!isPublic;
        io.to(code).emit('roomPrivacyChanged', { isPublic: room.isPublic });
        return;
      }
    }
  });

  socket.on('playAgain', () => {
    for (const [code, room] of rooms) {
      if (room.host === socket.id && room.gameState === 'gameEnd') {
        room.players.forEach(p => { p.score = 0; });
        room.currentRound    = 0;
        room.usedCountryKeys = [];
        room.gameState       = 'lobby';
        io.to(code).emit('backToLobby', { players: room.players, hostId: room.host, gameMode: room.gameMode, winScore: room.winScore, roomName: room.roomName, isPublic: room.isPublic });
        return;
      }
    }
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket.id, null);
  });
});

// ── Public room browser API ──
app.get('/api/rooms', (req, res) => {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.isPublic && room.gameState !== 'gameEnd') {
      list.push({
        code,
        roomName: room.roomName,
        hostName: room.players[0] ? room.players[0].name : 'Unknown',
        playerCount: room.players.length,
        gameMode: room.gameMode,
        gameState: room.gameState,
      });
    }
  }
  res.json(list);
});

// Catch-all: serve index.html for any non-file route (enables room-code URLs)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GeoManiac running at http://localhost:${PORT}`));
