'use client';


/* Chesskit play screen adapted for EdgeChat. AGPL-3.0.
 * Rules, click/drag move flow, promotion and undo semantics follow upstream.
 * See licenses/ATTRIBUTION.md for source and changes.
 */
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { type Color, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { CustomPieces, CustomSquareProps, Piece } from 'react-chessboard/dist/chessboard/types';
import { Monitor, MoreHorizontal, RotateCcw, Flag, RefreshCw, ChevronRight, Download, X, SlidersHorizontal } from 'lucide-react';
import { ChesskitEngine } from './engine';
import { copyGame, gameResult, playMove, startingGame, undoPlayerMove } from './rules';
import { replay, type SavedGame } from './saved';
import { boardPalette, type Theme } from './palette';
import GameSettings from './settings';
import type { Appearance } from './saved';
import './wood.css';
import { WoodPiece } from './piece-sprite';

const pieceNames: Record<string, string> = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const pieceCodes = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as Piece[];
const customPieces: CustomPieces = Object.fromEntries(pieceCodes.map(code => [code, ({ squareWidth }: { squareWidth: number }) => (
  <WoodPiece piece={code} size={squareWidth} />
)]));

const WoodSquare = forwardRef<HTMLDivElement, Omit<CustomSquareProps, 'ref'>>(function WoodSquare({ children, style, square }, ref) {
  return <div ref={ref} style={style} role="button" tabIndex={0} aria-label={`Square ${square}`} data-wood-square={square} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[event.key];
    if (offset) {
      event.preventDefault();
      const squares = Array.from(event.currentTarget.closest('.wood-board')?.querySelectorAll<HTMLElement>('[data-wood-square]') || []);
      squares[squares.indexOf(event.currentTarget) + offset]?.focus();
    }
  }}>{children}</div>;
});

/* Playing a person instead of the engine. The board, the rules and every piece of the screen stay the
 * same; only three things change — the colour is handed to you rather than chosen, your move is also
 * sent, and Stockfish is not asked for a reply. The transport belongs to the host app. */
export type OnlinePlay = {
  color: Color;
  peerId: string;
  peerName: string;
  send: (move: { from: string; to: string; promotion?: string }) => void;
  subscribe: (apply: (move: { from: string; to: string; promotion?: string }) => void) => () => void;
  /* Resigning is a move in every sense except the board: it ends the game for BOTH people, so it has to
   * travel to the other side, or that side would keep waiting for a move that never comes. */
  resign: () => void;
  onResign: (apply: () => void) => () => void;
};

