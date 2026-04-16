/* ── GeoManiac client ── */

const socket = io();

let myName         = '';
let myRoomCode     = '';
let isHost         = false;
let myId           = null;
let inRoom         = false;
let currentGameMode = 'outline';
let worldData       = null;
let countriesData   = [];
let timerInterval   = null;
let timerTotal      = 30;
let roundActive     = false;
let hasSubmitted    = false;

const AVATAR_COLORS = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#ff7b72','#39d353','#56d364'];
function avatarColor(n) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))&0xffffffff; return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function initials(n)    { return n.slice(0,2).toUpperCase(); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function saveName(n) { localStorage.setItem('geoManiacName', n); }
function loadName()  { return localStorage.getItem('geoManiacName') || ''; }
function clearName() { localStorage.removeItem('geoManiacName'); }

// ── Go home: leave room, go to home screen ──
function goHome() {
  if (inRoom) {
    socket.emit('leaveRoom');
    inRoom = false;
  }
  myRoomCode = '';
  isHost = false;
  const saved = loadName();
  if (saved) { myName = saved; showHomeScreen(); }
  else showScreen('screen-landing');
}

['logo-home','logo-lobby','logo-game','logo-results'].forEach(id => {
  document.getElementById(id).addEventListener('click', goHome);
});

// ════ LANDING ════
const $nameInput    = document.getElementById('player-name');
const $btnContinue  = document.getElementById('btn-continue');
const $landingError = document.getElementById('landing-error');

$btnContinue.addEventListener('click', doLandingContinue);
$nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLandingContinue(); });

function doLandingContinue() {
  const name = $nameInput.value.trim();
  if (!name) { $landingError.textContent = 'Please enter your name.'; $landingError.classList.remove('hidden'); return; }
  myName = name; saveName(name); showHomeScreen();
}

// ════ HOME ════
function showHomeScreen() {
  document.getElementById('home-player-name').textContent = myName;
  const av = document.getElementById('home-avatar');
  av.textContent = initials(myName); av.style.background = avatarColor(myName);
  document.getElementById('room-code-input').value = '';
  document.getElementById('room-error').classList.add('hidden');
  showScreen('screen-home');
}

document.getElementById('btn-change-name').addEventListener('click', () => {
  clearName(); myName = ''; $nameInput.value = ''; $landingError.classList.add('hidden');
  showScreen('screen-landing');
});

// ════ CREATE / JOIN ════
const $roomCodeInput = document.getElementById('room-code-input');
const $roomError     = document.getElementById('room-error');

function showRoomError(msg) { $roomError.textContent = msg; $roomError.classList.remove('hidden'); }

document.getElementById('btn-create-room').addEventListener('click', () => {
  $roomError.classList.add('hidden');
  socket.emit('createRoom', { name: myName });
});
document.getElementById('btn-join-room').addEventListener('click', doJoinRoom);
$roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoinRoom(); });

function doJoinRoom() {
  const code = $roomCodeInput.value.trim().toUpperCase();
  if (!code) { showRoomError('Enter a room code.'); return; }
  $roomError.classList.add('hidden');
  socket.emit('joinRoom', { name: myName, code });
}

// ════ LOBBY ════
const $displayCode  = document.getElementById('display-room-code');
const $playerList   = document.getElementById('player-list');
const $playerCount  = document.getElementById('player-count');
const $hostControls = document.getElementById('lobby-host-controls');
const $lobbyWaiting = document.getElementById('lobby-waiting');
const $lobbyError   = document.getElementById('lobby-error');
const $modeSelector = document.getElementById('lobby-mode-selector');

document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    const btn = document.getElementById('btn-copy-code');
    btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame');
});

// Mode picker clicks (host only)
document.getElementById('mode-opt-outline').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('changeGameMode', { gameMode: 'outline' });
});
document.getElementById('mode-opt-flag').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('changeGameMode', { gameMode: 'flag' });
});
document.getElementById('mode-opt-language').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('changeGameMode', { gameMode: 'language' });
});

