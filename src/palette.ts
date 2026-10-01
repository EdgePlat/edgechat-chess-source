/* The two rooms this board can sit in.
 *
 * The host app tells games which appearance is in force (it sends `cmd:'theme'` on mount and again
 * whenever it changes — a game draws its own surfaces, and inside the sandbox `prefers-color-scheme`
 * follows macOS rather than the app's own setting, so the answer has to be handed over).
 *
 * The LIGHT values here are copied byte for byte out of game.tsx and home.tsx, so switching to this table
 * cannot change the light theme: `grep` the old hexes and they are all still here.
 *
 * The board itself stays a wooden board in both. A real set does not change colour when the lamps go out —
 * it only catches less light, so the dark values are the same timber a stop darker, which also keeps the
 * ivory-against-ebony contrast the game is actually played on.
 */
export type Theme = 'light' | 'dark';

export type BoardPalette = {
  light: { backgroundColor: string; backgroundImage: string; backgroundSize: string };
  dark: { backgroundColor: string; backgroundImage: string; backgroundSize: string };
  arrow: string;
  boardShadow: string;
  lastMoveFrom: string;
  lastMoveTo: string;
  selected: string;
  check: string;
  moveDot: string;
  captureRing: string;
  /* The home screen's still board is flat colour, no timber grain — it was drawn that way before there
   * were two themes and this keeps it that way. */
  homeLight: string;
  homeDark: string;
};

const TEXTURE = 'url(./assets/wood.jpg)';
const SIZE = '400% 400%';

const LIGHT: BoardPalette = {
  light: { backgroundColor: '#e4cba1', backgroundImage: `linear-gradient(#f3dbb2cf,#f3dbb2cf),${TEXTURE}`, backgroundSize: SIZE },
  dark: { backgroundColor: '#826044', backgroundImage: `linear-gradient(#77533580,#77533580),${TEXTURE}`, backgroundSize: SIZE },
  arrow: '#d6b67cbb',
  boardShadow: '0 0 0 1px #24190e, 0 2px 7px #100a0780',
  lastMoveFrom: 'inset 0 0 0 100px #dfbd6350',
  lastMoveTo: 'inset 0 0 0 100px #dfbd6365',
  selected: 'inset 0 0 0 3px #ead39a',
  check: 'inset 0 0 0 4px #a94335',
  moveDot: 'radial-gradient(#30221760 16%, transparent 18%)',
  captureRing: 'radial-gradient(transparent 58%, #39291c60 59%, #39291c60 69%, transparent 70%)',
  homeLight: '#e8d9bf',
  homeDark: '#8a6a4a',
};

/* Dimmer timber, and the marks that sit on it lifted to stay legible against it: a 50%-alpha highlight
 * tuned for a bright square disappears on a dark one. */
const DARK: BoardPalette = {
  light: { backgroundColor: '#b79a71', backgroundImage: `linear-gradient(#c3a67ec4,#c3a67ec4),${TEXTURE}`, backgroundSize: SIZE },
  dark: { backgroundColor: '#63482f', backgroundImage: `linear-gradient(#5a3f278c,#5a3f278c),${TEXTURE}`, backgroundSize: SIZE },
  arrow: '#e6c88ccc',
  boardShadow: '0 0 0 1px #100a06, 0 2px 10px #00000066',
  lastMoveFrom: 'inset 0 0 0 100px #f0cf7a42',
  lastMoveTo: 'inset 0 0 0 100px #f0cf7a5c',
  selected: 'inset 0 0 0 3px #f2dda8',
  check: 'inset 0 0 0 4px #c8564a',
  moveDot: 'radial-gradient(#12090480 16%, transparent 18%)',
  captureRing: 'radial-gradient(transparent 58%, #1a0f0780 59%, #1a0f0780 69%, transparent 70%)',
  homeLight: '#bda684',
  homeDark: '#6b5236',
};

export const boardPalette = (theme: Theme): BoardPalette => (theme === 'dark' ? DARK : LIGHT);
