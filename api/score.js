/* Leaderboards, without accounts.
 *
 * POST /api/score  { code, player, name, won, clues[], wrong }  -> { board, you }
 * GET  /api/score?c=code                                        -> { board }
 *
 * Identity is a random id the browser generates once and keeps in
 * localStorage. No sign-up, no email, no password — the trade is that
 * clearing site data loses your place, which is the right trade here.
 *
 * Each score is its own blob under s/<code>/<player>.json. That avoids
 * read-modify-write on a shared file entirely, so two people finishing
 * at the same moment cannot clobber each other.
 */

import { put, head, list } from '@vercel/blob';

const COST = { year: 10, form: 30, eth: 20, sex: 5, left: 15, rating: 5 };
const START = 100;
const WRONG_PENALTY = 2;
const MAX_WRONG = 5;
const MAX_ENTRIES = 300;

const dirFor = (code) => `s/${code}/`;
const pathFor = (code, player) => `${dirFor(code)}${player}.json`;

const okCode   = (v) => /^[a-z0-9]{4,8}$/.test(v);
const okPlayer = (v) => /^[A-Za-z0-9_-]{8,40}$/.test(v);

/* Recompute rather than believe. A tampered client can still lie about
   which clues it opened, but it cannot simply post "100" after using
   every clue — the number always matches the story told about it. */
function scoreFor(clues, wrong, won) {
  const seen = new Set(clues.filter((k) => Object.hasOwn(COST, k)));
  if (!won) return { score: 0, clues: seen.size };

  let score = START - wrong * WRONG_PENALTY;
  for (const k of seen) score -= COST[k];
  return { score: Math.max(0, score), clues: seen.size };
}

async function readBoard(code) {
  const { blobs } = await list({ prefix: dirFor(code), limit: MAX_ENTRIES });

  const entries = await Promise.all(
    blobs.map((b) => fetch(b.url).then((r) => r.json()).catch(() => null))
  );

  return entries
    .filter(Boolean)
    .sort((a, b) =>
      b.score - a.score ||          // best score first
      a.clues - b.clues ||          // then fewest clues
      a.wrong - b.wrong ||          // then fewest wrong guesses
      a.at - b.at                   // then whoever got there first
    );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const code = String(req.query.c || '').toLowerCase();
      if (!okCode(code)) return res.status(400).json({ error: 'bad code' });
      return res.status(200).json({ board: await readBoard(code) });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const code = String(b.code || '').toLowerCase();
      const player = String(b.player || '');

      if (!okCode(code))   return res.status(400).json({ error: 'bad code' });
      if (!okPlayer(player)) return res.status(400).json({ error: 'bad player' });

      const name = String(b.name || '').trim().slice(0, 24) || 'Anonymous';
      const wrong = Math.max(0, Math.min(MAX_WRONG, Number(b.wrong) | 0));
      const clues = Array.isArray(b.clues) ? b.clues.map(String) : [];
      const won = !!b.won;

      const { score, clues: clueCount } = scoreFor(clues, wrong, won);

      /* First attempt only. Once you have finished you know the answer,
         so a replay would trivially score 100 and the board would mean
         nothing. Existing entries are never overwritten. */
      let already = false;
      try {
        await head(pathFor(code, player));
        already = true;
      } catch { /* no entry yet */ }

      if (!already) {
        await put(
          pathFor(code, player),
          JSON.stringify({ player, name, score, clues: clueCount, wrong, won, at: Date.now() }),
          {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
            cacheControlMaxAge: 60,
          }
        );
      }

      return res.status(200).json({ board: await readBoard(code), recorded: !already });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('score handler failed:', err);
    return res.status(500).json({ error: 'server error' });
  }
}
