/* ── GeoManiac — client app ── */

const socket = io();

// ── State ──
let myName = '';
let myRoomCode = '';
let isHost = false;
let myId = null;
let worldData = null;        // loaded TopoJSON
let countriesData = [];      // loaded from countries.json
let timerInterval = null;
let timerSeconds = 60;
let roundActive = false;
let hasGuessedThisRound = false;

// ── Colour palette for avatars ──
const AVATAR_COLORS = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#ff7b72','#39d353','#56d364'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name) { return name.slice(0, 2).toUpperCase(); }

// ── Screen switching ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Landing ──
const $name      = document.getElementById('player-name');
const $btnCreate = document.getElementById('btn-create');
const $btnShowJoin = document.getElementById('btn-show-join');
const $joinPanel = document.getElementById('join-panel');
const $roomCodeInput = document.getElementById('room-code-input');
const $btnJoin   = document.getElementById('btn-join');
const $landingError = document.getElementById('landing-error');

function showLandingError(msg) {
  $landingError.textContent = msg;
  $landingError.classList.remove('hidden');
}
function clearLandingError() { $landingError.classList.add('hidden'); }

$btnShowJoin.addEventListener('click', () => {
  $joinPanel.classList.toggle('hidden');
  if (!$joinPanel.classList.contains('hidden')) $roomCodeInput.focus();
});

$btnCreate.addEventListener('click', () => {
  const name = $name.value.trim();
  if (!name) { showLandingError('Enter your name first.'); return; }
  clearLandingError();
  socket.emit('createRoom', { name });
});

$btnJoin.addEventListener('click', doJoin);
$roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = $name.value.trim();
  const code = $roomCodeInput.value.trim().toUpperCase();
  if (!name) { showLandingError('Enter your name first.'); return; }
  if (!code) { showLandingError('Enter a room code.'); return; }
  clearLandingError();
  socket.emit('joinRoom', { name, code });
}

$name.addEventListener('keydown', e => { if (e.key === 'Enter') $btnCreate.click(); });

// ── Lobby ──
const $displayCode  = document.getElementById('display-room-code');
const $btnCopyCode  = document.getElementById('btn-copy-code');
const $playerList   = document.getElementById('player-list');
const $playerCount  = document.getElementById('player-count');
const $hostControls = document.getElementById('lobby-host-controls');
const $lobbyWaiting = document.getElementById('lobby-waiting');
const $btnStart     = document.getElementById('btn-start');
const $lobbyError   = document.getElementById('lobby-error');

function showLobbyError(msg) {
  $lobbyError.textContent = msg;
  $lobbyError.classList.remove('hidden');
}

$btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    $btnCopyCode.textContent = 'Copied!';
    setTimeout(() => { $btnCopyCode.textContent = 'Copy'; }, 1500);
  });
});

$btnStart.addEventListener('click', () => {
  socket.emit('startGame');
});

function renderPlayerList(players) {
  $playerList.innerHTML = '';
  $playerCount.textContent = `(${players.length}/8)`;
  players.forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span');
    av.className = 'player-avatar';
    av.textContent = initials(p.name);
    av.style.background = avatarColor(p.name);
    li.appendChild(av);
    li.appendChild(document.createTextNode(p.name));
    if (p.id === socket.id || (p.id === undefined && p.name === myName)) {
      // mark self — skip for simplicity, server doesn't send ids in lobby update after join
    }
    li.appendChild(document.createTextNode(' '));
    // host badge handled separately
    $playerList.appendChild(li);
  });
}

// ── GAME ──
const $currentRound = document.getElementById('current-round');
const $totalRounds  = document.getElementById('total-rounds');
const $timerBarFill = document.getElementById('timer-bar-fill');
const $timerText    = document.getElementById('timer-text');
const $guessInput   = document.getElementById('guess-input');
const $btnSubmit    = document.getElementById('btn-submit-guess');
const $btnGiveUp    = document.getElementById('btn-give-up');
const $guessFeedback = document.getElementById('guess-feedback');
const $guessArea    = document.getElementById('guess-area');
const $scoreList    = document.getElementById('score-list');
const $guessedList  = document.getElementById('guessed-list');
const $roundOverlay = document.getElementById('round-overlay');
const $overlayCountry = document.getElementById('overlay-country-name');
const $overlayPoints  = document.getElementById('overlay-points');
const $overlayNextText = document.getElementById('overlay-next-text');
const $svgEl        = document.getElementById('country-svg');
const $svgLoading   = document.getElementById('svg-loading');