function updateModePicker(mode) {
  document.getElementById('mode-opt-outline').classList.toggle('selected', mode === 'outline');
  document.getElementById('mode-opt-flag').classList.toggle('selected', mode === 'flag');
  document.getElementById('mode-opt-language').classList.toggle('selected', mode === 'language');
}

function renderPlayerList(players) {
  $playerList.innerHTML = '';
  $playerCount.textContent = `(${players.length}/8)`;
  players.forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className = 'player-avatar'; av.textContent = initials(p.name); av.style.background = avatarColor(p.name);
    li.appendChild(av); li.appendChild(document.createTextNode(p.name));
    $playerList.appendChild(li);
  });
}

function setLobbyMode(mode) {
  const labels = { outline: 'Outline Guess', flag: 'Guess the Flag', language: 'Guess the Language' };
  document.getElementById('lobby-mode-label').textContent = labels[mode] || mode;
  updateModePicker(mode);
  const box = document.getElementById('lobby-rules-box');
  if (mode === 'flag') {
    box.innerHTML = `<h3>Guess the Flag</h3><ul class="rules-list">
      <li>A country's flag is shown — one guess per round</li>
      <li>After 30 seconds the answer is revealed for everyone</li>
      <li>First correct (by submission time): <strong>+7 pts</strong></li>
      <li>Other correct answers: <strong>+5 pts</strong></li>
      <li>Wrong guess: <strong>−2 pts</strong> &nbsp;·&nbsp; No answer: <strong>0 pts</strong></li>
      <li>First player to reach <strong>25 points wins!</strong></li>
    </ul>`;
  } else if (mode === 'language') {
    box.innerHTML = `<h3>Guess the Language</h3><ul class="rules-list">
      <li>A sentence is spoken aloud — guess which language it is!</li>
      <li>Answer within <strong>10 seconds</strong>: +5 pts (or +7 if first)</li>
      <li>Answer within <strong>10–20 seconds</strong>: +3 pts (or +5 if first)</li>
      <li>Answer in <strong>last 10 seconds</strong>: +2 pts (or +4 if first)</li>
      <li>Wrong guess: <strong>−2 pts</strong> &nbsp;·&nbsp; No answer: <strong>0 pts</strong></li>
      <li>First player to reach <strong>25 points wins!</strong></li>
    </ul>`;
  } else {
    box.innerHTML = `<h3>Outline Guess</h3><ul class="rules-list">
      <li>A country silhouette is shown — one guess per round</li>
      <li>First correct: <strong>+7 pts</strong> &nbsp;·&nbsp; Other correct: <strong>+5 pts</strong></li>
      <li>5 rounds total — most points wins!</li>
    </ul>`;
  }
}

function showLobby(players, gameMode, asHost) {
  currentGameMode = gameMode || 'outline';
  renderPlayerList(players);
  setLobbyMode(currentGameMode);
  if (asHost) {
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
    $modeSelector.classList.remove('hidden');
  } else {
    $hostControls.classList.add('hidden');
    $lobbyWaiting.classList.remove('hidden');
    $modeSelector.classList.add('hidden');
  }
  $lobbyError.classList.add('hidden');
  showScreen('screen-lobby');
}

// ════ GAME ════
const $roundInfoText  = document.getElementById('round-info-text');
const $timerBarFill   = document.getElementById('timer-bar-fill');
const $timerText      = document.getElementById('timer-text');
const $guessInput     = document.getElementById('guess-input');
const $btnSubmit      = document.getElementById('btn-submit-guess');
const $btnGiveUp      = document.getElementById('btn-give-up');
const $guessFeedback  = document.getElementById('guess-feedback');
const $scoreList      = document.getElementById('score-list');
const $guessedList    = document.getElementById('guessed-list');
const $roundOverlay   = document.getElementById('round-overlay');
const $overlayCountry = document.getElementById('overlay-country-name');
const $overlayResults = document.getElementById('overlay-results');
const $overlayNextText = document.getElementById('overlay-next-text');
const $svgEl          = document.getElementById('country-svg');
const $svgLoading     = document.getElementById('svg-loading');
const $flagImg        = document.getElementById('flag-img');
const $winTarget      = document.getElementById('win-target');
const $displayOutline   = document.getElementById('display-outline');
const $displayFlag      = document.getElementById('display-flag');
const $displayLanguage  = document.getElementById('display-language');

