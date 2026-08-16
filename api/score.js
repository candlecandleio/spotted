/* Leaderboards, without accounts.
 *
 * POST  /api/score  { phase: start|finish, code, player, name, ... } -> { board }
 * PATCH /api/score  { code, player, name }                       -> { updated }
 * GET   /api/score?c=code                                       -> { board }
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
const versionedUrl = (url, etag) => etag
  ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(etag)}`
  : url;

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

const blobOptions = {
  access: 'public',
  contentType: 'application/json',
  addRandomSuffix: false,
  cacheControlMaxAge: 60,
};

const overwriteOptions = (etag) => ({
  ...blobOptions,
  allowOverwrite: true,
  ifMatch: etag,
});

async function readBoard(code) {
  const { blobs } = await list({ prefix: dirFor(code), limit: MAX_ENTRIES });

  const entries = await Promise.all(
    blobs.map((b) => fetch(versionedUrl(b.url, b.etag), { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => null))
  );

  return entries
    .filter(Boolean)
    .sort((a, b) =>
      Number(a.status === 'started') - Number(b.status === 'started') ||
      (b.score || 0) - (a.score || 0) || // best finished score first
      a.clues - b.clues ||          // then fewest clues
      a.wrong - b.wrong ||          // then fewest wrong guesses
      a.at - b.at                   // then whoever got there first
    );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const code = String(req.query.c || '').toLowerCase();
      if (!okCode(code)) return res.status(400).json({ error: 'bad code' });
      return res.status(200).json({ board: await readBoard(code) });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const code = String(b.code || '').toLowerCase();
      const player = String(b.player || '');
      const name = String(b.name || '').trim().slice(0, 24) || 'Anonymous';

      if (!okCode(code))   return res.status(400).json({ error: 'bad code' });
      if (!okPlayer(player)) return res.status(400).json({ error: 'bad player' });

      let metadata;
      try {
        metadata = await head(pathFor(code, player));
      } catch {
        // A missing score is harmless: there is nothing to rename yet.
        return res.status(200).json({ updated: false });
      }

      const currentResponse = await fetch(versionedUrl(metadata.url, metadata.etag), {
        cache: 'no-store',
      });
      if (!currentResponse.ok) throw new Error('could not read score');
      const current = await currentResponse.json();
      if (current.name === name) return res.status(200).json({ updated: false });

      // Only the display name changes. Keep the original score and first
      // attempt details, and use the ETag to avoid overwriting a concurrent
      // rename based on stale data.
      await put(
        pathFor(code, player),
        JSON.stringify({ ...current, name }),
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
          ifMatch: metadata.etag,
          cacheControlMaxAge: 60,
        }
      );

      return res.status(200).json({ updated: true });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const code = String(b.code || '').toLowerCase();
      const player = String(b.player || '');

      if (!okCode(code))   return res.status(400).json({ error: 'bad code' });
      if (!okPlayer(player)) return res.status(400).json({ error: 'bad player' });

      const name = String(b.name || '').trim().slice(0, 24) || 'Anonymous';

      /* Register presence as soon as a short-link game opens. A started row
         is upgraded in place when that same first attempt finishes. */
      if (b.phase === 'start') {
        const now = Date.now();
        let metadata = null;
        try { metadata = await head(pathFor(code, player)); } catch { /* new player */ }

        if (!metadata) {
          try {
            await put(
              pathFor(code, player),
              JSON.stringify({
                player,
                name,
                status: 'started',
                score: null,
                clues: 0,
                wrong: 0,
                won: false,
                startedAt: now,
                at: now,
              }),
              blobOptions
            );
          } catch {
            // Two tabs can start the same game together. The first row wins.
          }
        } else {
          const currentResponse = await fetch(versionedUrl(metadata.url, metadata.etag), {
            cache: 'no-store',
          });
          if (currentResponse.ok) {
            const current = await currentResponse.json();
            if (current.status === 'started') {
              await put(
                pathFor(code, player),
                JSON.stringify({ ...current, name, at: now }),
                overwriteOptions(metadata.etag)
              );
            }
          }
        }

        return res.status(200).json({ board: await readBoard(code), started: true });
      }

      const wrong = Math.max(0, Math.min(MAX_WRONG, Number(b.wrong) | 0));
      const clues = Array.isArray(b.clues) ? b.clues.map(String) : [];
      const won = !!b.won;

      const { score, clues: clueCount } = scoreFor(clues, wrong, won);

      /* First attempt only. Once you have finished you know the answer,
         so a replay would trivially score 100 and the board would mean
         nothing. A started row is the one allowed in-place upgrade. */
      let metadata = null;
      let recorded = false;
      try {
        metadata = await head(pathFor(code, player));
      } catch { /* no entry yet */ }

      if (!metadata) {
        await put(
          pathFor(code, player),
          JSON.stringify({ player, name, status: 'finished', score, clues: clueCount, wrong, won, at: Date.now() }),
          blobOptions
        );
        recorded = true;
      } else {
        const currentResponse = await fetch(versionedUrl(metadata.url, metadata.etag), {
          cache: 'no-store',
        });
        if (!currentResponse.ok) throw new Error('could not read score');
        const current = await currentResponse.json();

        // A started row belongs to this first attempt, so finish it in place.
        // A finished row is immutable and cannot be resubmitted.
        if (current.status === 'started') {
          await put(
            pathFor(code, player),
            JSON.stringify({
              ...current,
              name,
              status: 'finished',
              score,
              clues: clueCount,
              wrong,
              won,
              finishedAt: Date.now(),
              at: Date.now(),
            }),
            overwriteOptions(metadata.etag)
          );
          recorded = true;
        }
      }

      return res.status(200).json({
        board: await readBoard(code),
        recorded,
      });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('score handler failed:', err);
    return res.status(500).json({ error: 'server error' });
  }
}
