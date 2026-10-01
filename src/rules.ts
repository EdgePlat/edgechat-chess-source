/* Play-state adapters derived from Chesskit useChessActions.ts and
 * sections/play/undoMoveButton.tsx. AGPL-3.0, see licenses/ATTRIBUTION.md.
 * All chess rules remain in the same chess.js version used upstream.
 */
import { Chess, type Color } from 'chess.js';

export function copyGame(game: Chess): Chess {
  const next = new Chess();
  // Upstream strips the terminal result from a header-only PGN: chess.js 1.2.0
  // cannot round-trip its own empty-game PGN otherwise.
  if (game.history().length === 0) {
    const sections = game.pgn().split(']');
    if (['1-0', '0-1', '1/2-1/2', '*'].includes(sections.at(-1)?.trim() ?? '')) {
      next.loadPgn(sections.slice(0, -1).join(']') + ']');
      return next;
    }
  }
  next.loadPgn(game.pgn());
  return next;
}

export function playMove(game: Chess, move: { from: string; to: string; promotion?: string }): Chess {
  const next = copyGame(game);
  next.move(move);
  return next;
}

export function undoPlayerMove(game: Chess, playerColor: Color): Chess {
  const next = copyGame(game);
  const count = game.turn() === playerColor ? 2 : 1;
  if (next.history().length < count) return next;
  for (let i = 0; i < count; i++) next.undo();
  return next;
}

export function startingGame(input: string, playerColor: Color, elo: number): Chess {
  const trimmed = input.trim();
  let fen: string | undefined;
  if (trimmed.startsWith('[')) {
    const imported = new Chess();
    imported.loadPgn(trimmed);
    fen = imported.fen();
  } else fen = trimmed || undefined;
  const game = new Chess(fen);
  game.header('White', playerColor === 'w' ? 'You' : 'Stockfish 18 Lite', 'Black', playerColor === 'b' ? 'You' : 'Stockfish 18 Lite');
  game.header(playerColor === 'w' ? 'BlackElo' : 'WhiteElo', String(elo));
  return game;
}

/* `opponent` is who is actually across the board — Stockfish on your own, a person when you are playing one.
 * Saying "Stockfish wins" to someone who just resigned against their friend was the giveaway that the whole
 * end-of-game path had never been told there might be a person there. */
export function gameResult(game: Chess, resigned: boolean, playerColor: Color,
  opponent = 'Stockfish', theyResigned = false): string | null {
  if (theyResigned) return `${opponent} resigned · You win`;
  if (resigned) return `You resigned · ${opponent} wins`;
  if (game.isCheckmate()) return game.turn() === playerColor ? `Checkmate · ${opponent} wins` : 'Checkmate · You win';
  if (game.isStalemate()) return 'Draw · Stalemate';
  if (game.isThreefoldRepetition()) return 'Draw · Threefold repetition';
  if (game.isInsufficientMaterial()) return 'Draw · Insufficient material';
  if (game.isDraw()) return 'Draw · Fifty-move rule';
  return null;
}