let languageAudio = null;

document.getElementById('btn-replay-audio').addEventListener('click', () => {
  if (!languageAudio) return;
  languageAudio.currentTime = 0;
  languageAudio.play();
});

// Load map data once
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json()),
  fetch('/countries.json').then(r => r.json()),
]).then(([topo, countries]) => {
  worldData = topo;
  const seen = new Set();
  countriesData = countries.filter(c => { if (seen.has(c.id || c.alpha2)) return false; seen.add(c.id || c.alpha2); return true; });
  $svgLoading.style.display = 'none';
}).catch(() => { $svgLoading.textContent = 'Failed to load map data.'; });

function renderCountry(countryId) {
  if (!worldData) return;
  const features = topojson.feature(worldData, worldData.objects.countries).features;
  const feature  = features.find(f => String(f.id) === String(countryId));
  if (!feature) { $svgLoading.style.display = 'block'; $svgLoading.textContent = 'Outline unavailable.'; return; }
  $svgLoading.style.display = 'none';
  $svgEl.innerHTML = '';
  const w = 500, h = 400;
  const proj = d3.geoMercator().fitExtent([[20, 20], [w-20, h-20]], feature);
  const path = d3.geoPath().projection(proj);
  d3.select($svgEl).attr('viewBox', `0 0 ${w} ${h}`).append('path').datum(feature)
    .attr('d', path).attr('fill', '#111').attr('stroke', '#333').attr('stroke-width', 1.5);
}

function showFlag(alpha2) {
  $flagImg.src = `https://flagcdn.com/w640/${alpha2}.png`;
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  timerTotal = seconds;
  updateTimerDisplay(seconds);
  timerInterval = setInterval(() => {
    seconds--;
    updateTimerDisplay(seconds);
    if (seconds <= 0) clearInterval(timerInterval);
  }, 1000);
}

function updateTimerDisplay(current) {
  const pct = Math.max(0, current / timerTotal) * 100;
  $timerBarFill.style.width = pct + '%';
  $timerText.textContent = current;
  $timerBarFill.style.background = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--yellow)' : 'var(--red)';
}

function renderScores(scores) {
  $scoreList.innerHTML = '';
  [...scores].sort((a, b) => b.score - a.score).forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className = 'player-avatar';
    av.style.cssText = `background:${avatarColor(p.name)};width:22px;height:22px;font-size:0.7rem;`;
    av.textContent = initials(p.name);
    const nameEl = document.createElement('span'); nameEl.className = 'score-name'; nameEl.textContent = p.name;
    const pts = document.createElement('span'); pts.className = 'score-pts';
    if (p.score < 0) pts.classList.add('negative');
    pts.textContent = p.score + ' pts';
    li.appendChild(av); li.appendChild(nameEl); li.appendChild(pts);
    $scoreList.appendChild(li);
  });
}

function setGuessState(disabled) {
  $guessInput.disabled = disabled;
  $btnSubmit.disabled  = disabled;
  $btnGiveUp.disabled  = disabled;
}

function showFeedback(msg, type) {
  $guessFeedback.textContent = msg;
  $guessFeedback.className = 'guess-feedback ' + type;
}

$btnSubmit.addEventListener('click', submitGuess);
$guessInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });

function submitGuess() {
  const g = $guessInput.value.trim();
  if (!g || !roundActive || hasSubmitted) return;
  socket.emit('submitGuess', { guess: g });
  hasSubmitted = true;
  setGuessState(true);
  showFeedback('Answer Submitted', 'correct');
}

$btnGiveUp.addEventListener('click', () => {
  if (!roundActive || hasSubmitted) return;
  socket.emit('giveUp');
  hasSubmitted = true;
  setGuessState(true);
  showFeedback(currentGameMode === 'flag' ? 'Skipped — 0 pts this round' : 'You gave up this round.', 'gave-up');
});

// ════ RESULTS SCREEN ════
const $winnerBanner    = document.getElementById('winner-banner');
const $resultsList     = document.getElementById('results-list');
const $resultsHostCtrl = document.getElementById('results-host-controls');
const $resultsWaiting  = document.getElementById('results-waiting');

