/* ── GeoManiac client ── */

const socket = io();

let myName         = '';
let myRoomCode     = '';
let isHost         = false;
let myId           = null;
let inRoom         = false;
let currentGameMode = 'outline';
let currentWinScore = 25;
let worldData       = null;
let countriesData   = [];
let timerInterval   = null;
let timerTotal      = 30;
let roundActive     = false;
let hasSubmitted    = false;

const AVATAR_COLORS = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#ff7b72','#39d353','#56d364'];
function avatarColor(n) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))&0xffffffff; return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
function initials(n)    { return n.slice(0,2).toUpperCase(); }

// ══════════════════════════════════════════
//  AVATAR SYSTEM — DiceBear avataaars
//  https://dicebear.com/styles/avataaars
// ══════════════════════════════════════════
const DICEBEAR = 'https://api.dicebear.com/9.x/avataaars/svg';

const AV_SKIN = [
  {k:'pale',       hex:'#FDDCB5'}, {k:'light',      hex:'#EDB98A'},
  {k:'tanned',     hex:'#D08B5B'}, {k:'yellow',     hex:'#F8D25C'},
  {k:'brown',      hex:'#AE5D29'}, {k:'darkBrown',  hex:'#694D3D'},
  {k:'black',      hex:'#4A312C'},
];
const AV_HAIR_COLOR = [
  {k:'black',       hex:'#1a1a1a'}, {k:'auburn',      hex:'#A55728'},
  {k:'brown',       hex:'#724133'}, {k:'brownDark',   hex:'#4A312C'},
  {k:'blonde',      hex:'#C8A951'}, {k:'blondeGolden',hex:'#E7CA68'},
  {k:'red',         hex:'#C0392B'}, {k:'pastelPink',  hex:'#F59797'},
  {k:'platinum',    hex:'#ECDCBF'}, {k:'silverGray',  hex:'#C4C4C4'},
];
const AV_TOP = [
  {k:'shortHairShortFlat',     l:'Short Flat'},
  {k:'shortHairShortRound',    l:'Short Round'},
  {k:'shortHairShortCurly',    l:'Curly'},
  {k:'shortHairShortWaved',    l:'Waved'},
  {k:'shortHairSides',         l:'Sides'},
  {k:'shortHairTheCaesar',     l:'Caesar'},
  {k:'shortHairDreads01',      l:'Dreads'},
  {k:'shortHairFrizzle',       l:'Frizzle'},
  {k:'longHairStraight',       l:'Straight'},
  {k:'longHairCurly',          l:'Long Curly'},
  {k:'longHairBigHair',        l:'Big Hair'},
  {k:'longHairBun',            l:'Bun'},
  {k:'longHairFro',            l:'Afro'},
  {k:'longHairBob',            l:'Bob'},
  {k:'longHairDreads',         l:'Long Dreads'},
  {k:'longHairMiaWallace',     l:'Mia Wallace'},
  {k:'noHair',                 l:'Bald'},
  {k:'hat',                    l:'🧢 Cap'},
  {k:'winterHat1',             l:'🧶 Beanie 1'},
  {k:'winterHat2',             l:'🧶 Beanie 2'},
  {k:'winterHat3',             l:'⛷️ Ski Hat'},
  {k:'winterHat4',             l:'🎩 Top Hat'},
  {k:'eyepatch',               l:'🏴‍☠️ Eyepatch'},
  {k:'hijab',                  l:'🧕 Hijab'},
  {k:'turban',                 l:'👳 Turban'},
];
const AV_ACCESSORIES = [
  {k:'blank',          l:'None'},
  {k:'prescription01', l:'👓 Glasses'},
  {k:'prescription02', l:'🔲 Square'},
  {k:'round',          l:'⭕ Round'},
  {k:'sunglasses',     l:'🕶️ Sunglasses'},
  {k:'wayfarers',      l:'🕶️ Wayfarers'},
  {k:'kurt',           l:'🔵 Kurt'},
];
const AV_FACIAL_HAIR = [
  {k:'blank',           l:'None'},
  {k:'moustacheFancy',  l:'Mustache'},
  {k:'moustacheMagnum', l:'Magnum'},
  {k:'beardLight',      l:'Light Beard'},
  {k:'beardMedium',     l:'Beard'},
  {k:'beardMagestic',   l:'Full Beard'},
];
const AV_CLOTHES = [
  {k:'hoodie',         l:'Hoodie'},
  {k:'shirtCrewNeck',  l:'Crew Neck'},
  {k:'shirtVNeck',     l:'V-Neck'},
  {k:'shirtScoopNeck', l:'Scoop Neck'},
  {k:'graphicShirt',   l:'Graphic Tee'},
  {k:'collarSweater',  l:'Sweater'},
  {k:'blazerShirt',    l:'Blazer'},
  {k:'blazerSweater',  l:'Blazer & Sweater'},
  {k:'overall',        l:'Overall'},
];
const AV_CLOTHES_COLOR = [
  {k:'heather',     hex:'#3C4F5C'}, {k:'blue01',      hex:'#65C9FF'},
  {k:'blue02',      hex:'#5199E4'}, {k:'blue03',      hex:'#25557C'},
  {k:'black',       hex:'#2c2c2c'}, {k:'gray01',      hex:'#E6E6E6'},
  {k:'gray02',      hex:'#929598'}, {k:'pastelBlue',  hex:'#B1E2FF'},
  {k:'pastelGreen', hex:'#A7FFC4'}, {k:'pastelOrange',hex:'#FFDEB5'},
  {k:'pastelRed',   hex:'#FFAFB9'}, {k:'pastelYellow',hex:'#FFFFB1'},
  {k:'pink',        hex:'#FF488E'}, {k:'red',         hex:'#FF5C5C'},
  {k:'white',       hex:'#F0F0F0'},
];

