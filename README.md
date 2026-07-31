# Giraffe World

A small 3D platformer. You play a giraffe exploring five zones — a meadow, a
creek, deep woods, a coast at sunset, and a night sky — collecting sixteen
glowing things. The locals are delighted you came and get more and more excited
as you collect them.

Built with three.js, no build step, no dependencies to install. It's plain files.

---

## The things she's collecting

Sixteen of them, hidden across the world. Nobody in the game agrees on what
they're called — that's the joke, and every giraffe has their own name for them.

`data/game.json` holds the count and all the text she sees: the gate question,
the opening card, and the ending. It's small.

### The gate

`data/game.json` starts with a `gate` block. Replace the placeholder with
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
`"The Whale!"` matches `"the whale"`. List a few spellings to be safe. The hint
appears after two wrong tries.

This keeps casual visitors out; it is **not** security. The repo is public, so
anyone who goes looking can read the files directly.

---

## The neighbours

Eight other giraffes live here, each in a different outfit. Walk up to one and a
prompt appears; press **E** (or the on-screen TALK button) to hear their next
line, and again for the one after. E only talks — it used to nudge the camera
too, which swung the view a little on every line. They wander their patch with their arms in
the air, and during the fly-around they scatter instead.

What they say depends on **how many she's collected**. Each giraffe has `stages`
in `data/npcs.json`, and the one with the highest `from` she's reached is what
they use — so they start pleased she turned up and get steadily more excited as
she goes. There's a gentle old story that whoever gathers all sixteen makes the
world kinder, which they mention in passing and are quietly thrilled about. It
never gets heavier than that; they mostly just like her.

`data/npcs.json` is all of it — names, positions, outfits, and every line.
Rewrite any of it. Outfits come from `OUTFITS` in `js/giraffe.js`: topHat,
partyHat, beanie, sunHat, flowerCrown, glasses, shades, scarf, bowTie, sweater,
cape, backpack.

They stand still and turn to face you while talking, their walking circles are
checked at startup and shrunk until they stay clear of walls and ledges, and the
speech bubble clamps to the screen instead of vanishing when they drift out of
view.

---

## The ending

Find all sixteen and the ending card appears. Press **Fly**
and the platformer stops: the giraffe goes horizontal, leaves a rainbow
ribbon and a trail of sparks, and can be flown anywhere across a much larger
map at speed. There's no collision any more — fly through a tree, a platform,
the house, and it shatters and tumbles away. Birds circle the map and can be
knocked out of the air, and so can the neighbours.

**Jump** does a corkscrew: a barrel roll and a shove of speed, about 45% further
over the second it lasts.

Scoring, tracked at the top of the screen: **+10** for scenery, **+200** for one
of the neighbours, **+500** for a bird, the big two in much larger text with a
bigger explosion. Nothing is kept afterwards — it's just nice to watch go up.

The sky becomes a gradient that drifts through the spectrum as she moves, so
the backdrop is never the same twice.

It's built to survive a phone: every effect is a fixed-size pool — one ribbon
mesh, one sparkle cloud, one batch of debris, three instanced meshes for all
the birds — so nothing is allocated per frame and nothing grows however long
she flies. Shadows are switched
off on take-off, since there's no sensible shadow frustum once she's crossing
the entire map and it buys back the most expensive thing on screen.

`js/celebration.js` holds all of it; the constants at the top (speed, turn
rate, pool sizes, hit radius, map bounds) are the knobs.

---

## The music

Four tracks off your album, *Demos for Days*, re-encoded for the web and sitting
in `music/`. They play straight through in this order and then start again:

1. Giraffe World
2. Gibberish
3. Light your Fires
4. My Dad Rocks

`data/music.json` is the running order — reorder those entries to change it, or
add a track by putting the mp3 in `music/` and adding a `{ file, title }` line
wherever you want it. `volume` is 0–1. Taking off at the ending jumps back to
the top of the list.

Music loads a track at a time rather than all at once, so opening the game on a
phone isn't a bulk download. If a file ever goes missing the playlist skips past
it instead of stopping. The ♪ button mutes music and sound effects together, and
each track's name fades in briefly as it starts.

To re-encode a new track at the same settings:

```bash
ffmpeg -i input.mp3 -map_metadata -1 -vn -codec:a libmp3lame -q:a 6 music/new-track.mp3
```

---

## Running it locally

Needs a web server — opening `index.html` straight off disk won't work, because
browsers block ES modules and `fetch` on `file://`.

```bash
python3 -m http.server 8773 --directory giraffe-world
```

Then open http://localhost:8773.

To wipe your own progress and see it as she will, run `localStorage.clear()` in
the console and reload.

---

## If you move things around in the world

`js/world.js` builds the level. Every platform is `plat(x, surfaceY, z, width, depth, colour)`
where `surfaceY` is the height you stand on. The glowing things are placed by
the `mem(x, y, z)` calls, in order.

After changing anything, check you haven't stranded one somewhere the giraffe
can't jump to. Load the game, then in the browser console:

```js
const t = await import('./tools/check-world.js'); console.log(t.check());
```

It models the actual jump arc from the numbers in `js/config.js` and reports
anything unreachable, anything that needs a double jump, and any checkpoint left
floating. Right now every one of the sixteen is reachable with single jumps only
— the double jump is a safety net, not a requirement.

`js/config.js` holds the feel: run speed, jump height, gravity, camera distance.
They're safe to fiddle with; re-run the check afterwards.

---

## Publishing an update

```bash
git add -A && git commit -m "tweak the dialogue" && git push
```

GitHub Pages redeploys in under a minute. If the page looks stale, hard-reload
(Cmd-Shift-R) — the JSON files are fetched with `cache: 'no-cache'` but the JS is
cached for ten minutes.
