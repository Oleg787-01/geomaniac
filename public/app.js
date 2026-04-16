/* ── GeoManiac client ── */

const socket = io();

let myName = '';
let myRoomCode = '';
let isHost = false;
let myId = null;
let currentGameMode = 'outline';
let worldData = null;
let countriesData = [];
let timerInterval = null;
let roundActive = false;
let hasGuessedCorrectly = false; // prevents re-submitting after correct
let flagModeActive = false;       // true = multiple guesses allowed

const AVATAR_COLORS = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#ff7b72','#39d353','#56d364'];
function avatarColor(n) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))&0xffffffff; return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function initials(n) { return n.slice(0,2).toUpperCase(); }

function showScreen(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function saveName(n)  { localStorage.setItem('geoManiacName', n); }
function loadName()   { return localStorage.getItem('geoManiacName')||''; }
function clearName()  { localStorage.removeItem('geoManiacName'); }

function goHome() {
  const saved = loadName();
  if (saved) { myName = saved; showGamemodeScreen(); }
  else { showScreen('screen-landing'); }
}

['logo-gamemode','logo-room','logo-lobby','logo-game','logo-results'].forEach(id => {
  document.getElementById(id).addEventListener('click', goHome);
});

// ════ LANDING ════
const $nameInput    = document.getElementById('player-name');
const $btnContinue  = document.getElementById('btn-continue');
const $landingError = document.getElementById('landing-error');

$btnContinue.addEventListener('click', doLandingContinue);
$nameInput.addEventListener('keydown', e => { if(e.key==='Enter') doLandingContinue(); });

function doLandingContinue() {
  const name = $nameInput.value.trim();
  if (!name) { $landingError.textContent='Please enter your name.'; $landingError.classList.remove('hidden'); return; }
  myName = name; saveName(name); showGamemodeScreen();
}

// ════ GAMEMODE ════
const $gmPlayerName = document.getElementById('gamemode-player-name');
const $gmAvatar     = document.getElementById('gamemode-avatar');

function showGamemodeScreen() {
  $gmPlayerName.textContent = myName;
  $gmAvatar.textContent = initials(myName);
  $gmAvatar.style.background = avatarColor(myName);
  showScreen('screen-gamemode');
}

document.getElementById('btn-change-name').addEventListener('click', () => {
  clearName(); myName = ''; $nameInput.value = ''; $landingError.classList.add('hidden');
  showScreen('screen-landing');
});

document.getElementById('mode-outline').addEventListener('click', () => openRoom('outline'));
document.getElementById('mode-flag').addEventListener('click',    () => openRoom('flag'));

function openRoom(mode) {
  currentGameMode = mode;
  document.getElementById('room-mode-label').textContent = mode === 'flag' ? 'Guess the Flag' : 'Outline Guess';
  document.getElementById('room-code-input').value = '';
  document.getElementById('room-error').classList.add('hidden');
  showScreen('screen-room');
}

// ════ ROOM ════
const $roomCodeInput = document.getElementById('room-code-input');
const $roomError     = document.getElementById('room-error');

function showRoomError(msg) { $roomError.textContent=msg; $roomError.classList.remove('hidden'); }

document.getElementById('btn-create-room').addEventListener('click', () => {
  $roomError.classList.add('hidden');
  socket.emit('createRoom', { name: myName });
});

document.getElementById('btn-join-room').addEventListener('click', doJoinRoom);
$roomCodeInput.addEventListener('keydown', e => { if(e.key==='Enter') doJoinRoom(); });

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

document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    const btn = document.getElementById('btn-copy-code');
    btn.textContent='Copied!'; setTimeout(()=>{btn.textContent='Copy';},1500);
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame', { gameMode: currentGameMode });
});

function renderPlayerList(players) {
  $playerList.innerHTML = '';
  $playerCount.textContent = `(${players.length}/8)`;
  players.forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className='player-avatar'; av.textContent=initials(p.name); av.style.background=avatarColor(p.name);
    li.appendChild(av); li.appendChild(document.createTextNode(p.name));
    $playerList.appendChild(li);
  });
}

