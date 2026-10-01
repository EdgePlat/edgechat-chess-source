# Chess — source and credits

This game adapts the human-versus-computer play flow from
[GuillaumeSD/Chesskit](https://github.com/GuillaumeSD/Chesskit), revision
`9622d502ab9fc84fc1486e22310a7df229a37e93`.

Chesskit is licensed under AGPL-3.0 according to its LICENCE and COPYING.md.
Its package.json says GPL-3.0-only; this game follows the actual
LICENCE/COPYING files, retaining them unmodified beside this document.

## Preserved gameplay

- chess.js 1.2.0 handles legal moves, castling, en passant, all four promotions,
  checkmate, stalemate, repetition, insufficient material and fifty-move draws.
- react-chessboard 4.7.3 provides the original board's drag/drop interaction.
- Stockfish 18 Lite single-threaded JS/WASM is copied byte-for-byte from the
  pinned Chesskit revision (its default engine), and runs in a local Web Worker.
- The UCI initialization, MultiPV 3, UCI_LimitStrength/UCI_Elo 1320–3190,
  depth-16 search and minimum one-second bot turn follow Chesskit.
- Click-to-move and promotion follow components/board/index.tsx.
- Undo removes one pending human move or a completed human/bot pair, following
  sections/play/undoMoveButton.tsx. Optional FEN/PGN positions follow its settings.

## Changes

Wooden visual theme, its own route inside the app, adapted React state and layout
in place of MUI/Jotai, engine lifecycle cancellation, errors and timeout feedback,
new-game/resign dialogs, PGN download, a home screen, light and dark themes, a saved
game, and play against another person through the host app. No substitute chess
rules or bot AI. The larger Chesskit site's analysis, account and multi-engine tools
are not ported.

Adapted module sources (AGPL-3.0):
- [game.tsx](../source/src/game.tsx)
- [engine.ts](../source/src/engine.ts)
- [rules.ts](../source/src/rules.ts)
- [wood.css](../source/src/wood.css)
- [piece-sprite.tsx](../source/src/piece-sprite.tsx)

## Other components

- Stockfish.js 18 — Chess.com LLC / Stockfish contributors, GPL-3.0.
  https://github.com/nmrugg/stockfish.js (tag v18.0.0).
- Original Chessnut SVG assets (retained as upstream source assets) — Alexis Luengas, Apache-2.0, copied unchanged from Chesskit.
  https://github.com/LexLuengas/chessnut-pieces
- chess.js — Jeff Hlywa and contributors, BSD-2-Clause.
- react-chessboard — react-chessboard contributors, MIT.
- Chess cover icon, wood texture and 3D wooden Staunton piece atlas — generated for this game using OpenAI imagegen.
- The 3D pieces replace the on-board pieces, player portraits, capture list and promotion picker; game rules and engine are unchanged.

## Corresponding source

The complete corresponding source of this game (sources, package.json,
package-lock.json, build script, iPhone adapter and these licence texts) is
published at https://github.com/EdgePlat/edgechat-chess-source (tag `v2026.10.01`),
and a copy ships beside the game in `assets/source/`.
Stockfish is unmodified; its source: https://github.com/nmrugg/stockfish.js/tree/v18.0.0
(built from https://github.com/official-stockfish/Stockfish/tree/sf_18).