document.getElementById('btn-play-again').addEventListener('click', () => socket.emit('playAgain'));

// ════ SOCKET EVENTS ════
socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', ({ code, players, gameMode }) => {
  myRoomCode = code; isHost = true; inRoom = true;
  $displayCode.textContent = code;
  showLobby(players, gameMode, true);
});

socket.on('roomJoined', ({ code, players, gameMode }) => {
  myRoomCode = code; isHost = false; inRoom = true;
  $displayCode.textContent = code;
  showLobby(players, gameMode, false);
});

socket.on('joinError', ({ message }) => showRoomError(message));
socket.on('lobbyUpdate', ({ players }) => renderPlayerList(players));

socket.on('newHost', ({ hostId }) => {
  if (hostId === socket.id) {
    isHost = true;
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
    $modeSelector.classList.remove('hidden');
  }
});

socket.on('gameModeChanged', ({ gameMode }) => {
  currentGameMode = gameMode;
  setLobbyMode(gameMode);
});

socket.on('startError', ({ message }) => {
  $lobbyError.textContent = message; $lobbyError.classList.remove('hidden');
});

socket.on('roundStart', ({ round, totalRounds, gameMode, countryId, flagAlpha2, audioUrl, timeLimit }) => {
  if (!inRoom) return;

  currentGameMode = gameMode;
  hasSubmitted    = false;
  roundActive     = true;

  $guessedList.innerHTML = '';
  $guessFeedback.className = 'guess-feedback hidden';
  $guessInput.value = '';
  setGuessState(false);
  $roundOverlay.classList.add('hidden');
  $overlayResults.innerHTML = '';

  if (gameMode === 'flag') {
    $roundInfoText.textContent = `Flag Mode · Round ${round}`;
    $winTarget.classList.remove('hidden');
  } else if (gameMode === 'language') {
    $roundInfoText.textContent = `Language Mode · Round ${round}`;
    $winTarget.classList.remove('hidden');
  } else {
    $roundInfoText.textContent = `Round ${round} / ${totalRounds}`;
    $winTarget.classList.add('hidden');
  }

  $displayOutline.classList.add('hidden');
  $displayFlag.classList.add('hidden');
  $displayLanguage.classList.add('hidden');

  if (gameMode === 'flag') {
    $displayFlag.classList.remove('hidden');
    showFlag(flagAlpha2);
    document.getElementById('guess-prompt').textContent = 'What country is this?';
  } else if (gameMode === 'language') {
    $displayLanguage.classList.remove('hidden');
    document.getElementById('guess-prompt').textContent = 'What language is this?';
    languageAudio = null;
    if (audioUrl) {
      languageAudio = new Audio(audioUrl);
      languageAudio.play().catch(() => {});
    }
  } else {
    $displayOutline.classList.remove('hidden');
    renderCountry(countryId);
    document.getElementById('guess-prompt').textContent = 'What country is this?';
  }

  startTimer(timeLimit);
  showScreen('screen-game');
});

socket.on('guessResult', ({ correct, points, isFirst, gaveUp, totalScore }) => {
  if (correct) {
    let msg = `Correct! +${points} pts`;
    if (isFirst) msg += ' — First!';
    showFeedback(msg, 'correct');
  } else if (gaveUp) {
    showFeedback('You gave up this round.', 'gave-up');
  } else {
    showFeedback('Answer Submitted', 'correct');
  }
});

socket.on('guessSubmitted', ({ gaveUp } = {}) => {});

socket.on('playerGuessed', ({ playerName, correct, isFirst }) => {
  const li = document.createElement('li');
  li.className = correct ? 'correct' : 'wrong';
  li.textContent = playerName + (correct ? (isFirst ? ' ✓ first!' : ' ✓') : ' ✗');
  $guessedList.appendChild(li);
});

socket.on('playerSubmitted', ({ playerName }) => {
  const li = document.createElement('li');
  li.className = 'wrong';
  li.textContent = playerName + ' submitted';
  $guessedList.appendChild(li);
});