function defaultAvatar() {
  return {
    skinColor:       'light',
    topType:         'shortHairShortFlat',
    hairColor:       'brownDark',
    accessoriesType: 'blank',
    facialHairType:  'blank',
    facialHairColor: 'black',
    clotheType:      'hoodie',
    clotheColor:     'heather',
  };
}

function getAvatarUrl(av) {
  av = Object.assign(defaultAvatar(), av || {});
  const p = new URLSearchParams({
    skinColor:       av.skinColor,
    top:             av.topType,
    hairColor:       av.hairColor,
    accessories:     av.accessoriesType,
    facialHair:      av.facialHairType,
    facialHairColor: av.facialHairColor,
    clothes:         av.clotheType,
    clothesColor:    av.clotheColor,
    eyes:            'happy',
    eyebrows:        'defaultNatural',
    mouth:           'smile',
    backgroundColor: 'b6e3f4',
  });
  return `${DICEBEAR}?${p}`;
}

// ── Avatar image helpers ──
function avatarImg(av, size, rounded = true) {
  const url = getAvatarUrl(av);
  const r = rounded ? 'border-radius:50%;' : '';
  return `<img src="${url}" width="${size}" height="${size}" style="display:block;${r}" loading="lazy" alt="avatar"/>`;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function saveName(n) { localStorage.setItem('geoManiacName', n); }
function loadName()  { return localStorage.getItem('geoManiacName') || ''; }
function clearName() { localStorage.removeItem('geoManiacName'); }

// ── Room browser ──
const MODE_ICONS = { outline: '🗺️', flag: '🏴', language: '🔊' };
function fetchPublicRooms() {
  const $list = document.getElementById('room-browser-list');
  $list.innerHTML = '<p class="room-browser-empty">Loading...</p>';
  fetch('/api/rooms').then(r => r.json()).then(rooms => {
    $list.innerHTML = '';
    if (!rooms.length) {
      $list.innerHTML = '<p class="room-browser-empty">No public rooms right now.</p>';
      return;
    }
    rooms.forEach(room => {
      const item = document.createElement('div');
      item.className = 'room-browser-item';
      const stateCls = room.gameState === 'lobby' ? 'state-lobby' : 'state-playing';
      const stateLabel = room.gameState === 'lobby' ? 'In Lobby' : 'Playing';
      item.innerHTML = `
        <div class="rbi-info">
          <div class="rbi-name">${MODE_ICONS[room.gameMode] || ''} ${escapeHtml(room.roomName)}</div>
          <div class="rbi-meta"><span class="rbi-state ${stateCls}">${stateLabel}</span> · ${room.playerCount}/8 players</div>
        </div>
        <button class="btn btn-secondary rbi-join" data-code="${escapeHtml(room.code)}">Join</button>
      `;
      item.querySelector('.rbi-join').addEventListener('click', () => {
        document.getElementById('room-code-input').value = room.code;
        doJoinRoom();
      });
      $list.appendChild(item);
    });
  }).catch(() => {
    $list.innerHTML = '<p class="room-browser-empty">Could not load rooms.</p>';
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════
//  AVATAR CREATOR UI
// ══════════════════════════════════════════
function saveAvatar(av) { localStorage.setItem('geoManiacAvatar', JSON.stringify(av)); }
function loadAvatar()   {
  try { const s = localStorage.getItem('geoManiacAvatar'); return s ? JSON.parse(s) : null; } catch { return null; }
}

function updateAvatarPreview() {
  document.getElementById('avatar-preview').innerHTML = avatarImg(currentAvatar, 200, false);
}

function makeTypeGrid(containerId, options, currentKey, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'type-btn' + (opt.k === currentKey ? ' selected' : '');
    btn.textContent = opt.l;
    btn.addEventListener('click', () => {
      el.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onChange(opt.k);
      updateAvatarPreview();
    });
    el.appendChild(btn);
  });
}

// colors: array of {k, hex} objects; currentKey: the currently selected k value
function makeSwatchGrid(containerId, colors, currentKey, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  colors.forEach(c => {
    const sw = document.createElement('button');
    sw.className = 'color-swatch' + (c.k === currentKey ? ' selected' : '');
    sw.style.background = c.hex;
    sw.title = c.k;
    sw.addEventListener('click', () => {
      el.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      onChange(c.k);
      updateAvatarPreview();
    });
    el.appendChild(sw);
  });
}

function setupAvatarCreator() {
  // Tabs
  document.querySelectorAll('.avatar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.avatar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.avatar-tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Skin
  makeSwatchGrid('skin-swatches', AV_SKIN, currentAvatar.skinColor,
    v => { currentAvatar.skinColor = v; saveAvatar(currentAvatar); });

  // Hair & Head (top style + hair colour)
  makeTypeGrid('hair-type-btns', AV_TOP, currentAvatar.topType,
    v => { currentAvatar.topType = v; saveAvatar(currentAvatar); });
  makeSwatchGrid('hair-swatches', AV_HAIR_COLOR, currentAvatar.hairColor,
    v => { currentAvatar.hairColor = v; saveAvatar(currentAvatar); });

  // Accessories (glasses etc.)
  makeTypeGrid('accessory-btns', AV_ACCESSORIES, currentAvatar.accessoriesType,
    v => { currentAvatar.accessoriesType = v; saveAvatar(currentAvatar); });

  // Facial Hair
  makeTypeGrid('facial-hair-btns', AV_FACIAL_HAIR, currentAvatar.facialHairType,
    v => { currentAvatar.facialHairType = v; saveAvatar(currentAvatar); });
  makeSwatchGrid('facial-hair-swatches', AV_HAIR_COLOR, currentAvatar.facialHairColor,
    v => { currentAvatar.facialHairColor = v; saveAvatar(currentAvatar); });

  // Outfit (clothes style + colour)
  makeTypeGrid('shirt-type-btns', AV_CLOTHES, currentAvatar.clotheType,
    v => { currentAvatar.clotheType = v; saveAvatar(currentAvatar); });
  makeSwatchGrid('shirt-swatches', AV_CLOTHES_COLOR, currentAvatar.clotheColor,
    v => { currentAvatar.clotheColor = v; saveAvatar(currentAvatar); });

  // Done button
  document.getElementById('btn-avatar-done').addEventListener('click', () => {
    saveAvatar(currentAvatar);
    showHomeScreen();
  });
}

// ── Lobby avatar panel ──
function renderLobbyAvatarPanel(players, hostId) {
  const panel = document.getElementById('lobby-avatars-panel');
  if (!panel) return;
  panel.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'lobby-avatar-card';
    card.innerHTML = avatarImg(p.avatar || null, 88, false);
    const nameEl = document.createElement('div');
    nameEl.className = 'lac-name';
    nameEl.textContent = p.name;
    if (p.id === hostId) {
      const hEl = document.createElement('div');
      hEl.className = 'lac-host';
      hEl.textContent = '★ Host';
      card.appendChild(hEl);
    }
    card.appendChild(nameEl);
    panel.appendChild(card);
  });
}

// ── Update name chip to show avatar ──
function updateHomeChip() {
  const chipAv = document.getElementById('home-avatar');
  chipAv.innerHTML = avatarImg(currentAvatar, 36, true);
  chipAv.style.cssText = 'background:none;width:36px;height:36px;';
}

// ── Go home: leave room, go to home screen ──
function goHome() {
  if (inRoom) {
    socket.emit('leaveRoom');
    inRoom = false;
  }
  myRoomCode = '';
  isHost = false;
  window.history.pushState({}, '', '/');
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
  myName = name; saveName(name);
  // Go to avatar creator (first time) or straight to home (returning player)
  showAvatarScreen();
}

function showAvatarScreen() {
  document.getElementById('avatar-preview-name').textContent = myName;
  updateAvatarPreview();
  showScreen('screen-avatar');
}

// ════ HOME ════
function showHomeScreen() {
  document.getElementById('home-player-name').textContent = myName;
  updateHomeChip();
  document.getElementById('room-code-input').value = pendingRoomCode || '';
  pendingRoomCode = '';
  document.getElementById('room-error').classList.add('hidden');
  showScreen('screen-home');
  fetchPublicRooms();
}

document.getElementById('btn-refresh-rooms').addEventListener('click', fetchPublicRooms);

document.getElementById('btn-change-name').addEventListener('click', () => {
  clearName(); myName = ''; $nameInput.value = ''; $landingError.classList.add('hidden');
  showScreen('screen-landing');
});

// Avatar icon in chip → opens avatar editor
document.getElementById('home-avatar').style.cursor = 'pointer';
document.getElementById('home-avatar').addEventListener('click', () => showAvatarScreen());

// ════ CREATE / JOIN ════
const $roomCodeInput = document.getElementById('room-code-input');
const $roomError     = document.getElementById('room-error');

function showRoomError(msg) { $roomError.textContent = msg; $roomError.classList.remove('hidden'); }

document.getElementById('btn-create-room').addEventListener('click', () => {
  $roomError.classList.add('hidden');
  socket.emit('createRoom', { name: myName, avatar: currentAvatar });
});
document.getElementById('btn-join-room').addEventListener('click', doJoinRoom);
$roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoinRoom(); });

