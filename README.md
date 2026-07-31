# Giraffe World

A small 3D platformer for Sarah. You play a giraffe crossing five places — a
meadow, a creek, deep woods, a coast at sunset, and a night sky — doing a favour
for somebody in each of them.

Built with three.js, no build step, nothing to install. It's plain files.

---

## The five favours

One per zone, and **a zone won't let you past until its favour is done**. That's
deliberate: the old version scattered sixteen collectibles about and it was
possible to reach the end having missed one with no idea which or where. Now
nothing can be quietly skipped, and there's always a line at the top-left saying
what you're doing right now, with the little light pointing at it.

| zone | who | what |
|---|---|---|
| meadow | Juniper | her picnic blanket blew onto the roof |
| creek | Pip | run a party invitation up to Clementine |
| woods | Clementine | a cat is up the tall tree |
| coast | Bertrand | one fig, from the shore, for his buffet |
| night sky | Sage | she'll play you her song |

When she's carrying something it rides above her head. That's the whole
inventory.

If you get stopped at a boundary, the toast tells you exactly who's still
waiting and for what. Pip's is a delivery whose target lives in the *next* zone,
so that gate opens the moment the invitation is in hand — otherwise the game
would lock solid.

### The ending

Sage's song has one line, which she has had for ten years, and everyone tells
her it's her best work. The real track fades in underneath her, seeking past its
long silent intro so it lands on the melody.

Then she tells you to look up. **The game ends when you find Luna** — a dog in
the stars, drawn with joining lines so she reads as an animal rather than a
scatter of dots. The camera lifts toward the sky on its own for a second (its
resting tilt looks downward, and hunting for the angle would spoil it), and then
turning to find her is the part Sarah does. Say hello and the ending card
appears, with **Fly**.

Luna's height in `js/main.js` is a genuine constraint, not a taste call: lower
and the clouds draw straight over her, higher and the chase camera physically
cannot tilt far enough to frame her.

---

## Changing what they say

`data/npcs.json` is all of it — the nine giraffes, where they stand, what they
wear, and every line. That's the file to rewrite. It documents its own shape at
the top.

Four of them don't want anything from you, on purpose: a world where everybody
hands you a task reads as an errand list. Marlow gossips, Odie naps and talks
about the patch of land he's saving for, Winnifred can't remember whether you've
met, and Wendell has one thought and won't elaborate.

Outfits come from `OUTFITS` in `js/giraffe.js`: topHat, partyHat, beanie, sunHat,
flowerCrown, glasses, shades, scarf, bowTie, sweater, cape, backpack.

They stand still and turn to face you while talking, their walking circles are
checked at startup and shrunk until they stay clear of walls and ledges, and the
speech bubble clamps to the screen instead of vanishing when they wander out of
view. **E** only talks — it used to nudge the camera too, which swung the view a
little on every line.

## The gate

`data/game.json` holds the question, the opening card and the ending text.
Answers are matched loosely — case, spaces and punctuation ignored — so
`"Silliness!"` matches `silliness`. The hint appears after two wrong tries.

This keeps casual visitors out; it is **not** security. The repo is public, so
anyone who goes looking can read the files.

---

## The fly-around

Press **Fly** and the platformer stops: the giraffe goes horizontal, leaves a
rainbow ribbon and a trail of sparks, and can cross a much larger map at speed.
No collision — fly through a tree, a platform, the house, and it shatters.
**Jump** does a corkscrew: a barrel roll and about 45% more distance over the
second it lasts.

**+10** scenery, **+200** a neighbour, **+500** a bird, the big two in larger
text with a bigger explosion. Nothing is kept — it's just nice to watch go up.

Built to survive a phone: every effect is a fixed-size pool, so nothing is
allocated per frame however long she flies. Shadows switch off on take-off,
since there's no sensible shadow frustum once she's crossing the whole map.
`js/celebration.js` holds all of it; the constants at the top are the knobs.

---

## The music

Four tracks off *Demos for Days*, in `music/`, played straight through and then
again from the top. `data/music.json` is the running order.

Two `<audio>` elements, not one: whatever is next is fetched while the current
track plays. Assigning `.src` at the moment a track ends meant downloading most
of a megabyte mid-game, which stutters on a phone connection and is invisible
when you test on localhost. The first track is fetched while she's still on the
title screen.

The playlist never restarts. The one exception is Sage's song, which cross-fades
and seeks past the silence.

To re-encode a new track at the same settings:

```bash
ffmpeg -i input.mp3 -map_metadata -1 -vn -codec:a libmp3lame -q:a 6 music/new-track.mp3
```

---

## Running it

Needs a web server — opening `index.html` off disk won't work, because browsers
block ES modules and `fetch` on `file://`.

```bash
python3 -m http.server 8773 --directory giraffe-world
```

Then open http://localhost:8773. To see it as she will, run `localStorage.clear()`
in the console and reload. **Esc** opens the pause menu, which has a Start over
button that does the same thing.

## Moving things around

`js/world.js` builds the level. `plat(x, surfaceY, z, w, d, colour)` — `surfaceY`
is the height you stand on. `js/config.js` holds the feel: run speed, jump
height, gravity, camera distance.

Quest objects sit at the `item.at` coordinates in `data/npcs.json`. If you move
one, check it's actually reachable and not buried inside a tree — both have
happened. After changing the world, load the game and run:

```js
const t = await import('./tools/check-world.js'); console.log(t.check());
```

## Publishing

```bash
git add -A && git commit -m "tweak the dialogue" && git push
```

GitHub Pages redeploys in under a minute. If the page looks stale, hard-reload —
the JSON is fetched with `cache: 'no-cache'` but the JS is cached for ten
minutes.
