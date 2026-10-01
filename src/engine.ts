/* Adapted from Chesskit src/lib/engine/uciEngine.ts and worker.ts (AGPL-3.0).
 * Retains upstream's UCI initialization, MultiPV=3, Elo limiting and depth-16
 * getEngineNextMove sequence. Transport adds timeout/error/cancellation handling.
 * Upstream revision and licenses: licenses/ATTRIBUTION.md.
 */
export class ChesskitEngine {
  private worker: Worker;
  private ready = false;
  private elo: number | undefined;
  private pending?: { reject: (error: Error) => void; cleanup: () => void };

  constructor() {
    this.worker = new Worker('./assets/engine/stockfish-18-lite-single.js');
  }

  private sendCommands(commands: string[], finalMessage: string, timeout = 60000): Promise<string[]> {
    if (this.pending) throw new Error('Chess engine received overlapping commands.');
    return new Promise((resolve, reject) => {
      const messages: string[] = [];
      const cleanup = () => {
        clearTimeout(timer);
        this.worker.removeEventListener('message', onMessage);
        this.worker.removeEventListener('error', onError);
        this.pending = undefined;
      };
      const onMessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        for (const line of event.data.split('\n')) {
          messages.push(line);
          if (line.startsWith(finalMessage)) { cleanup(); resolve(messages); return; }
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        const error = new Error(event.message || 'Stockfish could not start.');
        console.error('Chesskit engine worker failed.', error);
        reject(error);
      };
      const timer = setTimeout(() => {
        cleanup();
        const error = new Error('Stockfish took too long to respond. Please retry.');
        console.error('Chesskit engine command timed out.', commands);
        reject(error);
      }, timeout);
      this.pending = { reject, cleanup };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', onError);
      commands.forEach(command => this.worker.postMessage(command));
    });
  }

  async initialize() {
    await this.sendCommands(['uci'], 'uciok');
    await this.sendCommands(['setoption name MultiPV value 3', 'isready'], 'readyok');
    await this.sendCommands(['ucinewgame', 'isready'], 'readyok');
    this.ready = true;
  }

  private async setElo(elo: number) {
    if (elo === this.elo) return;
    if (elo < 1320 || elo > 3190) throw new Error(`Invalid Elo value : ${elo}`);
    await this.sendCommands(['setoption name UCI_LimitStrength value true', 'isready'], 'readyok');
    await this.sendCommands([`setoption name UCI_Elo value ${elo}`, 'isready'], 'readyok');
    this.elo = elo;
  }

  async getEngineNextMove(fen: string, elo: number, depth = 16): Promise<string | undefined> {
    if (!this.ready) throw new Error('Stockfish is not ready');
    await this.sendCommands(['stop', 'isready'], 'readyok');
    await this.setElo(elo);
    const results = await this.sendCommands([`position fen ${fen}`, `go depth ${depth}`], 'bestmove');
    const move = results.find(result => result.startsWith('bestmove'))?.split(/\s+/)[1];
    if (!move) throw new Error('No move found');
    return move === '(none)' ? undefined : move;
  }

  shutdown() {
    this.ready = false;
    const pending = this.pending;
    pending?.cleanup();
    pending?.reject(new DOMException('Chess engine session closed.', 'AbortError'));
    this.worker.terminate();
  }
}
