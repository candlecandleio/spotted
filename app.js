/* Spotted — guess who I saw out and about.
   No backend: the whole puzzle rides in the URL fragment. */

(() => {
'use strict';

/* ── config ──────────────────────────────────────────── */

const START_POINTS  = 100;
const WRONG_PENALTY = 2;
const MAX_WRONG     = 5;

const CLUES = [
  { key: 'year',   label: 'Year',                        cost: 10 },
  { key: 'form',   label: 'Form',                        cost: 30 },
  { key: 'eth',    label: 'Ethnicity',                   cost: 20 },
  { key: 'sex',    label: 'Biological sex',              cost: 5  },
  { key: 'left',   label: 'Year they left Ashmole',      cost: 15 },
  { key: 'rating', label: 'My rating of them out of 10', cost: 5  },
];

const STORE_KEY = 'spotted.mine.v1';

/* ── tiny DOM helpers ────────────────────────────────── */

const $  = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

const SCREENS = ['loading', 'home', 'create', 'share', 'play', 'result'];
function show(name) {
  SCREENS.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ── encoding ─────────────────────────────────────────
   Not encryption — just enough scrambling that the answer
   isn't sitting in plain sight in the URL bar. Anyone
   determined can still decode it. */

const XOR_KEY = [0x53, 0x70, 0x6f, 0x74, 0x74, 0x65, 0x64, 0x21];

function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i] ^ XOR_KEY[i % XOR_KEY.length]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) ^ XOR_KEY[i % XOR_KEY.length];
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ── answer matching ─────────────────────────────────── */

function normalise(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

// How forgiving to be, given the length of the target.
const slack = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

/** Returns 'hit' | 'close' | 'miss'. */
function checkGuess(guess, puzzle) {
  const g = normalise(guess);
  if (!g) return 'miss';

  const targets = new Set();
  const full = normalise(puzzle.name);
  targets.add(full);
  // Individual name parts, so "Okafor" alone counts.
  full.split(' ').filter((p) => p.length >= 3).forEach((p) => targets.add(p));
  (puzzle.aliases || []).forEach((a) => {
    const n = normalise(a);
    if (n) targets.add(n);
  });

  let best = Infinity;
  for (const t of targets) {
    const d = levenshtein(g, t);
    if (d <= slack(t.length)) return 'hit';
    best = Math.min(best, d);
  }
  return best <= 3 ? 'close' : 'miss';
}

/* ── local record of your own spots ──────────────────── */

function loadMine() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}

function saveMine(entry) {
  const mine = loadMine();
  mine.unshift(entry);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(mine.slice(0, 12))); }
  catch { /* private browsing — not worth surfacing */ }
}

/* Spotting the same person twice is normal, so the list needs the time
   as well as the date to tell two entries apart. */