function doJoinRoom() {
  const code = $roomCodeInput.value.trim().toUpperCase();
  if (!code) { showRoomError('Enter a room code.'); return; }
  $roomError.classList.add('hidden');
  socket.emit('joinRoom', { name: myName, code, avatar: currentAvatar });
}

// ════ LOBBY ════
const $displayCode  = document.getElementById('display-room-code');
const $playerList   = document.getElementById('player-list');
const $playerCount  = document.getElementById('player-count');
const $hostControls = document.getElementById('lobby-host-controls');
const $lobbyWaiting = document.getElementById('lobby-waiting');
const $lobbyError   = document.getElementById('lobby-error');
const $modeSelector      = document.getElementById('lobby-mode-selector');
const $winScoreSelector  = document.getElementById('lobby-win-score-selector');

function updateWinScoreSelector(score) {
  document.querySelectorAll('.win-score-btn').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.score) === score);
  });
}

document.querySelectorAll('.win-score-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('changeWinScore', { winScore: Number(btn.dataset.score) });
  });
});

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

// ── Room name & privacy (host only) ──
function updatePrivacyButtons(isPublic) {
  document.getElementById('btn-privacy-public').classList.toggle('selected', isPublic);
  document.getElementById('btn-privacy-private').classList.toggle('selected', !isPublic);
}

