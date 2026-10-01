# EdgeChat Chess: corresponding source

Corresponding source for the chess engine and board in the EdgeChat app (Mac and iPhone),
under the GNU AGPL-3.0 and GPL-3.0.

## Upstream

| Project | Version | Licence | Used as |
|---|---|---|---|
| [Chesskit](https://github.com/GuillaumeSD/Chesskit) | commit `9622d502ab9fc84fc1486e22310a7df229a37e93` | AGPL-3.0 | play screen, **modified** |
| [Stockfish](https://github.com/official-stockfish/Stockfish/tree/sf_18) | 18, tag `sf_18`, commit `cb3d4ee9b47d0c5aae855b12379378ea1439675c` | GPL-3.0 | engine, **unmodified** |
| [stockfish.js](https://github.com/nmrugg/stockfish.js/tree/v18.0.0) | tag `v18.0.0`, commit `31a98753a5d932511693f44775da908377c24513` | GPL-3.0 | WebAssembly build of Stockfish, **unmodified** |

The app ships `stockfish-18-lite-single.js` (20,670 bytes, SHA-256 `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe`)
and `stockfish-18-lite-single.wasm` (7,295,411 bytes, SHA-256 `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1`),
the same files as `public/engines/stockfish-18/` in the Chesskit commit above.

Bundled libraries (exact versions in `package-lock.json`): chess.js 1.2.0 (BSD-2-Clause),
react-chessboard 4.7.3 (MIT), React 19.2.6 (MIT), react-dnd 16 (MIT), redux 4.2.1 (MIT),
lucide-react 0.468.0 (ISC), hoist-non-react-statics 3.3.2 (BSD-3-Clause). Chessnut pieces: Apache-2.0.

## What is modified

- `src/game.tsx`, `src/engine.ts`, `src/rules.ts`: adapted from Chesskit's board, play screen,
  UCI engine and undo logic. The chess rules (chess.js) and the engine settings are Chesskit's;
  the state, layout and engine lifecycle are rewritten.
- `src/wood.css`, `src/piece-sprite.tsx`, `src/home.tsx`, `src/main.tsx`, `src/settings.tsx`,
  `src/palette.ts`, `src/saved.ts`, `src/p2p.ts`, `build.mjs`, `ios/`: new.

All of it is distributed under AGPL-3.0 (`LICENSE`). Stockfish: GPL-3.0 (`LICENSE-GPL-3.0`).
All licence texts and credits are in `licenses/`.

## Build

```sh
npm ci
npm run build
```

Output goes to `dist/`. Built with Node 25 and npm 11, it is byte-identical to what the app ships:

| File | SHA-256 |
|---|---|
| `game.html` | `cc504229951c8d36f2ece3c5d95dade59ea5a3237dc8276f61d8edc591dd297f` |
| `package/assets/chess.js` | `570bf1ae4b4cd4036a6b0fff5e3989ef2aec7ba70edbd9e3be444c24c0c180ed` |
| `package/assets/chess.css` | `8ca252048045d2520d4a7f31386e3d530625ce25830ebba488a3c6d82b549ad5` |
| `package/assets/credits.html` | `59971a39cc9c475ade53f51d696933ce5cafe9b8031f7b272843a216bc44be64` |

To run it, put the two Stockfish files in `dist/package/assets/engine/` and serve `dist/` over HTTP.
On iPhone, the app places `package/assets/` next to the three files in `ios/`.