function whenLabel(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;

  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString(undefined, opts)}, ${time}`;
}

function renderMine() {
  const mine = loadMine();
  const wrap = $('home-recent');
  const list = $('recent-list');
  wrap.classList.toggle('hidden', mine.length === 0);
  list.innerHTML = '';

  mine.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'recent-item';

    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = entry.name;

    const date = document.createElement('span');
    date.className = 'recent-date';
    date.textContent = whenLabel(entry.at);

    const copy = document.createElement('button');
    copy.className = 'recent-copy';
    copy.type = 'button';
    copy.textContent = 'Share';
    on(copy, 'click', () => share({ url: entry.url, okMsg: 'Link copied' }));

    const text = document.createElement('div');
    text.className = 'recent-text';
    text.append(name, date);

    li.append(text, copy);
    list.append(li);
  });
}

/* ── clipboard ───────────────────────────────────────── */

/* Share sheet where the platform has one, clipboard everywhere else.
   Must be called straight from a click — browsers refuse otherwise. */
async function share({ text, url, okMsg }) {
  if (navigator.share) {
    try {
      await navigator.share(text ? { text, url } : { url });
      return;
    } catch (e) {
      // Dismissing the sheet is a normal outcome, not a failure.
      if (e && e.name === 'AbortError') return;
      // Anything else: fall through and copy instead.
    }
  }
  copyText([text, url].filter(Boolean).join('\n'), okMsg);
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
    return;
  } catch { /* fall through to the legacy path */ }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand && document.execCommand('copy');
  ta.remove();
  toast(ok ? okMsg : 'Copy failed — select the link and copy it');
}

/* ── leaderboard ──────────────────────────────────────
   No accounts. The browser mints a random id once and remembers your
   display name, which is enough to tell friends apart on a board. */

const PLAYER_KEY = 'spotted.player.v1';
const NAME_KEY   = 'spotted.name.v1';

function playerId() {
  let id = '';
  try { id = localStorage.getItem(PLAYER_KEY) || ''; } catch { /* private mode */ }
  if (/^[A-Za-z0-9_-]{8,40}$/.test(id)) return id;

  const bytes = crypto.getRandomValues(new Uint8Array(12));
  id = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { localStorage.setItem(PLAYER_KEY, id); } catch { /* ok, board is per-device */ }
  return id;
}

const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const rememberName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* ok */ } };

function renderBoard(board) {
  const list = $('board-list');
  const me = playerId();
  list.innerHTML = '';

  board.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'board-row' + (entry.player === me ? ' you' : '');

    const rank = document.createElement('span');
    rank.className = 'board-rank';
    rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1);

    const who = document.createElement('div');
    who.className = 'board-who';

    const name = document.createElement('span');
    name.className = 'board-name';
    name.textContent = entry.name + (entry.player === me ? ' (you)' : '');

    const detail = document.createElement('span');
    detail.className = 'board-detail';
    detail.textContent = entry.won
      ? `${entry.clues} clue${entry.clues === 1 ? '' : 's'}, ${entry.wrong} wrong`
      : 'Did not get it';

    who.append(name, detail);

    const score = document.createElement('span');
    score.className = 'board-score';
    score.textContent = entry.score;

    li.append(rank, who, score);
    list.append(li);
  });
}

async function loadBoard(code) {
  try {
    const res = await fetch('/api/score?c=' + encodeURIComponent(code));
    if (!res.ok) throw new Error('board ' + res.status);
    const { board } = await res.json();
    renderBoard(board || []);
    return board || [];
  } catch (e) {
    console.warn('leaderboard unavailable:', e);
    $('board-note').textContent = 'Leaderboard unavailable right now.';
    $('board-note').classList.remove('hidden');
    return null;
  }
}

async function submitScore(code) {
  const name = $('board-name').value.trim();
  if (!name) { $('board-name').focus(); return; }
  rememberName(name);

  const btn = $('board-submit');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        player: playerId(),
        name,
        won: game.won,
        wrong: game.wrong,
        clues: [...game.revealed],
      }),
    });
    if (!res.ok) throw new Error('submit ' + res.status);

    const { board, recorded } = await res.json();
    $('board-join').classList.add('hidden');
    $('board-note').textContent = recorded
      ? 'Your score is on the board. Only your first go counts.'
      : 'You were already on this board — your first score stands.';
    $('board-note').classList.remove('hidden');
    renderBoard(board || []);
  } catch (e) {
    console.warn('could not submit score:', e);
    toast('Could not add your score');
  }

  btn.disabled = false;
  btn.textContent = 'Add my score';
}

/* Shown only for short-link spots — an inline #p= link has no code to
   group scores under. Previewing your own spot shows the board but no
   way to join it. */
async function setupBoard() {
  const box = $('board');
  const code = game.code;

  if (!code) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  $('board-note').classList.add('hidden');
  $('board-join').classList.toggle('hidden', game.preview);
  $('board-name').value = savedName();

  const board = await loadBoard(code);
  if (!board) return;

  if (game.preview) {
    $('board-note').textContent = board.length
      ? 'How your friends are doing.'
      : 'Nobody has played this one yet.';
    $('board-note').classList.remove('hidden');
    return;
  }

  // Already played from this device? Then the form is pointless.
  if (board.some((e) => e.player === playerId())) {
    $('board-join').classList.add('hidden');
    $('board-note').textContent = 'You are on this board — only your first go counts.';
    $('board-note').classList.remove('hidden');
  }
}

/* ── photo ────────────────────────────────────────────
   The whole puzzle rides in the URL, so a photo has to be tiny.
   Square-crop to PHOTO_PX and step the JPEG quality down until it
   fits PHOTO_BUDGET bytes. A 260px thumbnail at q0.6 lands around
   8-12KB, which keeps the finished link comfortably sendable. */

/* Two budgets. Short links keep the photo server-side, so it can be
   properly sharp; the long fallback link has to carry it in the URL and
   must stay tiny. */
const PHOTO_SIZES  = [420, 340, 260, 200];
const PHOTO_QUALS  = [0.82, 0.7, 0.58, 0.45];
const PHOTO_BUDGET = 120000;  // base64 chars, stored server-side

const PHOTO_SIZES_URL  = [260, 220, 180, 148];
const PHOTO_QUALS_URL  = [0.62, 0.5, 0.4, 0.3];
const PHOTO_BUDGET_URL = 11000;

// The photo travels as its own URL param rather than inside the JSON —
// it is already base64, and packing it into the JSON would base64 it a
// second time for a free 33% of bloat.
const toDataUri = (b64) =>
  'data:image/jpeg;base64,' + b64.replace(/-/g, '+').replace(/_/g, '/');

/* The circular cropper. `crop` holds the live state: the loaded image,
   how far it's zoomed past "just covers the circle", and where it's been
   dragged to. Export reads the same numbers, so what you framed is
   exactly what gets sent. */

const CIRCLE = 170;   // must match .photo-circle in the stylesheet

let crop = null;

// The object URL stays alive for as long as the cropper is open — the
// preview element reuses it — and is released in clearPhoto().
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

function openCropper(img) {
  // cover: smallest scale at which the image still fills the circle
  const cover = CIRCLE / Math.min(img.width, img.height);
  crop = { img, cover, zoom: 1, x: 0, y: 0 };

  const el = $('photo-img');
  el.src = img.src;
  $('photo-zoom').value = '1';

  centreCrop();
  $('photo-editor').classList.remove('hidden');
  $('f-photo-clear').classList.remove('hidden');
  $('f-photo-label').textContent = 'Change photo';
}

function centreCrop() {
  const s = crop.cover * crop.zoom;
  crop.x = (CIRCLE - crop.img.width  * s) / 2;
  crop.y = (CIRCLE - crop.img.height * s) / 2;
  applyCrop();
}

// Keep the circle covered — you can never drag the image off its own frame.
function clampCrop() {
  const s = crop.cover * crop.zoom;
  const w = crop.img.width * s;
  const h = crop.img.height * s;
  crop.x = Math.min(0, Math.max(CIRCLE - w, crop.x));
  crop.y = Math.min(0, Math.max(CIRCLE - h, crop.y));
}

function applyCrop() {
  clampCrop();
  const s = crop.cover * crop.zoom;
  const el = $('photo-img');
  el.style.width  = crop.img.width  * s + 'px';
  el.style.height = crop.img.height * s + 'px';
  el.style.left = crop.x + 'px';
  el.style.top  = crop.y + 'px';
}

function initCropper() {
  const circle = $('photo-circle');
  let dragging = false, lastX = 0, lastY = 0;

  on(circle, 'pointerdown', (e) => {
    if (!crop) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    circle.setPointerCapture(e.pointerId);
    circle.classList.add('dragging');
  });

  on(circle, 'pointermove', (e) => {
    if (!dragging || !crop) return;
    crop.x += e.clientX - lastX;
    crop.y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyCrop();
  });

  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    circle.classList.remove('dragging');
    if (e.pointerId !== undefined && circle.hasPointerCapture(e.pointerId)) {
      circle.releasePointerCapture(e.pointerId);
    }
  };
  on(circle, 'pointerup', stop);
  on(circle, 'pointercancel', stop);

  on($('photo-zoom'), 'input', (e) => {
    if (!crop) return;
    const next = parseFloat(e.target.value);
    // Zoom about the centre of the circle rather than the image origin,
    // so the bit you framed stays framed.
    const mid = CIRCLE / 2;
    const ratio = next / crop.zoom;
    crop.x = mid - (mid - crop.x) * ratio;
    crop.y = mid - (mid - crop.y) * ratio;
    crop.zoom = next;
    applyCrop();
  });
}

/* Render the framed circle to a square JPEG, stepping quality then size
   down until it fits the URL budget. */
function exportPhoto(forUrl) {
  if (!crop) return '';

  const sizes  = forUrl ? PHOTO_SIZES_URL  : PHOTO_SIZES;
  const quals  = forUrl ? PHOTO_QUALS_URL  : PHOTO_QUALS;
  const budget = forUrl ? PHOTO_BUDGET_URL : PHOTO_BUDGET;

  const s = crop.cover * crop.zoom;
  const sx = -crop.x / s;
  const sy = -crop.y / s;
  const sSide = CIRCLE / s;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let best = '';

  outer:
  for (const px of sizes) {
    canvas.width = canvas.height = px;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(crop.img, sx, sy, sSide, sSide, 0, 0, px, px);
    for (const q of quals) {
      best = canvas.toDataURL('image/jpeg', q).split(',')[1];
      if (best.length <= budget) break outer;
    }
  }

  return best.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── confetti ─────────────────────────────────────────
   A short burst on a win. Purely decorative — skipped
   entirely when the viewer prefers reduced motion. */

function confetti(canvas) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const colours = ['#7fe3d8', '#ffd479', '#ff8f7a', '#f2f7f6', '#14746d'];
  const bits = Array.from({ length: 70 }, () => ({
    x: rect.width / 2 + (Math.random() - 0.5) * 60,
    y: rect.height * 0.45,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 7 - 2.5,
    w: 4 + Math.random() * 5,
    h: 3 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    c: colours[(Math.random() * colours.length) | 0],
  }));

  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, rect.width, rect.height);
    bits.forEach((b) => {
      b.vy += 0.16;                 // gravity
      b.x += b.vx; b.y += b.vy; b.rot += b.spin;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, 1 - frame / 110);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    });
    if (++frame < 110) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  })();
}

/* ── create ──────────────────────────────────────────── */

let chosenSex = '';

function initCreate() {
  const rating = $('f-rating');
  on(rating, 'input', () => { $('f-rating-out').textContent = rating.value; });

  initCropper();

  on($('f-photo'), 'change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      openCropper(await loadImage(file));
    } catch {
      toast('Could not read that image');
    }
    e.target.value = '';   // so re-picking the same file still fires
  });

  on($('f-photo-clear'), 'click', clearPhoto);

  $('f-sex').querySelectorAll('.seg').forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
    on(btn, 'click', () => {
      chosenSex = btn.dataset.value;
      $('f-sex').querySelectorAll('.seg').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  on($('create-form'), 'submit', async (e) => {
    e.preventDefault();
    const err = $('create-error');
    const submit = e.target.querySelector('button[type=submit]');

    if (!chosenSex) {
      err.textContent = 'Pick a biological sex — it is one of the clues.';
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');

    const puzzle = {
      v: 1,
      name: $('f-name').value.trim(),
      aliases: $('f-aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
      by: $('f-by').value.trim(),
      clues: {
        year:   $('f-year').value.trim(),
        form:   $('f-form').value.trim(),
        eth:    $('f-eth').value.trim(),
        sex:    chosenSex,
        left:   $('f-left').value.trim(),
        rating: rating.value + ' / 10',
      },
    };

    // location.origin is "null" on file:// — build from href instead.
    const origin = location.href.split('#')[0].split('?')[0].replace(/\/[^/]*$/, '/');

    submit.disabled = true;
    submit.textContent = 'Making your link…';

    let url = '';
    try {
      const body = { puzzle: { ...puzzle } };
      const photo = exportPhoto(false);
      if (photo) body.puzzle.img = photo;

      const res = await fetch('/api/spot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('store failed: ' + res.status);

      const { code } = await res.json();
      if (!code) throw new Error('no code returned');
      url = origin + code;
    } catch (e) {
      // Fall back to the self-contained link so a bad day for the API
      // never stops anyone making a spot. Longer, but it always works.
      console.warn('short link unavailable, using inline link:', e);
      const photo = exportPhoto(true);
      url = origin + '#p=' + encode(puzzle) + (photo ? '&i=' + photo : '');
    }

    submit.disabled = false;
    submit.textContent = 'Create the link';

    $('share-long').classList.toggle('hidden', url.length < 12000);
    $('share-url').textContent = url;
    $('share-copy').dataset.url = url;
    saveMine({ name: puzzle.name, at: Date.now(), url });
    show('share');
  });
}

function clearPhoto() {
  if (crop) URL.revokeObjectURL(crop.img.src);
  crop = null;
  $('photo-editor').classList.add('hidden');
  $('f-photo-clear').classList.add('hidden');
  $('f-photo-label').textContent = 'Choose photo';
  $('photo-img').removeAttribute('src');
}

function resetCreate() {
  $('create-form').reset();
  $('f-rating-out').textContent = '7';
  $('create-error').classList.add('hidden');
  chosenSex = '';
  clearPhoto();
  $('f-sex').querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

/* ── play ────────────────────────────────────────────── */

let game = null;

// `preview` = you are trying out your own spot, so back always
// returns you to your link rather than dumping you on the home screen.
function startGame(puzzle, opts = {}) {
  const { preview = false, code = '' } = opts;
  game = { puzzle, revealed: new Set(), wrong: 0, over: false, won: false, preview, code };

  $('play-back').title = preview ? 'Back to your link' : 'Back';
  $('result-toshare').classList.toggle('hidden', !preview);

  $('play-sub').textContent = puzzle.by
    ? `${puzzle.by} spotted them. Past or present Ashmole.`
    : 'Someone from Ashmole, past or present.';

  $('play-input').value = '';
  $('play-input').disabled = false;
  $('play-guess').disabled = false;
  $('play-feedback').textContent = ' ';
  $('play-feedback').className = 'feedback';

  renderGrid();
  renderScore(false);
  show('play');
}

function currentScore() {
  let s = START_POINTS - game.wrong * WRONG_PENALTY;
  CLUES.forEach((c) => { if (game.revealed.has(c.key)) s -= c.cost; });
  return Math.max(0, s);
}

function renderScore(animate) {
  const pts = $('play-points');
  pts.textContent = currentScore();
  $('play-guesses').textContent = MAX_WRONG - game.wrong;
  if (animate) {
    pts.classList.remove('points-bump');
    void pts.offsetWidth;            // restart the animation
    pts.classList.add('points-bump');
  }
}

function renderGrid() {
  const grid = $('play-grid');
  grid.innerHTML = '';

  CLUES.forEach((clue) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clue';

    if (game.revealed.has(clue.key)) {
      fillCard(btn, clue, false);
    } else {
      setFace(btn, clue.label, `−${clue.cost} points`);
      on(btn, 'click', () => {
        if (game.over || game.revealed.has(clue.key)) return;
        game.revealed.add(clue.key);
        fillCard(btn, clue, true);     // only this card flips
        renderScore(true);
      });
    }

    grid.append(btn);
  });
}

function setFace(btn, labelText, costText) {
  btn.textContent = '';
  const label = document.createElement('span');
  label.className = 'clue-label';
  label.textContent = labelText;
  btn.append(label);

  const cost = document.createElement('span');
  cost.className = 'clue-cost';
  cost.textContent = costText;
  btn.append(cost);
}

/* Turn one card over. `animate` is false when rebuilding a board that
   was already partly revealed, so untouched cards stay still. */
function fillCard(btn, clue, animate) {
  const text = game.puzzle.clues[clue.key] || '—';

  const swap = () => {
    btn.textContent = '';
    const label = document.createElement('span');
    label.className = 'clue-label';
    label.textContent = clue.label;

    const val = document.createElement('span');
    val.className = 'clue-value' + (text.length > 12 ? ' long' : '');
    val.textContent = text;

    btn.append(label, val);
    btn.classList.add('revealed');
    btn.disabled = true;
  };

  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    swap();
    return;
  }

  // Half the flip happens face-down, so the answer appears edge-on.
  btn.classList.add('flipping');
  setTimeout(swap, 170);

  // Clear on a timer rather than on animationend alone: a backgrounded
  // tab never fires that event, which would strand the card mid-rotation
  // and effectively invisible.
  const done = () => btn.classList.remove('flipping');
  btn.addEventListener('animationend', done, { once: true });
  setTimeout(done, 500);
}

function submitGuess() {
  if (game.over) return;
  const input = $('play-input');
  const raw = input.value.trim();
  const fb = $('play-feedback');

  if (!raw) {
    input.focus();
    return;
  }

  const verdict = checkGuess(raw, game.puzzle);

  if (verdict === 'hit') {
    finish(true);
    return;
  }

  game.wrong += 1;
  const left = MAX_WRONG - game.wrong;

  fb.className = 'feedback ' + (verdict === 'close' ? 'close' : 'miss');
  fb.textContent = verdict === 'close'
    ? `Not quite — but you're warm. −${WRONG_PENALTY}, ${left} left.`
    : `Nope, not ${raw}. −${WRONG_PENALTY}, ${left} left.`;

  input.value = '';
  input.classList.remove('shake');
  void input.offsetWidth;
  input.classList.add('shake');
  renderScore(true);

  if (game.wrong >= MAX_WRONG) {
    finish(false, `That was your last of ${MAX_WRONG} guesses.`);
  }
}

