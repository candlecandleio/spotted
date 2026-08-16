# Spotted

Guess who I saw out and about. You spot someone, set six clues, and send a link
to the group chat. Whoever opens it plays.

## How it works

- Everyone starts on **100 points**.
- Revealing a clue costs points: Form −30, Ethnicity −20, Year they left Ashmole
  −15, Year −10, Biological sex −5, Rating out of 10 −5.
- **5 wrong guesses**, 2 points each. Run out and the game ends. The winning
  guess is free.
- Score floors at 0.

The Year clue is *relative to the spotter* — "2 years below me" rather than
"Year 11". An absolute year group goes stale and only means something to people
who overlapped with them; a relative one reads the same whoever is playing.

Guesses are matched loosely: case and punctuation are ignored, first name only or
surname only both count, and small typos are forgiven (more slack on longer
names). Near-misses get a "you're warm" nudge instead of a flat no. Creators can
add extra accepted answers (nicknames) when setting up a spot.

## The reveal photo

Optional. The spotter can attach a photo, shown only once the game is over —
alongside a confetti burst if they won.

Choosing a photo opens a circular cropper you drag to reposition, with a zoom
slider. Zoom scales about the centre of the circle, and dragging is clamped so
the image always covers the frame. The export reads the same crop state as the
preview, so what you framed is exactly what gets sent.

Photos are stored alongside the puzzle rather than in the link, so they can be
reasonably sharp: 420px at q0.82. The long fallback link uses a much tighter
budget (260px, ~11KB of base64) because there it has to fit in the URL.

## Running it

Any static file server will do.

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173. Opening `index.html` directly over `file://`
also works in a normal browser.

To put it online, drop the three files on any static host (GitHub Pages, Netlify,
Cloudflare Pages). There is nothing to configure.

## How sharing works

Creating a spot POSTs it to `/api/spot`, which stores it in Vercel Blob under a
five-character code and hands the code back. The link is just that code:

    https://spotted.bingo/w65v8

Opening it rewrites to the app, which fetches the puzzle by code. Codes use an
alphabet with no `0`, `1`, `o`, `i` or `l`, so they survive being read aloud.

The answer is no longer in the link, so it can no longer be decoded out of one —
which was true of the original design and is the main reason this was worth
building. The API validates and rebuilds every stored puzzle field by field, so
nothing unexpected can be written and later served into another player's browser.

**Older `#p=...` links still work.** They carried the whole puzzle inline, and
that path is still handled on load. It also serves as the fallback: if the API
is ever unreachable, the client generates one of those long links instead, so
nobody is ever blocked from creating a spot.

## Leaderboards, without accounts

Every spot has its own board. Identity is a random id the browser mints once and
keeps in `localStorage`, plus a display name you type the first time. No sign-up,
no email, no password. The trade is that clearing site data loses your place,
which is the right trade for a game played among friends.

Two things make the board mean something:

- **Scores are recomputed server-side** from the clues opened and guesses used.
  A tampered client can still lie about *what it did*, but it cannot post a bare
  "100" after burning every clue — the number always matches the story told
  about it.
- **Only your first attempt counts.** Once you have finished you know the answer,
  so a replay would trivially score 100. Existing entries are never overwritten.

Each score is its own blob at `s/<code>/<player>.json`. That avoids
read-modify-write on a shared file, so two people finishing at the same moment
cannot clobber each other. Reading a board is a prefix list plus a parallel
fetch.

This is friend-grade, not tamper-proof. Someone determined with dev tools open
can still post a flattering-but-plausible result. Making that impossible would
mean running the game logic on the server, which is a much bigger build for a
guessing game.

## Your spots and your guesses

The home screen keeps two local lists: spots you created (with a Share button)
and spots you have guessed at (with your score). Both are device-only — nothing
about them is stored server-side. The guessing history records first attempts
only, for the same reason the leaderboard does.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | All six screens: loading, home, create, share, play, result |
| `styles.css` | Design tokens and layout; two-column clue grid on phones |
| `app.js` | Cropper, guess matching, scoring, routing, leaderboard |
| `api/spot.js` | Stores and looks up puzzles by short code |
| `api/score.js` | Records and returns per-spot leaderboards |
| `sw.js` | Offline shell cache for the installed app |
| `tools/make-icons.py` | Regenerates the icon set |

Your own spots are remembered in `localStorage` so you can re-copy a link from
the home screen. Nothing else is stored.

## Changing the clues or the scoring

Both live at the top of [`app.js`](app.js):

```js
const START_POINTS  = 100;
const WRONG_PENALTY = 2;
const MAX_WRONG     = 5;

const CLUES = [
  { key: 'year', label: 'Year', cost: 10 },
  ...
];
```

Adding a clue means adding an entry there, a matching field on the create form in
`index.html`, and one line in the `puzzle.clues` object in `app.js`.
