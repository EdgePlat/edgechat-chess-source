/* The game's half of the peer-to-peer bridge.
 *
 * The game is sealed: it has no network and never sees ctx.p2p. The host app holds the real
 * connection and relays it over postMessage, validating every field in both directions. This file is
 * the other end of that: it speaks the same small vocabulary and knows nothing about who the other
 * person is beyond a name.
 */
const TYPE = 'edgechat-game-p2p';
const GAME_ID = 'chess';

export type Peer = { id: string; name: string; online: boolean };
export type P2PEvent =
  | { kind: 'session'; peer: { id: string; name: string } }
  | { kind: 'message'; body: unknown }
  | { kind: 'closed'; detail: string }
  /** An invitation sent from the Friends chat was accepted: this side is the host, as if invite() had said ok. */
  | { kind: 'host-session'; peer: { id: string; name: string } };

type Pending = { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> };

let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Set<(event: P2PEvent) => void>();
let wired = false;

/** A reply that never comes must not hang a button for ever: every call has a ceiling. */
const CALL_TIMEOUT_MS = 20_000;
const INVITE_TIMEOUT_MS = 150_000;        // the portal withdraws an unanswered invitation after two minutes

function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data: any = event.data;
    if (!data || data.type !== TYPE) return;
    if (typeof data.id === 'number') {
      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);
      clearTimeout(waiting.timer);
      waiting.resolve(data.reply || {});
      return;
    }
    const kind = data.p2pEvent;
    if (kind !== 'session' && kind !== 'message' && kind !== 'closed' && kind !== 'host-session') return;
    // Held for whichever game opened next, so it is not ours unless it names Chess.
    if (kind === 'host-session' && (data.game !== GAME_ID || !data.peer || typeof data.peer.id !== 'string' || !data.peer.id)) return;
    const out: P2PEvent = kind === 'session' ? { kind, peer: data.peer }
      : kind === 'message' ? { kind, body: data.body }
      : kind === 'host-session' ? { kind, peer: { id: data.peer.id, name: String(data.peer.name || '') } }
      : { kind, detail: String(data.detail || '') };
    for (const listener of listeners) { try { listener(out); } catch (error) { console.warn('[chess] p2p listener:', error); } }
  });
}

function call(cmd: string, payload: Record<string, unknown> = {}, timeout = CALL_TIMEOUT_MS): Promise<any> {
  wire();
  const id = nextId++;
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: 'connection' }); }, timeout);
    pending.set(id, { resolve, timer });
    window.parent.postMessage({ type: TYPE, id, cmd, payload }, '*');
  });
}

export const p2p = {
  /** False means: do not offer an online option at all. */
  available: async (): Promise<boolean> => !!(await call('p2p.available')).available,
  peers: async (): Promise<Peer[]> => ((await call('p2p.peers')).peers || []) as Peer[],
  /** Resolves when the other person answers, or with an error the caller can put on screen. */
  invite: (contactId: string) => call('p2p.invite', { id: contactId, game: GAME_ID }, INVITE_TIMEOUT_MS),
  /** Withdraws the invitation still waiting for an answer (the waiting screen's Cancel). */
  cancel: () => call('p2p.cancel'),
  send: (body: unknown) => call('p2p.send', { body }),
  leave: () => call('p2p.leave'),
  openSettings: () => call('p2p.settings'),
  /** Asks the SHELL to show its pairing dialog over the game. Resolves {ok, name} — never an address or a key. */
  pair: () => call('p2p.pair', {}, 180_000),
  on(listener: (event: P2PEvent) => void) { wire(); listeners.add(listener); return () => { listeners.delete(listener); }; },
};

/** Every reason an invitation can fail, in words the person can act on. 'cancelled' is not one: the person
 *  cancelled it (here, or in the Friends chat), and the home screen goes back to the list without a line. */
export const inviteProblem = (error: string, name: string): string => ({
  offline: `${name} is not online right now.`,
  declined: `${name} said no this time.`,
  busy: `${name} is busy right now. Try again in a moment.`,
  'not-installed': `${name} does not have Mini Games on their device yet.`,
  'no-answer': `${name} did not answer.`,
  'no-path': `EdgeChat could not connect directly to ${name}'s device. One of your networks blocks direct connections.`,
  connection: 'The connection could not be opened.',
  'ultra-private': 'Playing together is off while Ultra-Private Mode is on.',
  off: 'Playing together is switched off in Settings.',
  pending: 'An earlier invitation is still waiting for an answer.',
}[error] || 'The invitation did not go through.');