// Load world atlas and countries once
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json()),
  fetch('/countries.json').then(r => r.json()),
]).then(([topo, countries]) => {
  worldData = topo;
  // Deduplicate countries by id
  const seen = new Set();
  countriesData = countries.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id); return true;
  });
  $svgLoading.style.display = 'none';
}).catch(() => {
  $svgLoading.textContent = 'Failed to load map data.';
});

function renderCountry(countryId) {
  if (!worldData) return;

  const features = topojson.feature(worldData, worldData.objects.countries).features;
  const feature = features.find(f => String(f.id) === String(countryId));
  if (!feature) {
    $svgLoading.style.display = 'block';
    $svgLoading.textContent = 'Country outline unavailable.';
    return;
  }

  $svgLoading.style.display = 'none';
  $svgEl.innerHTML = '';

  const width = 500, height = 400;
  const projection = d3.geoMercator().fitExtent([[20, 20], [width - 20, height - 20]], feature);
  const path = d3.geoPath().projection(projection);

  const svgD3 = d3.select($svgEl).attr('viewBox', `0 0 ${width} ${height}`);
  svgD3.append('path')
    .datum(feature)
    .attr('d', path)
    .attr('fill', '#111')
    .attr('stroke', '#333')
    .attr('stroke-width', 1.5);
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  timerSeconds = seconds;
  updateTimerDisplay(seconds, seconds);
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay(timerSeconds, seconds);
    if (timerSeconds <= 0) clearInterval(timerInterval);
  }, 1000);
}

function updateTimerDisplay(current, total) {
  const pct = Math.max(0, (current / total)) * 100;
  $timerBarFill.style.width = pct + '%';
  $timerText.textContent = current;
  if (pct > 50) {
    $timerBarFill.style.background = 'var(--green)';
  } else if (pct > 25) {
    $timerBarFill.style.background = 'var(--yellow)';
  } else {
    $timerBarFill.style.background = 'var(--red)';
  }
}

function renderScores(scores) {
  $scoreList.innerHTML = '';
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  sorted.forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span');
    av.className = 'player-avatar';
    av.style.background = avatarColor(p.name);
    av.style.width = '22px'; av.style.height = '22px'; av.style.fontSize = '0.7rem';
    av.textContent = initials(p.name);
    const nameEl = document.createElement('span');
    nameEl.className = 'score-name';
    nameEl.textContent = p.name;
    const pts = document.createElement('span');
    pts.className = 'score-pts';
    pts.textContent = p.score + ' pts';
    li.appendChild(av); li.appendChild(nameEl); li.appendChild(pts);
    $scoreList.appendChild(li);
  });
}

function setGuessState(disabled) {
  $guessInput.disabled = disabled;
  $btnSubmit.disabled = disabled;
  $btnGiveUp.disabled = disabled;
}

function showGuessFeedback(msg, type) {
  $guessFeedback.textContent = msg;
  $guessFeedback.className = 'guess-feedback ' + type;
}

$btnSubmit.addEventListener('click', submitGuess);
$guessInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });

function submitGuess() {
  const g = $guessInput.value.trim();
  if (!g || !roundActive || hasGuessedThisRound) return;
  socket.emit('submitGuess', { guess: g });
}

$btnGiveUp.addEventListener('click', () => {
  if (!roundActive || hasGuessedThisRound) return;
  socket.emit('giveUp');
});

// Results
const $winnerBanner    = document.getElementById('winner-banner');
const $resultsList     = document.getElementById('results-list');
const $resultsHostCtrl = document.getElementById('results-host-controls');
const $resultsWaiting  = document.getElementById('results-waiting');
const $btnPlayAgain    = document.getElementById('btn-play-again');

$btnPlayAgain.addEventListener('click', () => {
  socket.emit('playAgain');
});

// ── Socket events ──

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('roomCreated', ({ code, players }) => {
  myRoomCode = code;
  isHost = true;
  $displayCode.textContent = code;
  renderPlayerList(players);
  $hostControls.classList.remove('hidden');
  $lobbyWaiting.classList.add('hidden');
  showScreen('screen-lobby');
});

