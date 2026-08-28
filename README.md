# Guess the Bender

A two-player "Guess Who?" game set in the world of *Avatar: The Last Airbender*, playable entirely in the browser over the internet — no server or database required.

Networking uses [PeerJS](https://peerjs.com/) for a direct WebRTC connection between the two players' browsers, signaled through PeerJS's free public broker. Everything else is a static site (HTML/CSS/JS), so it can be hosted for free on GitHub Pages.

## How to play

1. One player clicks **Host Game** and gets a room code (e.g. `ember-472`).
2. They send that code to the other player (text, Discord, whatever).
3. The other player clicks **Join Game**, enters the code, and connects.
4. Both players secretly pick a character from the grid and hit **Confirm Selection**.
5. Take turns asking yes/no questions out loud (or in the chat box) and flip down characters on your board as you rule them out. Tap the 🔍 on any card for a full-size look at the artwork, or click your own character chip (top-left) to enlarge it.
6. When you think you know their character, hit **Make Final Guess**, pick a character, and lock it in. The opponent confirms whether it's correct.
7. If your guess is wrong, play continues. If it's right, the opponent gets **one final "equalizer" guess** to try to tie it up: guess their character correctly too and the round is a **draw**; guess wrong (or skip) and you win.
8. Hit **Play Again** for a rematch without leaving the room.

Note: since there's no server validating anything, the game trusts both players to answer honestly (yes/no to questions, confirming guesses) — same as playing Guess Who at a table.

## Running locally

No build step needed. Just serve the folder statically, e.g.:

```
npx serve .
```

or open `index.html` directly in two browser tabs/windows (works fine even without a local server, but a server avoids any browser file:// quirks).

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick your branch (e.g. `main`) and `/ (root)`, then save.
4. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/`.
5. Share that URL with your friend — one of you hosts a room, the other joins.

## Project structure

```
index.html          Screens/markup for menu, waiting room, character select, game, end
css/style.css        Styling and avatar rendering
js/characters.js      Character roster + nation/bender data + portrait paths
js/network.js         Thin PeerJS wrapper (host/join/send/events)
js/app.js             Game state machine and UI wiring
img/characters/       Character portrait images
```

## Notes on the artwork

Character portraits (`img/characters/*.jpg`) are cropped from a custom, AI-generated chibi-style character sheet, not artwork from the show — keeps the project free of copyrighted assets. To swap in your own art, drop a same-named `<id>.jpg` into `img/characters/` for each entry in `js/characters.js` (the `id` field is the filename).
