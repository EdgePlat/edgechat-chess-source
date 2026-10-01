import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WoodChess, { type OnlinePlay } from './game';
import ChessHome from './home';
import { p2p, type Peer } from './p2p';
import { readCheckpoint, checkpointValue, savedFromPeer, DEFAULT_PREFS,
  type SavedGame, type Prefs, type Appearance } from './saved';
import { type Theme } from './palette';

type Move = { from: string; to: string; promotion?: string };
const isMove = (x: any): x is Move =>
  !!x && typeof x.from === 'string' && typeof x.to === 'string'
  && /^[a-h][1-8]$/.test(x.from) && /^[a-h][1-8]$/.test(x.to)
  && (x.promotion === undefined || /^[qrbn]$/.test(x.promotion));

function send(event: string) { window.parent.postMessage({ type: 'game', event }, '*'); }

/* Chess has two ways to play, so it opens on a choice rather than on a board.
 * 'home' is also where an invitation lands: a session the person accepted elsewhere arrives here.
 *
 * 'joining' is the second or so between a session opening and the other side saying which colours are
 * whose. It used to show a board during that gap - one that flipped underneath you when the answer came,
 * and now would also have to throw away the position it had just drawn. */
type Mode =
  | { at: 'home' }
  | { at: 'solo'; resume: SavedGame | null }
  | { at: 'joining'; peer: { id: string; name: string } }
  | { at: 'online'; peer: { id: string; name: string }; resume: SavedGame | null };

const OPENING_MESSAGE_WAIT = 8000;