document.getElementById('btn-save-room-name').addEventListener('click', () => {
  const val = document.getElementById('room-name-input').value.trim();
  if (!val || !isHost) return;
  socket.emit('changeRoomName', { roomName: val });
});
document.getElementById('room-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save-room-name').click();
});
document.getElementById('btn-privacy-public').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('changeRoomPrivacy', { isPublic: true });
});
document.getElementById('btn-privacy-private').addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('changeRoomPrivacy', { isPublic: false });
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
    const av = document.createElement('span');
    av.className = 'player-avatar';
    if (p.avatar) {
      av.innerHTML = avatarImg(p.avatar, 28, true);
      av.style.cssText = 'background:none;width:28px;height:28px;flex-shrink:0;';
    } else {
      av.textContent = initials(p.name); av.style.background = avatarColor(p.name);
    }
    li.appendChild(av);
    li.appendChild(document.createTextNode(p.name));
    $playerList.appendChild(li);
  });
}

function setLobbyMode(mode, winScore) {
  winScore = winScore || currentWinScore;
  const labels = { outline: 'Outline Guess', flag: 'Guess the Flag', language: 'Guess the Language' };
  document.getElementById('lobby-mode-label').textContent = labels[mode] || mode;
  updateModePicker(mode);
  updateWinScoreSelector(winScore);
  const needsWinScore = mode === 'flag' || mode === 'language';
  if (isHost) $winScoreSelector.classList.toggle('hidden', !needsWinScore);
  const box = document.getElementById('lobby-rules-box');
  if (mode === 'flag') {
    box.innerHTML = `<h3>Guess the Flag</h3><ul class="rules-list">
      <li>A country's flag is shown — one guess per round</li>
      <li>After 30 seconds the answer is revealed for everyone</li>
      <li>First correct (by submission time): <strong>+7 pts</strong></li>
      <li>Other correct answers: <strong>+5 pts</strong></li>
      <li>Wrong guess: <strong>−2 pts</strong> &nbsp;·&nbsp; No answer: <strong>0 pts</strong></li>
      <li>First player to reach <strong>${winScore} points wins!</strong></li>
    </ul>`;
  } else if (mode === 'language') {
    box.innerHTML = `<h3>Guess the Language</h3><ul class="rules-list">
      <li>A sentence is spoken aloud — guess which language it is!</li>
      <li>Answer within <strong>10 seconds</strong>: +5 pts (or +7 if first)</li>
      <li>Answer within <strong>10–20 seconds</strong>: +3 pts (or +5 if first)</li>
      <li>Answer in <strong>last 10 seconds</strong>: +2 pts (or +4 if first)</li>
      <li>Wrong guess: <strong>−2 pts</strong> &nbsp;·&nbsp; No answer: <strong>0 pts</strong></li>
      <li>First player to reach <strong>${winScore} points wins!</strong></li>
    </ul>`;
  } else {
    $winScoreSelector.classList.add('hidden');
    box.innerHTML = `<h3>Outline Guess</h3><ul class="rules-list">
      <li>A country silhouette is shown — one guess per round</li>
      <li>First correct: <strong>+7 pts</strong> &nbsp;·&nbsp; Other correct: <strong>+5 pts</strong></li>
      <li>5 rounds total — most points wins!</li>
    </ul>`;
  }
}