/* ── result ──────────────────────────────────────────── */

function finish(won, note) {
  game.over = true;
  game.won = won;
  const score = won ? currentScore() : 0;

  $('result-emoji').textContent = won ? (score >= 70 ? '🏆' : '🎉') : '🫥';
  $('result-head').textContent = won ? 'Got them' : 'Not this time';
  $('result-sub').textContent = note || (won
    ? (score >= 70 ? 'Barely needed the clues.' : 'A win is a win.')
    : 'Better luck on the next spot.');

  const photo = $('result-photo');
  photo.classList.toggle('hidden', !game.puzzle.img);
  if (game.puzzle.img) photo.src = toDataUri(game.puzzle.img);

  $('result-name').textContent = game.puzzle.name;
  $('result-by').textContent = game.puzzle.by ? `Spotted by ${game.puzzle.by}` : '';
  $('result-score').textContent = score;

  const list = $('result-breakdown');
  list.innerHTML = '';

  const row = (label, cost, cls) => {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const l = document.createElement('span');
    l.textContent = label;
    const c = document.createElement('span');
    c.className = 'bd-cost';
    c.textContent = cost;
    li.append(l, c);
    list.append(li);
  };

  row('Starting points', `${START_POINTS}`, 'bd-start');
  CLUES.forEach((c) => {
    if (game.revealed.has(c.key)) row(`Clue: ${c.label}`, `−${c.cost}`);
  });
  if (game.wrong) row(`Wrong guesses (${game.wrong})`, `−${game.wrong * WRONG_PENALTY}`);
  row('Total', `${score}`, 'bd-total');

  /* Never name the person here — this text gets pasted into the same
     group chat as the link, and would spoil it for everyone else. Only
     the score, the effort it took, and an invitation. */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const clues = count(game.revealed.size, 'clue', 'clues');
  const wrong = count(game.wrong, 'wrong guess', 'wrong guesses');

  // In preview you are on the home screen, so use the link you just made.
  const link = game.preview ? ($('share-copy').dataset.url || '') : location.href;

  $('result-share').dataset.url = link;
  $('result-share').dataset.text = won
    ? `Got it on Spotted — ${score} points, ${clues}, ${wrong}. `
      + 'Think you can beat that?'
    : 'Spotted beat me — I ran out of guesses. Reckon you can get it?';

  show('result');
  if (won) requestAnimationFrame(() => confetti($('confetti')));
  setupBoard();
}

