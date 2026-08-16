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

const SCREENS = ['home', 'create', 'share', 'play', 'result'];
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
    date.textContent = new Date(entry.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    const copy = document.createElement('button');
    copy.className = 'recent-copy';
    copy.type = 'button';
    copy.textContent = 'Copy';
    on(copy, 'click', () => copyText(entry.url, 'Link copied'));

    li.append(name, date, copy);
    list.append(li);
  });
}

/* ── clipboard ───────────────────────────────────────── */

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

/* ── create ──────────────────────────────────────────── */

let chosenSex = '';

function initCreate() {
  const rating = $('f-rating');
  on(rating, 'input', () => { $('f-rating-out').textContent = rating.value; });

  $('f-sex').querySelectorAll('.seg').forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
    on(btn, 'click', () => {
      chosenSex = btn.dataset.value;
      $('f-sex').querySelectorAll('.seg').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  on($('create-form'), 'submit', (e) => {
    e.preventDefault();
    const err = $('create-error');

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
    const base = location.href.split('#')[0];
    const url = base + '#p=' + encode(puzzle);
    $('share-url').textContent = url;
    $('share-copy').dataset.url = url;
    saveMine({ name: puzzle.name, at: Date.now(), url });
    show('share');
  });
}

function resetCreate() {
  $('create-form').reset();
  $('f-rating-out').textContent = '7';
  $('create-error').classList.add('hidden');
  chosenSex = '';
  $('f-sex').querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

/* ── play ────────────────────────────────────────────── */

let game = null;

function startGame(puzzle) {
  game = { puzzle, revealed: new Set(), wrong: 0, over: false };

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

    const label = document.createElement('span');
    label.className = 'clue-label';
    label.textContent = clue.label;
    btn.append(label);

    if (game.revealed.has(clue.key)) {
      btn.classList.add('revealed');
      btn.disabled = true;
      const val = document.createElement('span');
      const text = game.puzzle.clues[clue.key] || '—';
      val.className = 'clue-value' + (text.length > 12 ? ' long' : '');
      val.textContent = text;
      btn.append(val);
    } else {
      const cost = document.createElement('span');
      cost.className = 'clue-cost';
      cost.textContent = `−${clue.cost} points`;
      btn.append(cost);
      on(btn, 'click', () => {
        if (game.over) return;
        game.revealed.add(clue.key);
        renderGrid();
        renderScore(true);
      });
    }

    grid.append(btn);
  });
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
  const score = won ? currentScore() : 0;

  $('result-emoji').textContent = won ? (score >= 70 ? '🏆' : '🎉') : '🫥';
  $('result-head').textContent = won ? 'Got them' : 'Not this time';
  $('result-sub').textContent = note || (won
    ? (score >= 70 ? 'Barely needed the clues.' : 'A win is a win.')
    : 'Better luck on the next spot.');

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

  const clueCount = game.revealed.size;
  $('result-share').dataset.text = won
    ? `I got "${game.puzzle.name}" on Spotted — ${score} points, ${clueCount} clue${clueCount === 1 ? '' : 's'}, ${game.wrong} wrong guess${game.wrong === 1 ? '' : 'es'}.`
    : `I gave up on Spotted. It was ${game.puzzle.name}.`;

  show('result');
}

/* ── routing ─────────────────────────────────────────── */

function routeFromHash() {
  const m = /[#&]p=([^&]+)/.exec(location.hash);
  if (!m) return false;
  try {
    const puzzle = decode(m[1]);
    if (!puzzle || !puzzle.name || !puzzle.clues) throw new Error('bad payload');
    startGame(puzzle);
    return true;
  } catch {
    toast('That link looks broken');
    return false;
  }
}

function goHome() {
  if (location.hash) history.replaceState(null, '', location.pathname);
  renderMine();
  show('home');
}

/* ── wire up ─────────────────────────────────────────── */

initCreate();

on($('home-create'),   'click', () => { resetCreate(); show('create'); });
on($('create-back'),   'click', goHome);
on($('share-back'),    'click', () => show('create'));
on($('share-home'),    'click', goHome);
on($('result-create'), 'click', () => { resetCreate(); show('create'); });

on($('share-copy'), 'click', (e) => copyText(e.currentTarget.dataset.url, 'Link copied'));

on($('share-play'), 'click', () => {
  const m = /#p=(.+)$/.exec($('share-copy').dataset.url || '');
  if (m) startGame(decode(m[1]));
});

if (navigator.share) {
  const nb = $('share-native');
  nb.classList.remove('hidden');
  on(nb, 'click', () => {
    navigator.share({
      title: 'Spotted',
      text: 'Guess who I saw out and about',
      url: $('share-copy').dataset.url,
    }).catch(() => { /* user dismissed the sheet */ });
  });
}

on($('play-guess'),  'click', submitGuess);
on($('play-back'),   'click', goHome);
on($('play-input'),  'keydown', (e) => { if (e.key === 'Enter') submitGuess(); });
on($('play-giveup'), 'click', () => {
  if (confirm('Give up and see who it was?')) finish(false);
});

on($('result-share'), 'click', (e) => copyText(e.currentTarget.dataset.text, 'Score copied'));

window.addEventListener('hashchange', () => { if (!routeFromHash()) goHome(); });

if (!routeFromHash()) {
  renderMine();
  show('home');
}

})();