socket.on('roomJoined', ({ code, players }) => {
  myRoomCode = code;
  isHost = false;
  $displayCode.textContent = code;
  renderPlayerList(players);
  $hostControls.classList.add('hidden');
  $lobbyWaiting.classList.remove('hidden');
  showScreen('screen-lobby');
});

socket.on('joinError', ({ message }) => {
  showLandingError(message);
});

socket.on('lobbyUpdate', ({ players }) => {
  renderPlayerList(players);
});

socket.on('newHost', ({ hostId }) => {
  if (hostId === socket.id) {
    isHost = true;
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
  }
});

socket.on('startError', ({ message }) => {
  showLobbyError(message);
});

socket.on('roundStart', ({ round, totalRounds, countryId, timeLimit }) => {
  // Reset state
  hasGuessedThisRound = false;
  roundActive = true;
  $guessedList.innerHTML = '';
  $guessFeedback.className = 'guess-feedback hidden';
  $guessInput.value = '';
  setGuessState(false);
  $roundOverlay.classList.add('hidden');

  $currentRound.textContent = round;
  $totalRounds.textContent = totalRounds;

  renderCountry(countryId);
  startTimer(timeLimit);
  showScreen('screen-game');
});

socket.on('guessResult', ({ correct, points, isFirst, gaveUp, totalScore }) => {
  hasGuessedThisRound = true;
  setGuessState(true);
  if (correct) {
    let msg = `Correct! +${points} pts`;
    if (isFirst) msg += ' 🏆 First!';
    showGuessFeedback(msg, 'correct');
  } else if (gaveUp) {
    showGuessFeedback('You gave up this round.', 'gave-up');
  } else {
    showGuessFeedback('Wrong! Keep trying... oh wait, you can\'t.', 'wrong');
    // Actually let them try again — wrong guess doesn't lock them out
    // Re-enable:
    hasGuessedThisRound = false;
    setGuessState(false);
    $guessInput.value = '';
    showGuessFeedback('Wrong guess, try again!', 'wrong');
    setTimeout(() => { $guessFeedback.className = 'guess-feedback hidden'; }, 1800);
  }
});

socket.on('playerGuessed', ({ playerName, correct, isFirst }) => {
  const li = document.createElement('li');
  li.className = correct ? 'correct' : 'wrong';
  let text = playerName + (correct ? (isFirst ? ' ✓ first!' : ' ✓') : ' ✗');
  li.textContent = text;
  $guessedList.appendChild(li);
});

socket.on('roundEnd', ({ correctAnswer, scores, round, totalRounds }) => {
  roundActive = false;
  clearInterval(timerInterval);
  setGuessState(true);

  $overlayCountry.textContent = correctAnswer;
  $overlayNextText.textContent = round >= totalRounds ? 'Calculating final scores...' : 'Next round starting in 4s...';
  $roundOverlay.classList.remove('hidden');

  renderScores(scores);
});

socket.on('gameEnd', ({ results, winner }) => {
  $roundOverlay.classList.add('hidden');

  $winnerBanner.textContent = winner ? `🏆 Winner: ${winner.name} (${winner.score} pts)` : 'Game Over!';

  $resultsList.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  results.forEach((p, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = medals[i] || (i + 1) + '.';
    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = p.name;
    const score = document.createElement('span');
    score.className = 'result-score';
    score.textContent = p.score + ' pts';
    li.appendChild(rank); li.appendChild(name); li.appendChild(score);
    $resultsList.appendChild(li);
  });

  if (isHost) {
    $resultsHostCtrl.classList.remove('hidden');
    $resultsWaiting.classList.add('hidden');
  } else {
    $resultsHostCtrl.classList.add('hidden');
    $resultsWaiting.classList.remove('hidden');
  }

  showScreen('screen-results');
});

socket.on('backToLobby', ({ players }) => {
  renderPlayerList(players);
  if (isHost) {
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
  } else {
    $hostControls.classList.add('hidden');
    $lobbyWaiting.classList.remove('hidden');
  }
  showScreen('screen-lobby');
});

socket.on('disconnect', () => {
  // Optionally show a reconnect notice
  console.warn('Disconnected from server');
});