socket.on('roundEnd', ({ correctAnswer, scores, playerResults, round, totalRounds, gameMode }) => {
  roundActive = false;
  clearInterval(timerInterval);
  setGuessState(true);
  if (languageAudio) { languageAudio.pause(); languageAudio.currentTime = 0; }

  renderScores(scores);
  $overlayCountry.textContent = correctAnswer;
  $overlayResults.innerHTML = '';
  document.getElementById('overlay-label').textContent =
    gameMode === 'language' ? 'The language was' : 'The country was';

  if (playerResults && playerResults.length > 0) {
    playerResults.forEach(p => {
      const li = document.createElement('li');
      const myResult = p.id === socket.id;

      if (p.correct) {
        li.className = 'res-correct';
        let ptsText;
        if (gameMode === 'flag') {
          ptsText = `+${p.points} pts${p.isFirst ? ' · First!' : ''}`;
        } else if (gameMode === 'language') {
          const timeStr = p.elapsed !== null ? ` · ${p.elapsed}s` : '';
          ptsText = `+${p.points} pts${p.isFirst ? ' · First!' : ''}${timeStr}`;
        } else {
          ptsText = p.isFirst ? '+7 pts · First!' : '+5 pts';
        }
        li.innerHTML = `<span class="res-icon">✓</span><span class="res-name">${p.name}${myResult ? ' (you)' : ''}</span><span class="res-pts pos">${ptsText}</span>`;
      } else if (p.submitted && !p.correct && !p.gaveUp) {
        li.className = 'res-wrong';
        const ptsText = (gameMode === 'flag' || gameMode === 'language') ? `−2 pts` : '—';
        li.innerHTML = `<span class="res-icon">✗</span><span class="res-name">${p.name}${myResult ? ' (you)' : ''}</span><span class="res-pts neg">${ptsText}</span>`;
      } else {
        li.className = 'res-none';
        li.innerHTML = `<span class="res-icon">—</span><span class="res-name">${p.name}${myResult ? ' (you)' : ''}</span><span class="res-pts neu">0 pts</span>`;
      }
      $overlayResults.appendChild(li);
    });
  }

  const isLast = (gameMode === 'outline' && round >= totalRounds);
  $overlayNextText.textContent = isLast ? 'Calculating final scores...' : 'Next round in 4s...';
  $roundOverlay.classList.remove('hidden');
});

socket.on('gameEnd', ({ results, winner, isDraw, drawPlayers }) => {
  $roundOverlay.classList.add('hidden');
  inRoom = false;

  if (isDraw) {
    $winnerBanner.textContent = `🤝 It's a Draw! ${drawPlayers.join(' & ')} tied with ${results[0].score} pts`;
  } else {
    $winnerBanner.textContent = winner ? `🏆 Winner: ${winner.name} — ${winner.score} pts` : 'Game Over!';
  }

  $resultsList.innerHTML = '';
  const medals = ['🥇','🥈','🥉'];
  let displayRank = 1;
  results.forEach((p, i) => {
    if (i > 0 && p.score < results[i-1].score) displayRank = i + 1;
    const li    = document.createElement('li');
    const rank  = document.createElement('span'); rank.className  = 'result-rank';  rank.textContent  = medals[displayRank-1] || displayRank + '.';
    const name  = document.createElement('span'); name.className  = 'result-name';  name.textContent  = p.name;
    const score = document.createElement('span'); score.className = 'result-score'; score.textContent = p.score + ' pts';
    li.appendChild(rank); li.appendChild(name); li.appendChild(score);
    $resultsList.appendChild(li);
  });

  if (isHost) { $resultsHostCtrl.classList.remove('hidden'); $resultsWaiting.classList.add('hidden'); }
  else        { $resultsHostCtrl.classList.add('hidden');    $resultsWaiting.classList.remove('hidden'); }
  showScreen('screen-results');
});

socket.on('backToLobby', ({ players, gameMode }) => {
  inRoom = true;
  $displayCode.textContent = myRoomCode;
  showLobby(players, gameMode, isHost);
});

// ════ INIT ════
(function init() {
  const saved = loadName();
  if (saved) { myName = saved; showHomeScreen(); }
  else showScreen('screen-landing');
})();