export default function WoodChess({ paused = false, online, resume, theme = 'light',
  appearance = 'app', onAppearance, prefElo, onElo, onSave, onClear }: {
  paused?: boolean;
  online?: OnlinePlay;
  theme?: Theme;                                 // which room the board is standing in
  appearance?: Appearance;                       // what the person chose, which may differ from the app
  onAppearance?: (value: Appearance) => void;
  prefElo?: number;                              // the strength a new game starts at
  onElo?: (value: number) => void;
  resume?: SavedGame | null;                     // a game being picked up again, from storage or from the peer
  onSave?: (record: SavedGame) => void;          // called after every move, so walking away costs nothing
  onClear?: () => void;                          // the game is over, or replaced: stop offering it
}) {
  const phone = !!(window as any).CHESS_IOS;
  const phoneMoves = useRef<HTMLDialogElement>(null);
  const phoneMore = useRef<HTMLDialogElement>(null);
  const [game, setGame] = useState(() => {
    const restored = resume ? replay(resume.pgn) : null;
    if (resume && !restored) console.warn('[chess] the game being resumed could not be reopened; starting a new one.');
    return restored || startingGame('', online ? online.color : resume ? resume.color : 'w', 1320);
  });
  const [playerColor, setPlayerColor] = useState<Color>(online ? online.color : resume ? resume.color : 'w');
  const [elo, setElo] = useState(resume ? resume.elo : (prefElo || 1320));
  const [resigned, setResigned] = useState(false);
  const [session, setSession] = useState(0);
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'thinking' | 'error'>('loading');
  const [engineError, setEngineError] = useState('');
  const [readySession, setReadySession] = useState<number | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const phonePieces: CustomPieces = useMemo(() => Object.fromEntries(pieceCodes.map(code => [code, ({ squareWidth, square, isDragging }: { squareWidth: number; square?: Square; isDragging: boolean }) => (
    <WoodPiece piece={code} size={squareWidth} lifted={isDragging || square === selected} dragging={isDragging} />
  )])), [selected]);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftColor, setDraftColor] = useState<Color>('w');
  const [draftElo, setDraftElo] = useState(1320);
  const [positionInput, setPositionInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [confirmResign, setConfirmResign] = useState(false);
  const [boardWidth, setBoardWidth] = useState(560);
  const engineRef = useRef<ChesskitEngine | null>(null);
  const gameRef = useRef(game);
  const boardRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const promotionRef = useRef<HTMLDialogElement>(null);
  const resignRef = useRef<HTMLDialogElement>(null);
  const moveEndRef = useRef<HTMLDivElement>(null);
  const fen = game.fen();
  const [peerResigned, setPeerResigned] = useState(false);
  const result = gameResult(game, resigned, playerColor, online ? online.peerName : 'Stockfish', peerResigned);
  const canPlay = !paused && !result && (online || engineState === 'ready') && game.turn() === playerColor && !promotion;
  const history = game.history({ verbose: true });
  const moveRows = Array.from(history.reduce((rows, move) => {
    const number = Number(move.before.split(' ')[5]);
    const row = rows.get(number) || { number, w: '', b: '' };
    row[move.color] = move.san;
    rows.set(number, row);
    return rows;
  }, new Map<number, { number: number; w: string; b: string }>()).values());
  const orientation = (playerColor === 'w') !== flipped ? 'white' : 'black';
  const paint = boardPalette(theme);

  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => {
    const element = boardRef.current;
    if (!element) { console.warn('Chess board size could not be measured: board element is missing.'); return; }
    const observer = new ResizeObserver(([entry]) => setBoardWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused) { queueMicrotask(() => { setReadySession(null); setEngineState('loading'); }); return; }
    let cancelled = false;
    let engine: ChesskitEngine;
    try { engine = new ChesskitEngine(); } catch (error) {
      console.error('Chess worker creation failed.', error);
      queueMicrotask(() => { if (!cancelled) { setEngineError('Your browser could not start the chess engine.'); setEngineState('error'); } });
      return () => { cancelled = true; };
    }
    engineRef.current = engine;
    engine.initialize().then(() => {
      if (!cancelled) { setEngineState('ready'); setReadySession(session); }
    }).catch(error => {
      if (cancelled) return;
      console.error('Chess engine initialization failed.', error);
      setEngineError(error instanceof Error ? error.message : 'The engine could not load.');
      setEngineState('error');
    });
    return () => { cancelled = true; engine.shutdown(); engineRef.current = null; };
  }, [session, paused]);

  useEffect(() => {
    if (online) return;                       // the other player is the opponent; Stockfish stays out of it
    if (paused || readySession !== session || game.turn() === playerColor || result) return;
    const engine = engineRef.current;
    if (!engine) { console.warn('Chess cannot request a move because its engine is missing.'); return; }
    let cancelled = false;
    // Upstream gives the bot a minimum one-second turn and searches to depth 16.
    const timer = setTimeout(() => {
      if (!cancelled) setEngineState('thinking');
    }, 0);
    Promise.all([engine.getEngineNextMove(fen, elo), new Promise(resolve => setTimeout(resolve, 1000))])
      .then(([move]) => {
        if (cancelled || gameRef.current.fen() !== fen) return;
        if (!move) throw new Error('Stockfish returned no move for an active game.');
        const next = playMove(gameRef.current, { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        gameRef.current = next;
        setGame(next);
        setEngineState('ready');
      }).catch(error => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        console.error('Chess engine could not complete its move.', error);
        setEngineError(error instanceof Error ? error.message : 'The engine could not complete its move.');
        setEngineState('error');
      });
    return () => { cancelled = true; clearTimeout(timer); };
    // 'thinking' is the state of this existing request, not a reason to cancel it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, elo, playerColor, result, session, readySession, paused, online]);

  /* The other person resigning ends the board here too, and says who did it. */
  useEffect(() => {
    if (!online) return;
    return online.onResign(() => { setPeerResigned(true); engineRef.current?.shutdown(); });
  }, [online]);

  /* A move from the other person. It is replayed through the same rules as our own, so a move that is not
   * legal in this position is dropped and said out loud rather than trusted: the peer's app is not ours. */
  useEffect(() => {
    if (!online) return;
    return online.subscribe(move => {
      const current = gameRef.current;
      if (current.turn() === online.color) { console.warn('[chess] a move arrived out of turn; ignored'); return; }
      try {
        const next = playMove(current, move);
        gameRef.current = next;
        setGame(next);
      } catch (error) {
        console.warn('[chess] the other side sent a move this position does not allow:', move, error);
      }
    });
  }, [online]);

  /* The board is the only place this game exists - closing Chess unmounts it and ends the session with
   * the other player. So every move is written through to the chassis, and the home screen offers the
   * game back, as if it had been paused. A decided game is cleared instead: nobody
   * wants to be offered a checkmate to walk back into. */
  useEffect(() => {
    if (!onSave || !onClear) return;
    if (result) { onClear(); return; }
    if (history.length === 0) return;
    onSave({
      v: 1, at: Date.now(), pgn: game.pgn(), color: playerColor, elo,
      peer: online ? { id: online.peerId, name: online.peerName } : null,
    });
    // `history` is derived from `game`; listing it too would re-save on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, result, playerColor, elo, online, onSave, onClear]);

  useEffect(() => { const list = moveEndRef.current?.parentElement; if (list) list.scrollTop = list.scrollHeight; }, [fen]);
  useEffect(() => {
    if (settingsOpen && !paused) settingsRef.current?.showModal(); else settingsRef.current?.close();
  }, [settingsOpen, paused]);
  useEffect(() => {
    if (promotion && !paused) promotionRef.current?.showModal(); else promotionRef.current?.close();
  }, [promotion, paused]);
  useEffect(() => {
    if (confirmResign && !paused) resignRef.current?.showModal(); else resignRef.current?.close();
  }, [confirmResign, paused]);

  const restartEngine = () => { setReadySession(null); setEngineState('loading'); setEngineError(''); setSession(value => value + 1); };
  const commitMove = (from: Square, to: Square, promote?: string) => {
    if (paused || result || game.turn() !== playerColor) return false;
    if (!online && engineState !== 'ready') return false;          // online play does not wait for Stockfish to load
    const legal = game.moves({ square: from, verbose: true }).filter(move => move.to === to);
    if (!legal.length) return false;
    if (legal.some(move => move.promotion) && !promote) { setPromotion({ from, to }); return false; }
    try {
      const next = playMove(game, { from, to, promotion: promote });
      gameRef.current = next;
      setGame(next);
      setSelected(null);
      setPromotion(null);
      if (online) online.send({ from, to, promotion: promote });   // after the local rules accepted it, never before
      return true;
    } catch (error) { console.error('Chess rejected a move previously reported as legal.', error); return false; }
  };
  const clickSquare = (square: Square) => {
    if (!canPlay) return;
    if (selected && commitMove(selected, square)) return;
    setSelected(game.get(square)?.color === playerColor ? square : null);
  };
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    const lastMove = game.history({ verbose: true }).at(-1);
    if (lastMove) {
      styles[lastMove.from] = { boxShadow: paint.lastMoveFrom };
      styles[lastMove.to] = { boxShadow: paint.lastMoveTo };
    }
    if (selected) {
      styles[selected] = { boxShadow: phone ? 'inset 0 0 0 1px #c6a46b55' : paint.selected };
      for (const move of game.moves({ square: selected, verbose: true })) {
        styles[move.to] = { backgroundImage: move.captured ? paint.captureRing : paint.moveDot };
      }
    }
    if (game.isCheck()) {
      const king = game.board().flat().find(piece => piece?.type === 'k' && piece.color === game.turn());
      if (king) styles[king.square] = { boxShadow: paint.check };
    }
    return styles;
  }, [game, selected, paint, phone]);

  const openSettings = () => { setDraftColor(playerColor); setDraftElo(elo); setInputError(''); setPositionInput(''); setSettingsOpen(true); };
  const startGame = () => {
    try {
      const next = startingGame(positionInput, draftColor, draftElo);
      gameRef.current = next;
      setGame(next); setPlayerColor(draftColor); setElo(draftElo); setResigned(false);
      setSelected(null); setPromotion(null); setFlipped(false); setSettingsOpen(false);
      onClear?.();                               // the game it replaces stops being on offer immediately
      restartEngine();
    } catch (error) {
      console.warn('Chess starting position could not be parsed.', error);
      setInputError(error instanceof Error ? error.message : 'Enter a valid FEN or PGN.');
    }
  };
  const undo = () => {
    const next = undoPlayerMove(game, playerColor);
    gameRef.current = next;
    setGame(next); setSelected(null); setPromotion(null); setResigned(false); restartEngine();
  };
  const downloadPgn = () => {
    const exported = copyGame(game);
    const winner = resigned ? (playerColor === 'w' ? 'b' : 'w') : game.isCheckmate() ? (game.turn() === 'w' ? 'b' : 'w') : null;
    exported.header('Result', winner ? (winner === 'w' ? '1-0' : '0-1') : game.isDraw() ? '1/2-1/2' : '*');
    const url = URL.createObjectURL(new Blob([exported.pgn()], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a'); link.href = url; link.download = 'edgechat-chess.pgn'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Whoever is across the board: the engine, or the person you invited. Every label that used to name
  // Stockfish asks this instead — an online game that says "Stockfish is thinking" is telling a lie about
  // who it is you are playing.
  const opponentName = online ? online.peerName : 'Stockfish';
  const yourTurn = game.turn() === playerColor && !result;
  const opponentUnder = online ? 'On their own device' : `Elo ${elo}`;
  const status = result
    || (online
      ? (game.turn() !== playerColor ? `Waiting for ${opponentName}…` : game.isCheck() ? 'You are in check' : 'Your move')
      : engineState === 'error' ? 'Engine paused'
      : engineState === 'loading' ? 'Preparing your opponent…'
      : game.turn() !== playerColor ? 'Stockfish is thinking…'
      : game.isCheck() ? 'You are in check' : 'Your move');
  const captured = (byColor: Color) => history.filter(move => move.color === byColor && move.captured).map(move => move.captured!);
  const renderPlayer = (color: Color) => {
    const isYou = color === playerColor;
    const active = game.turn() === color && !result;
    return <div className={`wood-player${active ? ' is-active' : ''}${active && !isYou ? ' is-waiting' : ''}`}><span className={`wood-avatar ${color === 'w' ? 'ivory' : 'ebony'}`}><WoodPiece piece={`${color}K` as Piece} decorative /></span><div><strong>{isYou ? 'You' : opponentName}</strong><span>{isYou ? (color === 'w' ? 'White pieces' : 'Black pieces') : opponentUnder}</span></div><div className="wood-captures" aria-label={`Pieces captured by ${isYou ? 'you' : opponentName}`}>{captured(color).map((piece, index) => <WoodPiece key={index} piece={`${color === 'w' ? 'b' : 'w'}${piece.toUpperCase()}` as Piece} />)}</div>{active && <span className="wood-turn">{isYou ? 'Your turn' : (online ? 'Their turn' : 'Thinking')}</span>}</div>;
  };
  // Taking a move back is a private thing: the other person's board would not follow, and the next move
  // sent from this one would be illegal on theirs. Offline only, until it can be a request they answer.
  const canUndo = !online && !resigned && !peerResigned && history.length >= (game.turn() === playerColor ? 2 : 1);

  return <div className="wood-chess" inert={paused || undefined}>
    {phone && <header className="phone-opponent"><Monitor size={25}/><div><strong>Computer</strong><span>Elo {elo}</span></div></header>}
    <div className="wood-layout">
      <section className="wood-play" aria-label="Chess game">
        {!phone && renderPlayer(playerColor === 'w' ? 'b' : 'w')}
        <div className={`wood-frame${game.turn() === playerColor && !result ? ' is-your-turn' : ''}`}><div ref={boardRef} className="wood-board" aria-label="Chessboard. Click a piece and then its destination, or drag to move.">
          <Chessboard id="edgechat-wood-chess" boardWidth={boardWidth} position={fen} boardOrientation={orientation}
            showBoardNotation={!phone} customPieces={phone ? phonePieces : customPieces} customSquare={WoodSquare} animationDuration={200} arePremovesAllowed={false}
            arePiecesDraggable={!!canPlay}
            isDraggablePiece={({ piece }) => piece[0] === playerColor}
            onPieceDragBegin={phone ? (_piece, square) => setSelected(square) : undefined}
            onPieceDragEnd={phone ? () => setSelected(null) : undefined}
            onPieceDrop={(from, to) => commitMove(from, to)} onSquareClick={clickSquare}
            onPromotionCheck={() => false}
            customSquareStyles={squareStyles} customArrowColor={paint.arrow}
            customLightSquareStyle={phone ? {...paint.light, backgroundColor: '#D8B77A', backgroundImage: 'linear-gradient(#E6C991aa,#E6C991aa),url(./assets/wood.jpg)'} : paint.light}
            customDarkSquareStyle={paint.dark}
            customNotationStyle={{ fontSize: '12px', fontWeight: '600', opacity: 0.8 }}
            customBoardStyle={{ borderRadius: '2px', boxShadow: paint.boardShadow }}
          />
        </div></div>
      </section>
      {phone ? <aside className="phone-panel">
        <div className="phone-player"><span className="phone-you"><WoodPiece piece={`${playerColor}P` as Piece} size={28} decorative/><span><strong>You</strong> · {playerColor === 'w' ? 'White' : 'Black'}</span></span><span className="phone-turn" role="status">{status === 'Your move' ? 'Your turn' : status}</span></div>
        {engineState === 'error' && <div className="wood-error"><p>{engineError}</p><button onClick={restartEngine}>Retry engine</button></div>}
        <div className="phone-moves"><div className="phone-moves-title"><strong>Moves</strong><button onClick={()=>phoneMoves.current?.showModal()}>View all <ChevronRight size={14}/></button></div>
          {!moveRows.length && <p className="phone-empty">No moves yet</p>}
          {moveRows.slice(-2).map(row=><div className="wood-move-row" key={row.number}><span>{row.number}.</span><span>{row.w || '—'}</span><span>{row.b || '—'}</span></div>)}
        </div>
        <nav className="phone-tools" aria-label="Game controls">
          <button onClick={undo} disabled={!canUndo}><RotateCcw size={22}/><span>Undo</span></button>
          {onAppearance && <GameSettings appearance={appearance} theme={theme} onAppearance={onAppearance} elo={elo} onElo={value=>{setElo(value);onElo?.(value);restartEngine();}}/>}
          <button onClick={()=>phoneMore.current?.showModal()}><MoreHorizontal size={24}/><span>More</span></button>
        </nav>
        <dialog className="wood-dialog phone-sheet" ref={phoneMoves} aria-label="All moves"><div className="wood-dialog-heading"><h2>Moves</h2><button aria-label="Close moves" onClick={()=>phoneMoves.current?.close()}><X/></button></div>
          {!moveRows.length && <p>No moves yet</p>}{moveRows.map(row=><div className="wood-move-row" key={row.number}><span>{row.number}.</span><span>{row.w || '—'}</span><span>{row.b || '—'}</span></div>)}
        </dialog>
        <dialog className="wood-dialog phone-sheet" ref={phoneMore} aria-label="More options"><div className="wood-dialog-heading"><h2>Options</h2><button aria-label="Close options" onClick={()=>phoneMore.current?.close()}><X/></button></div>
          <button onClick={()=>{phoneMore.current?.close();openSettings();}}>New game</button>
          <button onClick={()=>{phoneMore.current?.close();setConfirmResign(true);}} disabled={!!result}>Resign</button>
          <button onClick={()=>{setFlipped(value=>!value);phoneMore.current?.close();}}>Flip board</button>
          <button onClick={downloadPgn} disabled={!history.length}>Export PGN</button>
          <a href="./assets/credits.html">Credits</a>
        </dialog>
      </aside> : <aside className="wood-panel">
        <div className="wood-toolbar">
          {/* Neither belongs in a game against a person: there is no strength to set, and starting a new one
              here would leave the other player sitting at a board you have walked away from. */}
          {!online && onAppearance && (
            <GameSettings appearance={appearance} theme={theme} onAppearance={onAppearance}
              elo={elo} onElo={value => { setElo(value); onElo?.(value); restartEngine(); }} />
          )}
          {/* Against a person there is no strength to set, but the appearance is still yours to choose. */}
          {online && onAppearance && <GameSettings appearance={appearance} theme={theme} onAppearance={onAppearance} />}
          {!online && <button className="wood-new-game" onClick={openSettings}>New game <ChevronRight size={14} /></button>}
          {online && <span className="wood-online-tag">Playing {opponentName}</span>}
        </div>
        <h1 className="wood-sr">Chess</h1>
        <div className="wood-player-summary">{renderPlayer(playerColor)}</div>
        <div className={`wood-status${yourTurn ? ' is-yours' : ''}${online && !yourTurn && !result ? ' is-waiting' : ''}`} role="status" aria-live="polite"><span className={`wood-status-mark ${engineState === 'thinking' ? 'thinking' : ''}`}>♔</span><div><strong>{status}</strong></div></div>

        {engineState === 'error' && <div className="wood-error" role="alert"><p>{engineError}</p><button onClick={restartEngine}>Retry engine</button></div>}
        <div className="wood-score-heading"><h2>Moves</h2><span>{String(moveRows.length).padStart(2, '0')}</span></div>
        <div className="wood-score" aria-label="Move history">
          <div className="wood-score-labels"><span>#</span><span>White</span><span>Black</span></div>
          {!history.length && <div className="wood-empty"><small>No moves yet</small></div>}
          {moveRows.map(row => <div className="wood-move-row" key={row.number}><span>{row.number}.</span><span>{row.w || '—'}</span><span>{row.b || '—'}</span></div>)}
          <div ref={moveEndRef} />
        </div>
        <div className="wood-actions"><button onClick={undo} disabled={!canUndo}><RotateCcw size={16} /> Undo</button><button onClick={() => setConfirmResign(true)} disabled={!!result}><Flag size={16} /> Resign</button></div>
        <div className="wood-secondary"><button onClick={() => setFlipped(value => !value)} title="Flip board"><RefreshCw size={15} /> Flip board</button><button onClick={downloadPgn} disabled={!history.length} title="Download PGN"><Download size={17} /><span>Export PGN</span></button></div>
        <footer className="wood-credit"><a href="https://github.com/GuillaumeSD/Chesskit" target="_blank" rel="noreferrer">Chesskit</a> & Stockfish <span aria-hidden="true">·</span> <a href="./assets/credits.html" target="_blank" rel="noreferrer">Credits</a></footer>
      </aside>}
    </div>
    <dialog ref={settingsRef} aria-label="New game settings" className="wood-dialog" onCancel={() => setSettingsOpen(false)} onClose={() => setSettingsOpen(false)}>
      <div onKeyDown={event => {
        // The game sandbox intentionally blocks form submission. Keep keyboard activation local too.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); startGame(); }
      }}>
        <div className="wood-dialog-heading"><div><span className="wood-eyebrow">A FRESH BOARD</span><h2>New game</h2></div><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X /></button></div>
        <label className="wood-field">Play as<select value={draftColor} onChange={event => setDraftColor(event.target.value as Color)}><option value="w">White · You move first</option><option value="b">Black · Stockfish moves first</option></select></label>
        <label className="wood-field">Opponent strength <strong>Elo {draftElo}</strong><input type="range" min={1320} max={3190} step={10} value={draftElo} onChange={event => setDraftElo(Number(event.target.value))} /><span className="wood-range-labels"><span>1320</span><span>3190</span></span></label>
        <details className="wood-advanced"><summary>Start from a position</summary><label className="wood-field">FEN or PGN (optional)<textarea rows={3} value={positionInput} onChange={event => setPositionInput(event.target.value)} placeholder="Leave empty for a standard game" /></label></details>
        {inputError && <p className="wood-error" role="alert">{inputError}</p>}
        {history.length > 0 && !result && <p className="wood-dialog-note">Starting a new game replaces your current game.</p>}
        <button className="wood-primary" type="button" onClick={startGame}>Start game <ChevronRight size={18} /></button>
      </div>
    </dialog>
    <dialog ref={promotionRef} aria-label="Promote your pawn" className="wood-dialog" onCancel={() => setPromotion(null)} onClose={() => setPromotion(null)}><h2>Promote your pawn</h2><p>Choose a piece.</p><div className="wood-promotion">{['Q', 'R', 'B', 'N'].map(piece => <button key={piece} aria-label={`Promote to ${pieceNames[piece]}`} onClick={() => { if (promotion) commitMove(promotion.from, promotion.to, piece.toLowerCase()); }}><WoodPiece piece={`${playerColor}${piece}` as Piece} /></button>)}</div><button className="wood-text-button" onClick={() => setPromotion(null)}>Cancel</button></dialog>
    <dialog ref={resignRef} aria-label="Resign game" className="wood-dialog" onCancel={() => setConfirmResign(false)} onClose={() => setConfirmResign(false)}><h2>Resign this game?</h2><p>{online ? `${opponentName} will win.` : 'Stockfish will win.'} You can start a new game whenever you like.</p><div className="wood-actions"><button onClick={() => setConfirmResign(false)}>Keep playing</button><button onClick={() => { setResigned(true); setConfirmResign(false); online?.resign(); engineRef.current?.shutdown(); }}>Resign</button></div></dialog>
  </div>;
}