function showLobby(players, gameMode, winScore, asHost, roomName, isPublic) {
  currentGameMode = gameMode || 'outline';
  currentWinScore = winScore || 25;
  if (roomName !== undefined) currentRoomName = roomName;
  if (isPublic !== undefined) currentIsPublic = isPublic;
  currentPlayers = players;
  renderPlayerList(players);
  renderLobbyAvatarPanel(players, currentHostId);
  setLobbyMode(currentGameMode, currentWinScore);
  const $roomSettings = document.getElementById('lobby-room-settings');
  if (asHost) {
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
    $modeSelector.classList.remove('hidden');
    $roomSettings.classList.remove('hidden');
    document.getElementById('room-name-input').value = currentRoomName;
    updatePrivacyButtons(currentIsPublic);
  } else {
    $hostControls.classList.add('hidden');
    $lobbyWaiting.classList.remove('hidden');
    $modeSelector.classList.add('hidden');
    $roomSettings.classList.add('hidden');
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

let languageAudio   = null;
let pendingRoomCode = '';
let currentRoomName = '';
let currentIsPublic = true;
let currentHostId   = null;
let currentAvatar   = defaultAvatar();
let currentPlayers  = [];  // full player list with avatars

document.getElementById('btn-replay-audio').addEventListener('click', () => {
  if (!languageAudio) return;
  languageAudio.currentTime = 0;
  languageAudio.play();
});

// Load map data once
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json()),
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

function startTimerAt(current, total) {
  clearInterval(timerInterval);
  timerTotal = total;
  updateTimerDisplay(current);
  timerInterval = setInterval(() => {
    current--;
    updateTimerDisplay(current);
    if (current <= 0) clearInterval(timerInterval);
  }, 1000);
}

function startTimer(seconds) {
  startTimerAt(seconds, seconds);
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

socket.on('roomCreated', ({ code, players, hostId, gameMode, winScore, roomName, isPublic }) => {
  myRoomCode = code; isHost = true; inRoom = true; currentHostId = hostId || myId;
  $displayCode.textContent = code;
  window.history.pushState({}, '', '/' + code);
  showLobby(players, gameMode, winScore, true, roomName, isPublic);
});

socket.on('roomJoined', ({ code, players, hostId, gameMode, winScore, midGame, gameState, round, totalRounds, timeLimit, timeRemaining, countryId, flagAlpha2, audioUrl, scores, roomName, isPublic }) => {
  myRoomCode = code; isHost = false; inRoom = true; currentHostId = hostId || null;
  currentGameMode = gameMode;
  currentWinScore = winScore || 25;
  $displayCode.textContent = code;
  window.history.pushState({}, '', '/' + code);

  if (midGame) {
    // Joined while a game is in progress — auto-skipped for current round
    hasSubmitted = true;
    roundActive = false;
    clearInterval(_countdownInterval);

    $guessedList.innerHTML = '';
    $guessFeedback.className = 'guess-feedback hidden';
    $guessInput.value = '';
    setGuessState(true);
    $roundOverlay.classList.add('hidden');
    $overlayResults.innerHTML = '';

    if (gameMode === 'flag') {
      $roundInfoText.textContent = `Flag Mode · Round ${round}`;
      $winTarget.textContent = `First to ${winScore} pts`;
      $winTarget.classList.remove('hidden');
    } else if (gameMode === 'language') {
      $roundInfoText.textContent = `Language Mode · Round ${round}`;
      $winTarget.textContent = `First to ${winScore} pts`;
      $winTarget.classList.remove('hidden');
    } else {
      $roundInfoText.textContent = `Round ${round} / ${totalRounds}`;
      $winTarget.classList.add('hidden');
    }

    $displayOutline.classList.add('hidden');
    $displayFlag.classList.add('hidden');
    $displayLanguage.classList.add('hidden');

    if (gameMode === 'flag' && flagAlpha2) {
      $displayFlag.classList.remove('hidden');
      showFlag(flagAlpha2);
      document.getElementById('guess-prompt').textContent = 'What country is this?';
    } else if (gameMode === 'language') {
      $displayLanguage.classList.remove('hidden');
      document.getElementById('guess-prompt').textContent = 'What language is this?';
      languageAudio = null;
      if (audioUrl) { languageAudio = new Audio(audioUrl); languageAudio.play().catch(() => {}); }
    } else if (countryId) {
      $displayOutline.classList.remove('hidden');
      renderCountry(countryId);
      document.getElementById('guess-prompt').textContent = 'What country is this?';
    }

    if (scores) renderScores(scores);
    showFeedback("You joined mid-round — next round you're in!", 'gave-up');
    if (gameState === 'playing' && timeRemaining > 0) startTimerAt(timeRemaining, timeLimit || 30);
    showScreen('screen-game');
  } else {
    showLobby(players, gameMode, winScore, false, roomName, isPublic);
  }
});

socket.on('joinError', ({ message }) => showRoomError(message));
socket.on('lobbyUpdate', ({ players, hostId }) => {
  currentPlayers = players;
  if (hostId) currentHostId = hostId;
  renderPlayerList(players);
  renderLobbyAvatarPanel(players, currentHostId);
});

socket.on('newHost', ({ hostId }) => {
  currentHostId = hostId;
  renderLobbyAvatarPanel(currentPlayers, currentHostId);
  if (hostId === socket.id) {
    isHost = true;
    $hostControls.classList.remove('hidden');
    $lobbyWaiting.classList.add('hidden');
    $modeSelector.classList.remove('hidden');
    document.getElementById('lobby-room-settings').classList.remove('hidden');
    document.getElementById('room-name-input').value = currentRoomName;
    updatePrivacyButtons(currentIsPublic);
    const needsWinScore = currentGameMode === 'flag' || currentGameMode === 'language';
    $winScoreSelector.classList.toggle('hidden', !needsWinScore);
  }
});

socket.on('gameModeChanged', ({ gameMode, winScore }) => {
  currentGameMode = gameMode;
  currentWinScore = winScore;
  setLobbyMode(gameMode, winScore);
});

socket.on('winScoreChanged', ({ winScore }) => {
  currentWinScore = winScore;
  setLobbyMode(currentGameMode, winScore);
});

socket.on('roomNameChanged', ({ roomName }) => {
  currentRoomName = roomName;
  document.getElementById('room-name-input').value = roomName;
});
socket.on('roomPrivacyChanged', ({ isPublic }) => {
  currentIsPublic = isPublic;
  updatePrivacyButtons(isPublic);
});

socket.on('startError', ({ message }) => {
  $lobbyError.textContent = message; $lobbyError.classList.remove('hidden');
});

let _countdownInterval = null;

socket.on('roundStart', ({ round, totalRounds, gameMode, countryId, flagAlpha2, audioUrl, timeLimit, winScore, scores }) => {
  if (!inRoom) return;

  clearInterval(_countdownInterval);
  currentGameMode = gameMode;
  if (winScore) currentWinScore = winScore;
  hasSubmitted    = false;
  roundActive     = true;

  if (scores) renderScores(scores);

  $guessedList.innerHTML = '';
  $guessFeedback.className = 'guess-feedback hidden';
  $guessInput.value = '';
  setGuessState(false);
  $roundOverlay.classList.add('hidden');
  $overlayResults.innerHTML = '';

  if (gameMode === 'flag') {
    $roundInfoText.textContent = `Flag Mode · Round ${round}`;
    $winTarget.textContent = `First to ${winScore || currentWinScore} pts`;
    $winTarget.classList.remove('hidden');
  } else if (gameMode === 'language') {
    $roundInfoText.textContent = `Language Mode · Round ${round}`;
    $winTarget.textContent = `First to ${winScore || currentWinScore} pts`;
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
  setTimeout(() => $guessInput.focus(), 50);
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
  $roundOverlay.classList.remove('hidden');
  clearInterval(_countdownInterval);
  if (isLast) {
    $overlayNextText.textContent = 'Calculating final scores...';
  } else {
    let secs = 4;
    $overlayNextText.textContent = `Next round in ${secs}s...`;
    _countdownInterval = setInterval(() => {
      secs--;
      if (secs <= 0) { clearInterval(_countdownInterval); $overlayNextText.textContent = 'Starting...'; }
      else $overlayNextText.textContent = `Next round in ${secs}s...`;
    }, 1000);
  }
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

socket.on('backToLobby', ({ players, hostId, gameMode, winScore, roomName, isPublic }) => {
  inRoom = true;
  if (hostId) currentHostId = hostId;
  $displayCode.textContent = myRoomCode;
  showLobby(players, gameMode, winScore, isHost, roomName, isPublic);
});

// ════ INIT ════
(function init() {
  const pathCode = window.location.pathname.slice(1).toUpperCase().trim();
  if (pathCode && /^[A-Z0-9]{6}$/.test(pathCode)) pendingRoomCode = pathCode;

  // Load saved avatar
  const savedAv = loadAvatar();
  if (savedAv) currentAvatar = { ...defaultAvatar(), ...savedAv };

  setupAvatarCreator();

  const saved = loadName();
  if (saved) {
    myName = saved;
    showHomeScreen(); // skip avatar screen for returning players — they can click their chip to edit
  } else {
    showScreen('screen-landing');
  }
})();
