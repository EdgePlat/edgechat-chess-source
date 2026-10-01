/* The first screen. With two ways to play (Stockfish or a person), there has to be a place to choose.
 *
 * The online half is honest about itself: when playing together is switched off, or nobody is paired yet,
 * the button says so instead of failing after the click. */
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { CustomPieces, CustomSquareProps, Piece } from 'react-chessboard/dist/chessboard/types';
import { Users, Cpu, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import { p2p, inviteProblem, type Peer } from './p2p';
import { replay, sinceLabel, type SavedGame } from './saved';
import { boardPalette, type Theme } from './palette';
import GameSettings from './settings';
import type { Appearance } from './saved';
import { WoodPiece } from './piece-sprite';
import './wood.css';

/* The same board, the same wood, the same pieces as the game behind it - a still one. A front door
 * made of the room it opens onto. */
const pieceCodes = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as Piece[];
const homePieces: CustomPieces = Object.fromEntries(pieceCodes.map(code => [code, ({ squareWidth }: { squareWidth: number }) => (
  <WoodPiece piece={code} size={squareWidth} />
)]));
const HomeSquare = forwardRef<HTMLDivElement, Omit<CustomSquareProps, 'ref'>>(function HomeSquare({ children, style }, ref) {
  return <div ref={ref} style={style}>{children}</div>;
});
// Réti v Tartakower, Vienna 1910, one move before the queen sacrifice: a board worth looking at.
const HOME_POSITION = 'rnb1kb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1';
/* With a game waiting, the front door shows THAT position instead: the room it opens onto is your own
 * half-finished game. */
function HomeBoard({ size, position, orientation, theme }: { size: number; position?: string; orientation?: 'white' | 'black'; theme: Theme }) {
  const paint = boardPalette(theme);
  return (
    <div className="wood-frame chess-home-frame" aria-hidden="true">
      <div className="wood-board">
        <Chessboard id="chess-home-board" boardWidth={size} position={position || HOME_POSITION}
          boardOrientation={orientation || 'white'}
          customPieces={homePieces} customSquare={HomeSquare} arePiecesDraggable={false}
          customDarkSquareStyle={{ backgroundColor: paint.homeDark }} customLightSquareStyle={{ backgroundColor: paint.homeLight }}
          showBoardNotation={false} animationDuration={0} />
      </div>
    </div>
  );
}

type Props = {
  theme: Theme;
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
  elo: number;
  onElo: (value: number) => void;
  saved: SavedGame | null;
  onSolo: (resume?: SavedGame) => void;
  onOnline: (peer: Peer, resume?: SavedGame) => void;
};

export default function ChessHome({ theme, appearance, onAppearance, elo, onElo, saved, onSolo, onOnline }: Props) {
  const [ready, setReady] = useState<boolean | null>(null);   // null = still asking
  const [peers, setPeers] = useState<Peer[]>([]);
  const [picking, setPicking] = useState(false);
  const [waitingFor, setWaitingFor] = useState<Peer | null>(null);
  const [problem, setProblem] = useState('');

  const loadPeers = async () => setPeers(await p2p.peers());

  /* Pairing finishes on its own a second or two after the other person pastes the invitation, and whether
   * someone is online changes while you are looking at the list. Read it on a timer so the screen is not a
   * photograph: read once on mount, it would still say nobody is there after pairing has finished.
   * Nothing is cleared while re-reading — the list never blinks. */
  useEffect(() => {
    if (!picking || ready !== true) return;
    let alive = true;
    const tick = async () => { const list = await p2p.peers(); if (alive) setPeers(list); };
    const timer = setInterval(tick, 2500);
    tick();
    return () => { alive = false; clearInterval(timer); };
  }, [picking, ready]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const on = await p2p.available();
      if (!alive) return;
      setReady(on);
      if (on) await loadPeers();
    })();
    return () => { alive = false; };
  }, []);

  /* Which invitation the screen is waiting on. Cancel moves it on, so an answer to one the person already
   * cancelled neither opens a board nor puts an error under the list. */
  const asking = useRef(0);
  const invite = async (peer: Peer, resume?: SavedGame) => {
    const mine = ++asking.current;
    setWaitingFor(peer); setProblem('');
    const reply = await p2p.invite(peer.id);
    if (mine !== asking.current) {
      // A yes that arrives after Cancel opened a session nobody is at: close it rather than leave them waiting.
      if (reply && reply.ok) p2p.leave();
      return;
    }
    setWaitingFor(null);
    if (reply && reply.ok) { onOnline(peer, resume); return; }
    // Withdrawn (this screen's Cancel reaching the shell): back to the list, no line.
    if (reply && reply.error === 'cancelled') { loadPeers(); return; }
    setProblem(inviteProblem(String(reply && reply.error), peer.name));
    loadPeers();
  };
  const cancel = () => { asking.current += 1; p2p.cancel(); setWaitingFor(null); };

  /* Both read from the same record, so the button and the board can never describe different games. */
  const waiting = useMemo(() => {
    if (!saved) return null;
    const board = replay(saved.pgn);
    if (!board) return null;
    const moves = board.history().length;
    return {
      fen: board.fen(),
      orientation: (saved.color === 'w' ? 'white' : 'black') as 'white' | 'black',
      title: saved.peer ? `Back to your game with ${saved.peer.name}` : 'Back to your game',
      // When, not how far in. A count of moves says nothing about which game this was.
      under: [saved.peer ? '' : 'Against the computer', sinceLabel(saved.at)].filter(Boolean).join(' · ')
        || `${moves} ${moves === 1 ? 'move' : 'moves'} played`,
    };
  }, [saved]);

  const resume = () => {
    if (!saved) return;
    if (saved.peer) { invite({ id: saved.peer.id, name: saved.peer.name, online: true }, saved); return; }
    onSolo(saved);
  };

  const [boardSize, setBoardSize] = useState(() => Math.min(380, Math.max(220, Math.round(window.innerWidth * 0.3))));
  useEffect(() => {
    const fit = () => setBoardSize(Math.min(380, Math.max(220, Math.round(window.innerWidth * 0.3))));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  if ((window as any).CHESS_IOS) return <div className="wood-chess phone-home">
    <div className="phone-home-settings"><GameSettings appearance={appearance} theme={theme} onAppearance={onAppearance} elo={elo} onElo={onElo} /></div>
    <img className="phone-hero" src="./art/home-hero.png" alt="Wooden chess pieces suspended over a turning chessboard" />
    <h1 aria-label="Chess"><svg className="phone-wordmark" viewBox="55 201 1155 406" aria-hidden="true"><image href="./art/wordmarks.png" width="1254" height="1254"/></svg></h1>
    <button aria-label={saved ? 'Continue' : 'Play'} className="phone-play" onClick={() => onSolo(saved || undefined)}>{saved ? 'Continue' : <svg className="phone-play-wordmark" viewBox="309 793 662 386" aria-hidden="true"><image href="./art/wordmarks.png" width="1254" height="1254"/></svg>}</button>
  </div>;

  if (waitingFor) return (
    <div className="wood-chess chess-home">
      <div className="chess-home-layout is-waiting">
        <HomeBoard size={boardSize} position={waiting?.fen} orientation={waiting?.orientation} theme={theme} />
        <div className="chess-home-card">
          <h1>Waiting for {waitingFor.name}</h1>
          {/* While waiting: three dots taking turns, the same
              slow breath the in-game waiting dot uses — someone is thinking, nothing is loading. */}
          <div className="chess-home-wait" aria-hidden="true"><i /><i /><i /></div>
          <p className="chess-home-sub">They see your invitation on their device. The board opens as soon as they say yes.</p>
          <button className="chess-home-ghost" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="wood-chess chess-home">
      {/* Top right of the screen, where a settings control is looked for. */}
      <div className="chess-home-corner">
        <GameSettings appearance={appearance} theme={theme} onAppearance={onAppearance} elo={elo} onElo={onElo} />
      </div>
      <div className="chess-home-layout">
      <HomeBoard size={boardSize} position={waiting?.fen} orientation={waiting?.orientation} theme={theme} />
      <div className="chess-home-card">
        <h1>Chess</h1>
        <p className="chess-home-sub">Play a friend on their own device, or take on the engine.</p>

        {!picking && (
          <div className="chess-home-choices">
            {waiting && (
              <button className="chess-home-choice chess-home-resume" onClick={resume}>
                <RotateCcw size={20} />
                <span><strong>{waiting.title}</strong><em>{waiting.under}</em></span>
                <ChevronRight size={18} />
              </button>
            )}
            <button className="chess-home-choice" onClick={() => { setProblem(''); setPicking(true); loadPeers(); }} disabled={ready !== true}>
              <Users size={20} />
              <span><strong>Play a friend</strong><em>{ready === null ? 'Checking…' : ready ? 'On their device, over your own connection' : 'Switch on P2P-Comms in Settings to use this'}</em></span>
              <ChevronRight size={18} />
            </button>
            <button className="chess-home-choice" onClick={() => onSolo()}>
              <Cpu size={20} />
              <span><strong>Play the computer</strong><em>Stockfish, from a gentle 1320 upwards</em></span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {picking && (
          <div className="chess-home-peers">
            {peers.length === 0 && (
              <p className="chess-home-empty">
                Nobody yet. Press <strong>Add someone</strong> to invite a friend — once they accept, they appear
                here on their own, and you do not need to press anything.
              </p>
            )}
            {peers.map(peer => (
              <button key={peer.id} className="chess-home-peer" onClick={() => invite(peer)} disabled={!peer.online}>
                <span className={peer.online ? 'chess-home-dot on' : 'chess-home-dot'} />
                <strong>{peer.name}</strong>
                <em>{peer.online ? 'Online' : 'Not online'}</em>
              </button>
            ))}
            <div className="chess-home-row">
              <button className="chess-home-ghost" onClick={() => setPicking(false)}>Back</button>
              <button className="chess-home-ghost" onClick={loadPeers}><RefreshCw size={14} /> Refresh</button>
              <button className="chess-home-ghost" onClick={async () => {
                const r = await p2p.pair();
                if (r && r.ok) { setProblem(''); loadPeers(); }
                else if (r && r.error === 'unsupported') p2p.openSettings();
              }}>Add someone</button>
            </div>
          </div>
        )}

        {problem && <p className="chess-home-problem">{problem}</p>}
      </div>
      </div>
    </div>
  );
}
