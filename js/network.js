// Thin wrapper around PeerJS giving us a simple room-code based
// peer-to-peer connection with a small pub/sub event interface.
class GameNetwork {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.listeners = {};
  }

  on(event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  }

  // Host a room using a short, human-typeable code as the PeerJS id.
  host(roomCode) {
    this.isHost = true;
    const id = `atla-guesswho-${roomCode}`;
    this.peer = new Peer(id, { debug: 1 });

    this.peer.on('open', () => this.emit('hosting', roomCode));

    this.peer.on('connection', (conn) => {
      if (this.conn) {
        // Already have an opponent; politely reject extra joiners.
        conn.on('open', () => conn.close());
        return;
      }
      this._bindConnection(conn);
    });

    this.peer.on('error', (err) => this.emit('error', err));
  }

  join(roomCode) {
    this.isHost = false;
    const id = `atla-guesswho-${roomCode}`;
    this.peer = new Peer({ debug: 1 });

    this.peer.on('open', () => {
      const conn = this.peer.connect(id, { reliable: true });
      this._bindConnection(conn);
    });

    this.peer.on('error', (err) => this.emit('error', err));
  }

  _bindConnection(conn) {
    this.conn = conn;
    conn.on('open', () => this.emit('connected'));
    conn.on('data', (data) => this.emit('data', data));
    conn.on('close', () => this.emit('disconnected'));
    conn.on('error', (err) => this.emit('error', err));
  }

  send(message) {
    if (this.conn && this.conn.open) {
      this.conn.send(message);
    }
  }

  destroy() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
  }
}