function setLobbyMode(mode) {
  const label = mode === 'flag' ? 'Guess the Flag' : 'Outline Guess';
  document.getElementById('lobby-mode-label').textContent = label;
  const box = document.getElementById('lobby-rules-box');
  if (mode === 'flag') {
    box.innerHTML = `<h3>Guess the Flag</h3><ul class="rules-list">
      <li>A country's flag is shown each round</li>
      <li>Multiple guesses allowed — but wrong answers cost points</li>
      <li>First correct: <strong>+7 pts</strong> &nbsp; Other correct: <strong>+5 pts</strong></li>
      <li>Wrong guess: <strong>−2 pts</strong></li>
      <li>First player to reach <strong>25 points wins!</strong></li>
    </ul>`;
  } else {
    box.innerHTML = `<h3>Outline Guess</h3><ul class="rules-list">
      <li>A country silhouette is shown each round</li>
      <li>One guess per round</li>
      <li>First correct: <strong>+7 pts</strong> &nbsp; Other correct: <strong>+5 pts</strong></li>
      <li>5 rounds total — most points wins!</li>
    </ul>`;
  }
}

// ════ GAME ════
const $roundInfoText = document.getElementById('round-info-text');
const $timerBarFill  = document.getElementById('timer-bar-fill');
const $timerText     = document.getElementById('timer-text');
const $guessInput    = document.getElementById('guess-input');
const $btnSubmit     = document.getElementById('btn-submit-guess');
const $btnGiveUp     = document.getElementById('btn-give-up');
const $guessFeedback = document.getElementById('guess-feedback');
const $scoreList     = document.getElementById('score-list');
const $guessedList   = document.getElementById('guessed-list');
const $roundOverlay  = document.getElementById('round-overlay');
const $overlayCountry = document.getElementById('overlay-country-name');
const $overlayNextText = document.getElementById('overlay-next-text');
const $svgEl         = document.getElementById('country-svg');
const $svgLoading    = document.getElementById('svg-loading');
const $flagImg       = document.getElementById('flag-img');
const $winTarget     = document.getElementById('win-target');
const $displayOutline = document.getElementById('display-outline');
const $displayFlag   = document.getElementById('display-flag');

// Load map data
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r=>r.json()),
  fetch('/countries.json').then(r=>r.json()),
]).then(([topo, countries]) => {
  worldData = topo;
  const seen = new Set();
  countriesData = countries.filter(c => { if(seen.has(c.id||c.alpha2)) return false; seen.add(c.id||c.alpha2); return true; });
  $svgLoading.style.display = 'none';
}).catch(() => { $svgLoading.textContent = 'Failed to load map data.'; });

function renderCountry(countryId) {
  if (!worldData) return;
  const features = topojson.feature(worldData, worldData.objects.countries).features;
  const feature = features.find(f => String(f.id) === String(countryId));
  if (!feature) { $svgLoading.style.display='block'; $svgLoading.textContent='Outline unavailable.'; return; }
  $svgLoading.style.display = 'none';
  $svgEl.innerHTML = '';
  const w=500, h=400;
  const proj = d3.geoMercator().fitExtent([[20,20],[w-20,h-20]], feature);
  const path = d3.geoPath().projection(proj);
  d3.select($svgEl).attr('viewBox',`0 0 ${w} ${h}`).append('path').datum(feature)
    .attr('d',path).attr('fill','#111').attr('stroke','#333').attr('stroke-width',1.5);
}

function showFlag(alpha2) {
  $flagImg.src = `https://flagcdn.com/w640/${alpha2}.png`;
  $flagImg.alt = 'Flag to identify';
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  updateTimerDisplay(seconds, seconds);
  timerInterval = setInterval(() => {
    seconds--;
    updateTimerDisplay(seconds, seconds > 0 ? 30 : 30);
    if (seconds <= 0) clearInterval(timerInterval);
  }, 1000);
}

