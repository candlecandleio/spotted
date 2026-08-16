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

Because the puzzle lives in the URL, the photo has to be small. It gets
centre-cropped square and stepped down through quality then dimensions until it
fits ~11KB of base64, which is roughly a 260px thumbnail. A 270KB camera photo
comes out around 5.4KB and pushes the link to about 5,700 characters — long, but
well within what browsers and messaging apps handle. The share screen warns you
if a link ever crosses 12,000.

The photo rides in its own `&i=` fragment param rather than inside the JSON,
because it is already base64 and nesting it would base64 it a second time for a
free 33% of bloat.

## Running it

Any static file server will do.

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173. Opening `index.html` directly over `file://`
also works in a normal browser.

To put it online, drop the three files on any static host (GitHub Pages, Netlify,
Cloudflare Pages). There is nothing to configure.

## How sharing works — and its one limitation

There is no server and no database. The whole puzzle is packed into the part of
the URL after the `#`, which browsers never send to the host. So the link *is*
the game: no accounts, no hosting bill, and nothing to keep running.

The tradeoff: the answer travels inside the link. It is XOR-scrambled and
base64'd so it isn't readable at a glance in the address bar, but that is
obfuscation, not security — anyone who wants to decode it can. Fine for a game
among friends; don't put anything sensitive in the clues.

Two consequences worth knowing:

- **No shared leaderboard.** Each player sees their own score. Copy-your-score
  gives them a line to paste back into the chat.
- **Links are long** (a few hundred characters). Every messaging app handles
  this fine; some link previews will truncate the display, but the link still
  works.

If you later want a real leaderboard, that is the point where a small backend
becomes worth it.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | All five screens: home, create, share, play, result |
| `styles.css` | Design tokens and layout; two-column clue grid on phones |
| `app.js` | Encoding, guess matching, scoring, routing |

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
