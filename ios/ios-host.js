/* iOS-only transport around the unchanged desktop Chess package. */
(() => {
  window.CHESS_IOS = true;
  const native = window.webkit?.messageHandlers?.pio;
  const post = message => native?.postMessage(message);
  const NativeWorker = window.Worker;
  // WKWebView custom-scheme workers are not portable. Load both bundled files on
  // the page, then give Stockfish blob URLs (its documented wasm URL hash).
  window.Worker = class extends EventTarget {
    constructor(url, options) {
      super();
      this.queue = []; this.closed = false; this.urls = [];
      this.load(url, options).catch(error => {
        if (!this.closed) this.dispatchEvent(new ErrorEvent('error', {message: error.message}));
      });
    }
    async load(url, options) {
      const script = new URL(url, location.href);
      const wasm = new URL(script.href.replace(/\.js$/, '.wasm'));
      const responses = await Promise.all([fetch(script), fetch(wasm)]);
      if (responses.some(r => !r.ok)) throw new Error('The bundled chess engine could not be loaded.');
      const [js, bytes] = await Promise.all([responses[0].text(), responses[1].arrayBuffer()]);
      if (this.closed) return;
      const scriptURL = URL.createObjectURL(new Blob([js], {type:'text/javascript'}));
      const wasmURL = URL.createObjectURL(new Blob([bytes], {type:'application/wasm'}));
      this.urls = [scriptURL, wasmURL];
      this.worker = new NativeWorker(scriptURL + '#' + encodeURIComponent(wasmURL), options);
      this.worker.addEventListener('message', e => this.dispatchEvent(new MessageEvent('message', {data:e.data})));
      this.worker.addEventListener('error', e => this.dispatchEvent(new ErrorEvent('error', {message:e.message})));
      this.queue.forEach(value => this.worker.postMessage(value)); this.queue = [];
    }
    postMessage(value) { if (!this.closed) this.worker ? this.worker.postMessage(value) : this.queue.push(value); }
    terminate() { this.closed = true; this.worker?.terminate(); this.urls.forEach(URL.revokeObjectURL); this.queue = []; }
  };
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data) return;
    const data = e.data;
    if (data.type === 'edgechat-game-p2p' && data.cmd) {
      window.postMessage({type:data.type, id:data.id, reply:{available:false, peers:[]}}, '*');
    }
    if (data.type !== 'game' || !data.event) return;
    if (data.event === 'ready') {
      post({type:'ready'});
      window.postMessage({type:'game',cmd:'checkpoint',value:window.CHESS_IOS_CHECKPOINT || null}, '*');
    } else if (data.event === 'checkpoint') {
      window.CHESS_IOS_CHECKPOINT = data.value;
      post({type:'checkpoint',checkpoint:data.value});
    } else if (data.event === 'exit') post({type:'exit'});
  });
  const observer = new MutationObserver(() => {
    const subtitle = document.querySelector('.chess-home-sub');
    if (subtitle?.textContent === 'Play a friend on their own device, or take on the engine.')
      subtitle.textContent = 'A quiet game against Stockfish. Play at your own pace.';
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('visibilitychange' , () => window.postMessage({type:'game',cmd:document.hidden?'pause':'resume'}, '*'));
})();
