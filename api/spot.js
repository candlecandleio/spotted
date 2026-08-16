/* Short links.
 *
 * POST /api/spot   { puzzle }  ->  { code }   stores the puzzle, returns a code
 * GET  /api/spot?c=abcde       ->  { puzzle } looks one back up
 *
 * The puzzle used to ride inside the URL, which made links enormous and
 * meant anyone could decode the answer. Now the link is just a code.
 */

import { put, head } from '@vercel/blob';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/1/o/i/l — these get read aloud
const CODE_LEN = 5;
const MAX_BODY = 220 * 1024;   // generous for one photo, mean to anything else

const CLUE_KEYS = ['year', 'form', 'eth', 'sex', 'left', 'rating'];
const okPlayer = (v) => /^[A-Za-z0-9_-]{8,40}$/.test(v);

const pathFor = (code) => `p/${code}.json`;

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

async function taken(code) {
  try {
    await head(pathFor(code));
    return true;
  } catch {
    return false;   // head throws when the blob does not exist
  }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/* Never trust the client. Rebuild the object field by field so nothing
   unexpected gets stored and handed back to another player's browser. */
function clean(input) {
  if (!input || typeof input !== 'object') return null;

  const name = str(input.name, 80).trim();
  if (!name) return null;

  const clues = {};
  for (const k of CLUE_KEYS) clues[k] = str(input.clues && input.clues[k], 120).trim();

  const out = {
    v: 1,
    name,
    by: str(input.by, 60).trim(),
    aliases: Array.isArray(input.aliases)
      ? input.aliases.slice(0, 10).map((a) => str(a, 60).trim()).filter(Boolean)
      : [],
    clues,
  };

  // Keep the anonymous creator id with the spot so the creator can be
  // recognised when they open their own link again.
  const createdBy = str(input.createdBy, 40).trim();
  if (okPlayer(createdBy)) out.createdBy = createdBy;

  // base64url only, so nothing script-shaped can survive the round trip
  const img = str(input.img, 300000);
  if (img && /^[A-Za-z0-9_-]+$/.test(img)) out.img = img;

  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const code = String(req.query.c || '').toLowerCase();
      if (!/^[a-z0-9]{4,8}$/.test(code)) {
        return res.status(400).json({ error: 'bad code' });
      }

      let meta;
      try {
        meta = await head(pathFor(code));
      } catch {
        return res.status(404).json({ error: 'not found' });
      }

      const puzzle = await fetch(meta.url).then((r) => r.json());

      // Puzzles never change once written, so let the CDN keep them.
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=31536000, immutable');
      return res.status(200).json({ puzzle });
    }

    if (req.method === 'POST') {
      const raw = JSON.stringify(req.body || {});
      if (raw.length > MAX_BODY) return res.status(413).json({ error: 'too big' });

      const puzzle = clean(req.body && req.body.puzzle);
      if (!puzzle) return res.status(400).json({ error: 'bad puzzle' });

      // Codes are short, so collisions are rare but not impossible.
      let code = null;
      for (let i = 0; i < 6; i++) {
        const candidate = makeCode();
        if (!(await taken(candidate))) { code = candidate; break; }
      }
      if (!code) return res.status(503).json({ error: 'could not allocate a code' });

      await put(pathFor(code), JSON.stringify(puzzle), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 31536000,
      });

      return res.status(200).json({ code });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('spot handler failed:', err);
    return res.status(500).json({ error: 'server error' });
  }
}
