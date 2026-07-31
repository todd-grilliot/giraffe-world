# Giraffe World

A small 3D platformer. You play a giraffe exploring five zones — a meadow, a creek,
deep woods, a coast at sunset, and a night sky — hunting sixteen hidden lanterns.
Each one opens a photo and a note.

Built with three.js, no build step, no dependencies to install. It's plain files.

---

## The only file you need to edit

**`data/notes.json`.** That's where all the writing lives.

For each of the sixteen entries, fill in `title` and `body`, and delete the
`"draft": true` line when you're happy with it. Anything still marked `draft`
shows a small amber "still needs writing" badge in-game — that's a reminder for
you, and it disappears the moment you remove the flag.

```json
{
  "id": 4,
  "photo": "photos/memory-04.jpg",
  "thumb": "photos/thumbs/memory-04.jpg",
  "photoDate": "2019-07-08",     <- from the photo's metadata, to jog your memory. Not shown.
  "date": "Summer 2019",         <- shown under the title. Leave "" to show nothing.
  "title": "The drive back",
  "body": "Write whatever you want here.\n\nBlank lines work fine.",
  "draft": true                  <- delete this line when it's written
}
```

**Order matters.** `notes[0]` is placed nearest the start and `notes[15]` at the
very top of the sky. Rearranging the array rearranges where they appear in the
world, so you can order them however the writing wants to go. If you move a note,
keep its `photo` and `thumb` lines with it.

### The gate

`data/notes.json` starts with a `gate` block. Replace the placeholder with
something only she'd know:

```json
"gate": {
  "question": "What did we always call the blue car?",
  "answers": ["the whale", "whale"],
  "hint": "It wasn't a compliment.",
  "welcome": "Hi Sarah."
}
```

Answers are matched loosely — case, spaces and punctuation are all ignored, so
`"The Whale!"` matches `"the whale"`. List a few spellings in `answers` to be
safe. The hint appears after two wrong tries.

This keeps casual visitors out; it is **not** security. The repo is public, so
anyone who goes looking can read the files directly. That was a deliberate
trade — GitHub Pages needs a public repo on a free account.

### The ending

The `finale` block shows once she's found all sixteen. Make it the one that matters.

---

## The music

Your album, *Demos for Days*, re-encoded for the web (40MB → 17MB) and sitting
in `music/`. The running order is **theme, random, theme, random…** — "Giraffe
World" opens the game and comes back every other song, with a different track
from the album in between. The random pick never repeats the one before it.

`data/music.json` controls all of it. Drop a track by deleting its line from
`shuffle`; add one by putting the mp3 in `music/` and adding a `{ file, title }`
entry; change what opens the game by moving a track into `theme`. `volume` is
0–1.

Which song plays next is worked out from what just finished, not from a counter,
so the alternation can't drift out of step no matter what happens mid-session.

Music only loads as it's needed — just the 768K theme up front, the rest one at
a time — so opening the game on a phone isn't a 17MB download. The ♪ button
mutes music and sound effects together, and each track's name fades in briefly
as it starts.

To re-encode a new track at the same settings:

```bash
ffmpeg -i input.mp3 -map_metadata -1 -vn -codec:a libmp3lame -q:a 6 music/new-track.mp3
```

---

## Changing the photos

Photos live in `photos/` as `memory-01.jpg` … `memory-16.jpg`, with matching
thumbnails in `photos/thumbs/`. To swap one, drop a replacement in with the same
name. To keep the page quick, resize before committing:

```bash
sips -Z 1400 -s format jpeg -s formatOptions 68 new.jpg --out photos/memory-07.jpg
```

```bash
sips -Z 420 -s format jpeg -s formatOptions 62 new.jpg --out photos/thumbs/memory-07.jpg
```

To add a **seventeenth** memory, add the photo, add an entry to `notes`, and add
one more `mem(x, y, z)` line in `js/world.js` — the lantern count follows the
length of the notes array automatically.

Photos are shown whole, never cropped (`object-fit: contain` in `css/style.css`).
If you'd rather they fill the frame, change that to `cover`.

---

## Running it locally

Needs a web server — opening `index.html` straight off disk won't work, because
browsers block ES modules and `fetch` on `file://`.

```bash
python3 -m http.server 8772 --directory giraffe-world
```

Then open http://localhost:8772.

To wipe your own progress and see it as she will, open the journal and click
"start over", or run `localStorage.clear()` in the console.

---

## If you move things around in the world

`js/world.js` builds the level. Every platform is `plat(x, surfaceY, z, width, depth, colour)`
where `surfaceY` is the height you stand on. Memory lanterns are placed by the
`mem(x, y, z)` calls, in order.

After changing anything, check you haven't stranded a memory somewhere the giraffe
can't jump to. Load the game, then in the browser console:

```js
const t = await import('./tools/check-world.js'); console.log(t.check());
```

It models the actual jump arc from the numbers in `js/config.js` and reports any
lantern that's unreachable, any that needs a double jump, and any checkpoint left
floating. Right now every one of the sixteen is reachable with single jumps only
— the double jump is a safety net, not a requirement.

`js/config.js` holds the feel: run speed, jump height, gravity, camera distance.
They're safe to fiddle with; re-run the check afterwards.

---

## Publishing an update

```bash
git add -A && git commit -m "write the notes" && git push
```

GitHub Pages redeploys in under a minute. If the page looks stale, hard-reload
(Cmd-Shift-R) — `notes.json` is fetched with `cache: 'no-cache'` but the JS files
are cached normally.