function App() {
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);                 // bumped on every move between screens: the board remounts
  const [mode, setMode] = useState<Mode>({ at: 'home' });
  const [saved, setSaved] = useState<SavedGame | null>(null);
  /* The appearance is the chassis's to know, not ours: inside the sandbox `prefers-color-scheme` follows
   * macOS rather than the app's own setting, so it is handed to us on mount and again on every change. */
  const [appTheme, setAppTheme] = useState<Theme>('light');
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULT_PREFS });
  // 'app' follows EdgeChat; the two overrides are the person's own choice and win.
  const theme: Theme = prefs.appearance === 'app' ? appTheme : prefs.appearance;

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'game') return;
      if (event.data.cmd === 'pause') setPaused(true);
      if (event.data.cmd === 'resume') setPaused(false);
      // The chassis hands back the game we left, once, just after 'ready'.
      if (event.data.cmd === 'checkpoint') {
        const held = readCheckpoint(event.data.value);
        setSaved(held.game);
        setPrefs(held.prefs);
      }
      if (event.data.cmd === 'theme') setAppTheme(event.data.value === 'dark' ? 'dark' : 'light');
      if (event.data.cmd === 'restart') { setPaused(false); setMode({ at: 'home' }); setRun(value => value + 1); send('ready'); }
    };
    window.addEventListener('message', receive);
    send('ready');
    return () => window.removeEventListener('message', receive);
  }, []);

  // One switch for the whole document, so the stylesheet can do the rest without a prop reaching every rule.
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  /* A game in progress lives in the chassis, not in this document: the sandbox has no storage of its own,
   * and leaving Chess ends the session and unmounts the board. See saved.ts. */
  // Preferences outlive any one game, so both halves go back together and clearing the game keeps them.
  const write = useCallback((game: SavedGame | null, next: Prefs) => {
    window.parent.postMessage({ type: 'game', event: 'checkpoint', value: checkpointValue(game, next) }, '*');
  }, []);
  const savedRef = useRef<SavedGame | null>(null);
  const prefsRef = useRef<Prefs>(prefs);
  useEffect(() => { savedRef.current = saved; prefsRef.current = prefs; }, [saved, prefs]);

  const saveGame = useCallback((record: SavedGame) => {
    setSaved(record);
    write(record, prefsRef.current);
  }, [write]);
  const clearGame = useCallback(() => {
    setSaved(null);
    write(null, prefsRef.current);
  }, [write]);
  const setAppearance = useCallback((appearance: Appearance) => {
    setPrefs(current => { const next = { ...current, appearance }; write(savedRef.current, next); return next; });
  }, [write]);
  const setElo = useCallback((elo: number) => {
    setPrefs(current => { const next = { ...current, elo }; write(savedRef.current, next); return next; });
  }, [write]);

  /* The two halves of one table. The inviter names the colours in the first message, which is also how the
   * chassis learns this session is for Chess at all; when the inviter is picking a game back up, that same
   * message carries the moves so far, and both boards reopen on the position they left. */
  const [role, setRole] = useState<'w' | 'b'>('w');
  const peerMove = useRef<((move: Move) => void) | null>(null);
  const queued = useRef<Move[]>([]);

  /* The host's first move: say which colours are whose (and, picking a game back up, the moves so far), then open
   * the board. The home screen calls this when its own invitation is accepted; so does an invitation sent from the
   * Friends chat, whose accepted session the chassis hands over as 'host-session'. */
  const startAsHost = useCallback((peer: { id: string; name: string }, picked?: SavedGame) => {
    const color: 'w' | 'b' = picked ? picked.color : 'w';
    setRole(color);
    p2p.send({ game: 'chess', t: 'start', white: color === 'w' ? 'them' : 'me', ...(picked ? { pgn: picked.pgn } : {}) });
    setMode({ at: 'online', peer, resume: picked || null });
    setRun(value => value + 1);
  }, []);
  /* A game against the computer gives way: it was saved after every move, the way closing Chess leaves it.
   * A table with a person is never interrupted - the chassis closes a second session before it gets here. */
  const modeRef = useRef<Mode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => p2p.on(event => {
    if (event.kind === 'session') { setRole('b'); setMode({ at: 'joining', peer: event.peer }); return; }
    if (event.kind === 'closed') { queued.current = []; setMode({ at: 'home' }); return; }
    if (event.kind === 'host-session') {
      const at = modeRef.current.at;
      if (at === 'joining' || at === 'online') { console.warn('[chess] already playing someone; the new session is ignored.'); return; }
      setPaused(false);
      startAsHost(event.peer);
      return;
    }
    if (event.kind === 'message') {
      const body: any = event.body;
      if (!body || typeof body !== 'object') return;
      if (body.t === 'start') {
        const color: 'w' | 'b' = body.white === 'them' ? 'b' : 'w';
        setRole(color);
        setMode(current => {
          if (current.at !== 'joining' && current.at !== 'online') {
            // The chassis emits 'session' before any message, so this means the session never reached us.
            console.warn('[chess] the other side opened a game this app has no session for; ignoring it.');
            return current;
          }
          const pgn = typeof body.pgn === 'string' ? body.pgn : '';
          const resume = pgn ? savedFromPeer(pgn, color, current.peer) : null;
          if (pgn && !resume) console.warn('[chess] the other side sent a position this app could not replay; starting a new game.');
          return { at: 'online', peer: current.peer, resume };
        });
        setRun(value => value + 1);
        return;
      }
      if (body.t === 'move' && isMove(body.move)) {
        if (peerMove.current) peerMove.current(body.move); else queued.current.push(body.move);
      }
      // Held the same way a move is when the board is not listening yet: an end to the game must not be the
      // one message that goes missing.
      if (body.t === 'resign') { if (peerResign.current) peerResign.current(); else resignQueued.current = true; }
    }
  }), []);

  /* An opening message that never arrives would otherwise leave this screen saying "setting up" for good. */
  useEffect(() => {
    if (mode.at !== 'joining') return;
    const timer = setTimeout(() => {
      console.warn('[chess] the other side never said which colours to play; opening a new board as black.');
      setMode(current => (current.at === 'joining' ? { at: 'online', peer: current.peer, resume: null } : current));
      setRun(value => value + 1);
    }, OPENING_MESSAGE_WAIT);
    return () => clearTimeout(timer);
  }, [mode]);

  const peerResign = useRef<(() => void) | null>(null);
  const resignQueued = useRef(false);

  const online: OnlinePlay | undefined = mode.at === 'online' ? {
    color: role,
    peerId: mode.peer.id,
    peerName: mode.peer.name,
    send: (move: Move) => { p2p.send({ game: 'chess', t: 'move', move }); },
    resign: () => { p2p.send({ game: 'chess', t: 'resign' }); },
    onResign: (apply: () => void) => {
      peerResign.current = apply;
      if (resignQueued.current) { resignQueued.current = false; apply(); }
      return () => { if (peerResign.current === apply) peerResign.current = null; };
    },
    subscribe: (apply: (move: Move) => void) => {
      peerMove.current = apply;
      for (const move of queued.current.splice(0)) apply(move);
      return () => { if (peerMove.current === apply) peerMove.current = null; };
    },
  } : undefined;

  const resume = mode.at === 'online' || mode.at === 'solo' ? mode.resume : null;
  const board = (
    <WoodChess key={run} paused={paused} online={online} resume={resume} theme={theme}
      appearance={prefs.appearance} onAppearance={setAppearance} prefElo={prefs.elo} onElo={setElo}
      onSave={saveGame} onClear={clearGame} />
  );

  return (
    <>
      {mode.at === 'home' ? (
        <ChessHome
          theme={theme}
          appearance={prefs.appearance}
          onAppearance={setAppearance}
          elo={prefs.elo}
          onElo={setElo}
          saved={saved}
          onSolo={(picked?: SavedGame) => { setMode({ at: 'solo', resume: picked || null }); setRun(value => value + 1); }}
          onOnline={(peer: Peer, picked?: SavedGame) => startAsHost(peer, picked)}
        />
      ) : mode.at === 'joining' ? (
        <div className="wood-chess chess-home">
          <div className="chess-home-layout">
            <div className="chess-home-card">
              <h1>Setting up with {mode.peer.name}</h1>
              <p className="chess-home-sub">The board opens as soon as they say which colours are whose.</p>
            </div>
          </div>
        </div>
      ) : board}
      {paused && mode.at !== 'home' && (
        <div className="chess-host-pause"><button onClick={() => { setPaused(false); send('ready'); }}>Resume game</button></div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