/* ── routing ─────────────────────────────────────────── */

/* A short link is just /<code>. Fetch the puzzle it points at. */
const SHORT_CODE = /^\/([a-z0-9]{4,8})\/?$/;

async function routeFromPath() {
  const m = SHORT_CODE.exec(location.pathname);
  if (!m) return false;

  const code = m[1];
  show('loading');

  try {
    const res = await fetch('/api/spot?c=' + encodeURIComponent(code));
    if (res.status === 404) throw new Error('gone');
    if (!res.ok) throw new Error('lookup failed: ' + res.status);

    const { puzzle } = await res.json();
    if (!puzzle || !puzzle.name || !puzzle.clues) throw new Error('bad payload');

    startGame(puzzle, { code });
    return true;
  } catch (e) {
    console.warn('could not load spot:', e);
    $('loading-text').textContent = 'That spot could not be found.';
    $('loading-sub').textContent = 'The link may be mistyped, or the spot was removed.';
    $('loading-spinner').classList.add('hidden');
    $('loading-home').classList.remove('hidden');
    return true;   // handled — do not fall through to the home screen
  }
}

function routeFromHash() {
  const m = /[#&]p=([^&]+)/.exec(location.hash);
  if (!m) return false;
  try {
    const puzzle = decode(m[1]);
    if (!puzzle || !puzzle.name || !puzzle.clues) throw new Error('bad payload');
    const img = /[#&]i=([^&]+)/.exec(location.hash);
    if (img) puzzle.img = img[1];
    startGame(puzzle);
    return true;
  } catch {
    toast('That link looks broken');
    return false;
  }
}

function goHome() {
  if (location.hash || SHORT_CODE.test(location.pathname)) {
    history.replaceState(null, '', '/');
  }
  renderMine();
  show('home');
}

/* ── the advert ───────────────────────────────────────
   Fictional. Rotates a slogan every few seconds and does
   nothing at all when clicked, much like the real thing. */

const AD_SLOGANS = [
  'Everything must go. Everything.',
  'If we don\'t have it, you don\'t need it.',
  'Now accepting cash, favours and eye contact.',
  'Two for one. Sometimes three for one.',
  'Open whenever Oli is awake.',
  'Voted "a shop" four years running.',
  'Prices so low they are frankly suspicious.',
  'No questions asked. Please, no questions.',
  'Bulk discounts on things you will never use.',
  'Our stock is a mystery even to us.',
];

const AD_CLICKS = [
  'Oli is with a customer. Please hold.',
  'The shutters are down. Try knocking.',
  'Oli says he\'ll do you a deal on Tuesday.',
  'Out of stock. Was never in stock.',
  'Your order has been placed and immediately lost.',
];

function initAd() {
  const slogan = $('ad-slogan');
  let i = Math.floor(Math.random() * AD_SLOGANS.length);
  slogan.textContent = AD_SLOGANS[i];

  setInterval(() => {
    i = (i + 1) % AD_SLOGANS.length;
    slogan.style.opacity = '0';
    setTimeout(() => {
      slogan.textContent = AD_SLOGANS[i];
      slogan.style.opacity = '1';
    }, 260);
  }, 4200);

  slogan.style.transition = 'opacity .26s ease';

  on($('ad-body'), 'click', () => {
    toast(AD_CLICKS[Math.floor(Math.random() * AD_CLICKS.length)]);
  });
}

/* ── wire up ─────────────────────────────────────────── */

initCreate();
initAd();

/* Installed-app plumbing: cache the shell so it launches offline, and
   honour the "New spot" home-screen shortcut. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* file:// or unsupported */ });
  });
}

