/* A game you walked away from.
 *
 * Leaving Chess ends the P2P session and unmounts the board, so a game in progress has nowhere to live
 * unless it is written down. As in an ordinary game, it waits, and you walk back into it.
 *
 * It is written through the host's checkpoint pipe (`event:'checkpoint'` out,
 * `cmd:'checkpoint'` back on the next mount), because the game runs in a sandbox with no origin of its
 * own and therefore no storage of its own. That pipe caps a record at 64 KB and keeps one per game.
 *
 * The position travels as PGN rather than FEN: the move list, the undo button and threefold repetition all
 * need the moves, not just where the pieces stand.
 */
import { Chess } from 'chess.js';

export type SavedGame = {
  v: 1;
  at: number;                                   // when it was put down, so the home screen can say
  pgn: string;
  color: 'w' | 'b';                             // which side is YOURS - the two players save opposite colours
  elo: number;                                  // only meaningful against the engine
  peer: { id: string; name: string } | null;    // null: the opponent was Stockfish
};

const MAX_PGN = 20000;

/** Replay a PGN, or say so and give back nothing. Anything that reaches here is untrusted: the chassis
 *  hands back whatever localStorage held, and in an online game the other app supplies it. */
export function replay(pgn: string): Chess | null {
  try {
    const board = new Chess();
    board.loadPgn(pgn);
    return board;
  } catch (error) {
    console.warn('[chess] a saved game could not be replayed, so it is being dropped.', error);
    return null;
  }
}

/** Validate a stored or received record. A game with no moves in it is not a game to come back to. */
export function readSaved(value: unknown): SavedGame | null {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') return null;
  if (record.v !== 1) return null;
  if (typeof record.pgn !== 'string' || !record.pgn.trim() || record.pgn.length > MAX_PGN) return null;
  if (record.color !== 'w' && record.color !== 'b') return null;

  let peer: SavedGame['peer'] = null;
  if (record.peer !== null && record.peer !== undefined) {
    const held = record.peer as Record<string, unknown>;
    if (typeof held !== 'object' || typeof held.id !== 'string' || typeof held.name !== 'string') {
      console.warn('[chess] a saved game named an opponent this app could not read; it is being dropped.');
      return null;
    }
    peer = { id: held.id, name: held.name };
  }

  const board = replay(record.pgn);
  if (!board) return null;
  if (board.history().length === 0) return null;         // an untouched board is not worth offering

  return {
    v: 1,
    at: typeof record.at === 'number' && isFinite(record.at) ? record.at : 0,
    pgn: record.pgn,
    color: record.color,
    elo: typeof record.elo === 'number' && isFinite(record.elo) ? record.elo : 1320,
    peer,
  };
}

/** Build the record a peer's opening message describes, so an incoming position gets the same scrutiny. */
export function savedFromPeer(pgn: string, color: 'w' | 'b', peer: { id: string; name: string }): SavedGame | null {
  return readSaved({ v: 1, at: Date.now(), pgn, color, elo: 1320, peer });
}

/** How long ago, in the words a person uses.
 *
 * `at` is written with every move, so it is the last move's moment rather than the instant the window
 * closed: leaving unmounts the frame, and a message posted during that teardown would not arrive. The
 * label therefore says "ago" and claims nothing more precise. A time rather than a move count: a count
 * says how far in the game is, not which evening it was. */
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'} ago`;

export function sinceLabel(at: number, now: number = Date.now()): string {
  const gap = now - at;
  if (!at || gap < 0) return '';                    // no timestamp, or a clock that has moved backwards
  if (gap < MINUTE) return 'just now';
  if (gap < HOUR) return plural(Math.floor(gap / MINUTE), 'minute');
  if (gap < DAY) return plural(Math.floor(gap / HOUR), 'hour');
  return plural(Math.floor(gap / DAY), 'day');
}

/* ---------------------------------------------------------------- what the person prefers
 * The chassis keeps ONE record per game, so preferences ride in the same envelope as the paused game.
 * `appearance: 'app'` means "whatever EdgeChat is showing"; light and dark override it, because the
 * appearance that suits a board is not always the one that suits the rest of the app.
 */
export type Appearance = 'app' | 'light' | 'dark';
export type Prefs = { appearance: Appearance; elo: number };
export const DEFAULT_PREFS: Prefs = { appearance: 'app', elo: 1320 };

export type Checkpoint = { game: SavedGame | null; prefs: Prefs };

/** Read either shape: v2 carries preferences beside the game, v1 was the bare game and still opens. */
export function readCheckpoint(value: unknown): Checkpoint {
  const record = value as Record<string, unknown> | null;
  if (record && typeof record === 'object' && record.v === 2) {
    const held = (record.prefs || {}) as Record<string, unknown>;
    const appearance = held.appearance === 'light' || held.appearance === 'dark' || held.appearance === 'app'
      ? held.appearance : DEFAULT_PREFS.appearance;
    const elo = typeof held.elo === 'number' && isFinite(held.elo) && held.elo >= 1 ? Math.round(held.elo) : DEFAULT_PREFS.elo;
    return { game: readSaved(record.game), prefs: { appearance, elo } };
  }
  return { game: readSaved(value), prefs: { ...DEFAULT_PREFS } };   // v1, or nothing at all
}

/** What goes back to the chassis. Preferences outlive the game, so clearing one keeps the other. */
export function checkpointValue(game: SavedGame | null, prefs: Prefs): Record<string, unknown> {
  return { v: 2, game, prefs: { appearance: prefs.appearance, elo: prefs.elo } };
}
