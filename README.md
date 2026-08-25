# Guess the Bender

A two-player "Guess Who?" game set in the world of *Avatar: The Last Airbender*, playable entirely in the browser over the internet — no server or database required.

Networking uses [PeerJS](https://peerjs.com/) for a direct WebRTC connection between the two players' browsers, signaled through PeerJS's free public broker. Everything else is a static site (HTML/CSS/JS), so it can be hosted for free on GitHub Pages.

## How to play

1. One player clicks **Host Game** and gets a room code (e.g. `ember-472`).
2. They send that code to the other player (text, Discord, whatever).
3. The other player clicks **Join Game**, enters the code, and connects.
4. Both players secretly pick a character from the grid and hit **Confirm Selection**.
5. Take turns asking yes/no questions out loud (or in the chat box) and flip down characters on your board as you rule them out.
6. When you think you know their character, hit **Make Final Guess**, pick a character, and lock it in. The opponent confirms whether it's correct.
7. First to correctly guess the other's character wins. Hit **Play Again** for a rematch without leaving the room.

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
js/characters.js      Character roster + nation/element data
js/network.js         Thin PeerJS wrapper (host/join/send/events)
js/app.js             Game state machine and UI wiring
```

## Notes on the artwork

Character "portraits" are generated in CSS/JS from each character's nation color and an initials/emoji glyph, rather than using artwork from the show — keeps the project free of copyrighted assets while still being instantly recognizable by name.
