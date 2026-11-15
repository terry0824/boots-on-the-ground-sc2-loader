# Boots on the Ground: StarCraft II loader

**An optional plugin for [Boots on the Ground](https://github.com/terry0824/boots-on-the-ground-game), a fan-made shooter inspired by StarCraft II.**

> **Fan-made · Free · Non-commercial.** This plugin is part of a free, open fan project, made by players who love StarCraft II. It is not affiliated with or endorsed by Blizzard Entertainment. StarCraft, StarCraft II and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc., and StarCraft II's models, textures, sounds, music, maps and characters are its intellectual property. None of them is in this repository or in anything built from it. Free for personal use; never to be sold or distributed for commercial use.

Boots on the Ground is a game of its own, with its own world and content. If you own StarCraft II, this loader lets the game borrow StarCraft II's instead, from your own copy:

- its models, textures, sounds and music;
- its maps, and the missions that play on them;
- its names and story.

**Your copy, on your computer.** The loader reads the StarCraft II installed on the computer you play on, while you play. Nothing is uploaded, copied, shared or published, and nothing connects to Battle.net. Your browser remembers which folder you picked, on your computer only (Chrome and Edge), so next time the start page offers to continue with it in one click, or to pick another; while you play, moving between missions never asks again. What it reads is cached in your browser so the next start is quicker, and the game's settings can clear it.

## Play

The game with the loader built in: open [the game's page](https://boots-on-the-ground.pages.dev), the one to share, and choose **Play original (work in progress)** for the game's own content, or **Play with your StarCraft II installation** and pick the folder StarCraft II is installed in (usually `C:\Program Files (x86)\StarCraft II` on Windows, `/Applications/StarCraft II` on a Mac).

[`demo/index.html`](demo/index.html) is the same game in a single file, to download and open in Chrome or Edge with no server: it plays with your StarCraft II (the game's own content is too big for one file, and comes with the page).

## Host it yourself

The [ready build](https://github.com/terry0824/boots-on-the-ground-sc2-loader/releases/latest) attached to this repository's releases is the whole game, the loader and the game's own content included, as a folder of plain files: unzip it and put the folder on any static web host (Cloudflare Pages, GitHub Pages, Netlify, or any web server). It needs HTTPS for the folder picker; nothing runs on the server, and every player's StarCraft II stays on their own computer. Keep its `LICENSE-CONTENT.md` with it: the game's content may be hosted and shared free and unchanged, not taken apart or sold.

## Use it

You need StarCraft II installed on the computer you play on: open the game's page above, host the ready build, or run the game from its source with the loader in it.

**From the source:** put this repository in the game's `plugins` folder, then run the game as its README says:

```bash
cd boots-on-the-ground-game
git clone https://github.com/terry0824/boots-on-the-ground-sc2-loader.git plugins/sc2-loader
npm run dev
```

The start page then offers **Play with your StarCraft II installation** beside **Play original (work in progress)**. The game's own content isn't in its source: copy the ready build's `content/original/` folder over the game's `public/content/original/` to play with it (StarCraft II's content fills in either way).

## License

The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE): use it, change it and share it, for anything but commerce. Code from other projects is listed with its license in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

StarCraft, StarCraft II and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. This project is not affiliated with, endorsed or sponsored by Blizzard Entertainment.