on($('home-create'),   'click', () => { resetCreate(); show('create'); });
on($('create-back'),   'click', goHome);
on($('share-back'),    'click', () => show('create'));
on($('share-home'),    'click', goHome);
on($('result-create'), 'click', () => { resetCreate(); show('create'); });

on($('share-copy'), 'click', (e) => share({ url: e.currentTarget.dataset.url, okMsg: 'Link copied' }));

on($('share-play'), 'click', async () => {
  const url = $('share-copy').dataset.url || '';

  // Long fallback link: everything needed is already in the URL.
  const m = /[#&]p=([^&]+)/.exec(url);
  if (m) {
    const puzzle = decode(m[1]);
    const img = /[#&]i=([^&]+)/.exec(url);
    if (img) puzzle.img = img[1];
    startGame(puzzle, { preview: true });
    return;
  }

  // Short link: fetch it back, so the preview is exactly what they'll get.
  const code = (url.split('/').pop() || '').trim();
  if (!code) return;
  try {
    const res = await fetch('/api/spot?c=' + encodeURIComponent(code));
    const { puzzle } = await res.json();
    startGame(puzzle, { preview: true, code });
  } catch {
    toast('Could not load the preview');
  }
});

on($('play-guess'),  'click', submitGuess);
on($('play-back'),   'click', () => {
  if (game && game.preview) show('share'); else goHome();
});
on($('result-toshare'), 'click', () => show('share'));
on($('play-input'),  'keydown', (e) => { if (e.key === 'Enter') submitGuess(); });
on($('play-giveup'), 'click', () => {
  if (confirm('Give up and see who it was?')) finish(false);
});

on($('result-share'), 'click', (e) => share({
  text: e.currentTarget.dataset.text,
  url: e.currentTarget.dataset.url,
  okMsg: 'Score copied',
}));

window.addEventListener('hashchange', () => { if (!routeFromHash()) goHome(); });

on($('loading-home'), 'click', goHome);
on($('board-join'), 'submit', (e) => { e.preventDefault(); submitScore(game.code); });

/* Three ways in: a short link (/abcde), an old self-contained link
   (#p=...), or the app itself. */
(async () => {
  if (await routeFromPath()) return;
  if (routeFromHash()) return;
  renderMine();
  // /?new=1 is the home-screen shortcut — go straight to the create screen.
  if (/[?&]new=1/.test(location.search)) { resetCreate(); show('create'); }
  else show('home');
})();

})();