// Fix: track total for percentage
let timerTotal = 30;
function startTimerFixed(seconds) {
  clearInterval(timerInterval);
  timerTotal = seconds;
  updateTimerDisplay(seconds, seconds);
  timerInterval = setInterval(() => {
    seconds--;
    updateTimerDisplay(seconds, timerTotal);
    if (seconds <= 0) clearInterval(timerInterval);
  }, 1000);
}

function updateTimerDisplay(current, total) {
  const pct = Math.max(0, current/total)*100;
  $timerBarFill.style.width = pct+'%';
  $timerText.textContent = current;
  $timerBarFill.style.background = pct>50?'var(--green)':pct>25?'var(--yellow)':'var(--red)';
}

function renderScores(scores, winScore) {
  $scoreList.innerHTML = '';
  [...scores].sort((a,b)=>b.score-a.score).forEach(p => {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className='player-avatar'; av.style.cssText=`background:${avatarColor(p.name)};width:22px;height:22px;font-size:0.7rem;`; av.textContent=initials(p.name);
    const nameEl = document.createElement('span'); nameEl.className='score-name'; nameEl.textContent=p.name;
    const pts = document.createElement('span'); pts.className='score-pts';
    if (winScore && p.score >= winScore - 5) pts.classList.add('near-win');
    if (p.score < 0) pts.classList.add('negative');
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

function showFeedback(msg, type) {
  $guessFeedback.textContent = msg;
  $guessFeedback.className = 'guess-feedback ' + type;
}

$btnSubmit.addEventListener('click', submitGuess);
$guessInput.addEventListener('keydown', e => { if(e.key==='Enter') submitGuess(); });

function submitGuess() {
  const g = $guessInput.value.trim();
  if (!g || !roundActive) return;
  if (hasGuessedCorrectly) return;
  socket.emit('submitGuess', { guess: g });
  if (!flagModeActive) {
    // Outline: disable immediately on submit
    setGuessState(true);
  }
}

$btnGiveUp.addEventListener('click', () => {
  if (!roundActive || hasGuessedCorrectly) return;
  socket.emit('giveUp');
  setGuessState(true);
});

// ════ RESULTS ════
const $winnerBanner    = document.getElementById('winner-banner');
const $resultsList     = document.getElementById('results-list');
const $resultsHostCtrl = document.getElementById('results-host-controls');
const $resultsWaiting  = document.getElementById('results-waiting');

document.getElementById('btn-play-again').addEventListener('click', () => socket.emit('playAgain'));

// ════ SOCKET EVENTS ════
socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', ({ code, players }) => {
  myRoomCode = code; isHost = true;
  $displayCode.textContent = code;
  renderPlayerList(players);
  $hostControls.classList.remove('hidden');
  $lobbyWaiting.classList.add('hidden');
  setLobbyMode(currentGameMode);
  showScreen('screen-lobby');
});

socket.on('roomJoined', ({ code, players }) => {
  myRoomCode = code; isHost = false;
  $displayCode.textContent = code;
  renderPlayerList(players);
  $hostControls.classList.add('hidden');
  $lobbyWaiting.classList.remove('hidden');
  setLobbyMode(currentGameMode);
  showScreen('screen-lobby');
});

socket.on('joinError', ({ message }) => showRoomError(message));
socket.on('lobbyUpdate', ({ players }) => renderPlayerList(players));

socket.on('newHost', ({ hostId }) => {
  if (hostId === socket.id) {
    isHost = true;
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
  }
});

socket.on('startError', ({ message }) => {
  $lobbyError.textContent = message; $lobbyError.classList.remove('hidden');
});

socket.on('roundStart', ({ round, totalRounds, gameMode, countryId, flagAlpha2, timeLimit, winScore }) => {
  currentGameMode = gameMode;
  flagModeActive = gameMode === 'flag';
  hasGuessedCorrectly = false;
  roundActive = true;

  $guessedList.innerHTML = '';
  $guessFeedback.className = 'guess-feedback hidden';
  $guessInput.value = '';
  setGuessState(false);
  $roundOverlay.classList.add('hidden');

  // Round info
  if (gameMode === 'flag') {
    $roundInfoText.textContent = `Flag Mode · Round ${round}`;
    $winTarget.classList.remove('hidden');
  } else {
    $roundInfoText.textContent = `Round ${round} / ${totalRounds}`;
    $winTarget.classList.add('hidden');
  }

  // Toggle display
  if (gameMode === 'flag') {
    $displayOutline.classList.add('hidden');
    $displayFlag.classList.remove('hidden');
    showFlag(flagAlpha2);
  } else {
    $displayFlag.classList.add('hidden');
    $displayOutline.classList.remove('hidden');
    renderCountry(countryId);
  }

  startTimerFixed(timeLimit);
  showScreen('screen-game');
});

socket.on('guessResult', ({ correct, points, isFirst, penalty, gaveUp, totalScore }) => {
  if (correct) {
    hasGuessedCorrectly = true;
    setGuessState(true);
    let msg = `Correct! +${points} pts`;
    if (isFirst) msg += ' — First!';
    showFeedback(msg, 'correct');
  } else if (gaveUp) {
    hasGuessedCorrectly = true;
    setGuessState(true);
    showFeedback('You gave up this round.', 'gave-up');
  } else if (penalty) {
    // Flag mode wrong guess — keep input enabled
    $guessInput.value = '';
    $guessInput.focus();
    showFeedback(`Wrong! −${penalty} pts (${totalScore} total)`, 'penalty');
    setTimeout(() => { if (!hasGuessedCorrectly) $guessFeedback.className='guess-feedback hidden'; }, 1500);
  } else {
    // Outline mode wrong guess
    hasGuessedCorrectly = true;
    setGuessState(true);
    showFeedback('Answer Submitted', 'correct');
  }
});

socket.on('playerGuessed', ({ playerName, correct, isFirst }) => {
  const li = document.createElement('li');
  li.className = correct ? 'correct' : 'wrong';
  li.textContent = playerName + (correct ? (isFirst ? ' ✓ first!' : ' ✓') : ' ✗');
  $guessedList.appendChild(li);
});

socket.on('roundEnd', ({ correctAnswer, scores, round, totalRounds, gameMode }) => {
  roundActive = false;
  clearInterval(timerInterval);
  setGuessState(true);
  renderScores(scores, gameMode === 'flag' ? 25 : null);
  $overlayCountry.textContent = correctAnswer;
  const isLast = gameMode === 'outline' && round >= totalRounds;
  $overlayNextText.textContent = isLast ? 'Calculating final scores...' : 'Next round starting in 4s...';
  $roundOverlay.classList.remove('hidden');
});

socket.on('gameEnd', ({ results, winner, isDraw, drawPlayers }) => {
  $roundOverlay.classList.add('hidden');
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
    const li = document.createElement('li');
    const rank  = document.createElement('span'); rank.className='result-rank';  rank.textContent=medals[displayRank-1]||displayRank+'.';
    const name  = document.createElement('span'); name.className='result-name';  name.textContent=p.name;
    const score = document.createElement('span'); score.className='result-score'; score.textContent=p.score+' pts';
    li.appendChild(rank); li.appendChild(name); li.appendChild(score);
    $resultsList.appendChild(li);
  });

  if (isHost) { $resultsHostCtrl.classList.remove('hidden'); $resultsWaiting.classList.add('hidden'); }
  else        { $resultsHostCtrl.classList.add('hidden');    $resultsWaiting.classList.remove('hidden'); }
  showScreen('screen-results');
});

socket.on('backToLobby', ({ players }) => {
  renderPlayerList(players);
  setLobbyMode(currentGameMode);
  if (isHost) { $hostControls.classList.remove('hidden'); $lobbyWaiting.classList.add('hidden'); }
  else        { $hostControls.classList.add('hidden');    $lobbyWaiting.classList.remove('hidden'); }
  showScreen('screen-lobby');
});

// ════ INIT ════
(function init() {
  const saved = loadName();
  if (saved) { myName = saved; showGamemodeScreen(); }
  else showScreen('screen-landing');
})();
