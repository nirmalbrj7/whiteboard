import { CaptureUpdateAction, reconcileElements, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, Collaborator, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { Peer, DataConnection, MediaConnection } from 'peerjs';
import { changedElements, fingerprint, validScene } from './live-protocol';
import type { ScenePacket } from './live-protocol';

export type RoomState = {
  phase: 'offline' | 'connecting' | 'hosting' | 'joined' | 'error';
  isHost: boolean;
  link: string;
  participants: { id: string; name: string }[];
  error: string;
  canDraw: boolean;
  stream: MediaStream | null;
};
export const offlineRoom: RoomState = { phase: 'offline', isHost: false, link: '', participants: [], error: '', canDraw: true, stream: null };
type Message = { type: string; [key: string]: unknown };
type Options = { getApi: () => ExcalidrawImperativeAPI | null; getTitle: () => string; onState: (state: RoomState) => void; onTitle: (title: string) => void };

export class LiveRoom {
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private calls = new Map<string, MediaConnection>();
  private members = new Map<string, string>();
  private collaborators = new Map<string, Collaborator>();
  private known = new Map<string, string>();
  private knownFiles = new Set<string>();
  private token = '';
  private hostId = '';
  private name = '';
  private stopped = false;
  private receiving = false;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private connectTimeout: ReturnType<typeof setTimeout> | undefined;
  private lastPointer = 0;
  private pending: ScenePacket | null = null;
  private state: RoomState = { ...offlineRoom };

  constructor(private options: Options) {}
  private update(patch: Partial<RoomState>) { this.state = { ...this.state, ...patch }; this.options.onState(this.state); }
  private send(connection: DataConnection, message: Message) {
    if (!connection.open) return;
    try { connection.send({ ...message, protocol: 'classboard-v1' }); }
    catch { this.update({ error: 'A classmate connection was interrupted. Ask them to rejoin.' }); }
  }
  private broadcast(message: Message, except?: string) {
    this.connections.forEach((connection, id) => { if (id !== except && (!this.state.isHost || this.members.has(id))) this.send(connection, message); });
  }
  private fail(message: string) {
    this.destroy();
    this.update({ ...offlineRoom, phase: 'error', error: message });
  }

  async start(name: string, invite?: { host: string; token: string }) {
    this.name = name.trim().slice(0, 40) || (invite ? 'Student' : 'Teacher');
    this.hostId = invite?.host ?? `classboard-${crypto.randomUUID()}`;
    this.token = invite?.token ?? crypto.randomUUID();
    this.update({ ...offlineRoom, phase: 'connecting', isHost: !invite });
    this.connectTimeout = setTimeout(() => this.fail('Could not connect. The host may be offline, or this network may block live rooms. Your local lessons are safe.'), 25_000);
    try {
      const { Peer: PeerClient } = await import('peerjs');
      if (this.stopped) return;
      const peer = new PeerClient(invite ? `classboard-${crypto.randomUUID()}` : this.hostId, { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
      this.peer = peer;
      peer.on('open', id => {
        if (this.stopped) return;
        this.members.set(id, this.name);
        if (invite) {
          const connection = peer.connect(invite.host, { reliable: true, serialization: 'binary' });
          this.bind(connection);
          connection.on('open', () => this.send(connection, { type: 'hello', token: this.token, name: this.name }));
        } else {
          clearTimeout(this.connectTimeout);
          const api = this.options.getApi();
          if (api) this.remember({ elements: api.getSceneElementsIncludingDeleted(), files: api.getFiles() });
          this.ready = true;
          const url = new URL(location.href); url.hash = new URLSearchParams({ room: this.hostId, key: this.token }).toString();
          this.update({ phase: 'hosting', link: url.href }); this.roster();
        }
      });
      peer.on('connection', connection => {
        if (!this.state.isHost || this.connections.size >= 24) { connection.close(); return; }
        this.bind(connection);
      });
      peer.on('call', call => {
        if (this.state.isHost || call.peer !== this.hostId || call.metadata?.key !== this.token || !this.ready) { call.close(); return; }
        call.answer();
        call.on('stream', stream => this.update({ stream }));
        call.on('close', () => this.update({ stream: null }));
        call.on('error', () => this.update({ stream: null, error: 'Screen sharing stopped. The board is still available.' }));
        this.calls.set(call.peer, call);
      });
      peer.on('error', error => {
        if (this.stopped) return;
        if (this.ready && error.type === 'peer-unavailable') { this.update({ error: 'A classmate could not be reached. They can try joining again.' }); return; }
        this.fail(error.type === 'peer-unavailable' ? 'This lesson is not available. Ask your teacher for a current link and keep their tab open.' : 'Live sharing could not connect. Try another network or share your screen in your video call.');
      });
      peer.on('disconnected', () => {
        if (!this.stopped) this.update({ error: 'The connection service disconnected. Existing classmates may stay connected, but new students may need you to restart the room.' });
      });
    } catch { this.fail('This browser could not start live sharing. Your local board is still available.'); }
  }

  private bind(connection: DataConnection) {
    this.connections.set(connection.peer, connection);
    const authTimeout = setTimeout(() => { if (this.state.isHost && !this.members.has(connection.peer)) connection.close(); }, 15_000);
    connection.on('data', raw => {
      if (this.stopped || !raw || typeof raw !== 'object') return;
      const message = raw as Message;
      if (message.protocol !== 'classboard-v1') return;
      if (message.type === 'hello' && this.state.isHost) {
        if (message.token !== this.token || typeof message.name !== 'string') { connection.close(); return; }
        clearTimeout(authTimeout);
        this.members.set(connection.peer, message.name.slice(0, 40));
        const api = this.options.getApi();
        if (!api) { connection.close(); return; }
        this.send(connection, { type: 'init', scene: { elements: api.getSceneElementsIncludingDeleted(), files: api.getFiles() }, title: this.options.getTitle(), background: api.getAppState().viewBackgroundColor, canDraw: this.state.canDraw });
        this.roster();
        if (this.state.stream) this.shareWith(connection.peer, this.state.stream);
        return;
      }
      if (this.state.isHost && !this.members.has(connection.peer)) return;
      if (message.type === 'init' && !this.state.isHost && validScene(message.scene)) {
        clearTimeout(authTimeout); clearTimeout(this.connectTimeout);
        this.apply(message.scene, true, typeof message.background === 'string' ? message.background : '#fff');
        if (typeof message.title === 'string') this.options.onTitle(message.title.slice(0, 100));
        this.ready = true;
        this.update({ phase: 'joined', canDraw: message.canDraw !== false });
        return;
      }
      if (!this.ready) return;
      if (message.type === 'scene' && validScene(message.scene)) {
        if (this.state.isHost && !this.state.canDraw) return;
        this.apply(message.scene);
        if (this.state.isHost) this.broadcast(message, connection.peer);
      } else if (message.type === 'roster' && !this.state.isHost && Array.isArray(message.members)) {
        const participants = message.members.filter((member): member is { id: string; name: string } => !!member && typeof member.id === 'string' && typeof member.name === 'string').slice(0, 25);
        this.members = new Map(participants.map(member => [member.id, member.name]));
        for (const id of this.collaborators.keys()) if (!this.members.has(id)) this.collaborators.delete(id);
        this.options.getApi()?.updateScene({ collaborators: new Map(this.collaborators) as AppState['collaborators'] });
        this.update({ participants });
      } else if (message.type === 'permissions' && !this.state.isHost) {
        this.pending = null;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.update({ canDraw: message.canDraw !== false });
      } else if (message.type === 'pointer') {
        const id = this.state.isHost ? connection.peer : message.id;
        const pointer = message.pointer as { x: number; y: number; tool: 'pointer' | 'laser' } | undefined;
        if (typeof id !== 'string' || id === this.peer?.id || !this.members.has(id) || !pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return;
        this.collaborators.set(id, { username: this.members.get(id), pointer: { x: pointer.x, y: pointer.y, tool: pointer.tool === 'laser' ? 'laser' : 'pointer' }, button: message.button === 'down' ? 'down' : 'up', color: { background: '#d8eae1', stroke: '#137a63' } });
        this.options.getApi()?.updateScene({ collaborators: new Map(this.collaborators) as AppState['collaborators'] });
        if (this.state.isHost) this.broadcast({ ...message, id }, connection.peer);
      } else if (message.type === 'screen-stop' && !this.state.isHost) {
        this.update({ stream: null });
      } else if (message.type === 'end' && !this.state.isHost) {
        this.fail('The teacher ended this session. A copy of the lesson is saved in this browser.');
      }
    });
    connection.on('close', () => {
      clearTimeout(authTimeout);
      this.connections.delete(connection.peer); this.members.delete(connection.peer); this.collaborators.delete(connection.peer);
      this.options.getApi()?.updateScene({ collaborators: new Map(this.collaborators) as AppState['collaborators'] });
      if (this.stopped) return;
      if (this.state.isHost) this.roster();
      else this.fail('Disconnected from the teacher. Your copy is saved locally. Rejoin using the room link.');
    });
    connection.on('error', () => {
      clearTimeout(authTimeout);
      if (this.stopped) return;
      if (this.state.isHost) { connection.close(); this.update({ error: 'A classmate disconnected. They can rejoin using the same link.' }); }
      else this.fail('The teacher connection failed. Your local copy is saved; try joining again.');
    });
  }

  private remember(scene: ScenePacket) {
    scene.elements.forEach(element => this.known.set(element.id, fingerprint(element)));
    Object.keys(scene.files).forEach(id => this.knownFiles.add(id));
  }
  private apply(scene: ScenePacket, initial = false, background?: string) {
    const api = this.options.getApi();
    if (!api) return;
    this.receiving = true;
    try {
      const incoming = restoreElements(scene.elements, null);
      const merged = initial ? incoming : reconcileElements(api.getSceneElementsIncludingDeleted(), incoming as unknown as Parameters<typeof reconcileElements>[1], api.getAppState());
      // Only received versions are acknowledged; pending local edits must still be sent.
      this.remember({ elements: incoming, files: scene.files });
      if (this.pending) this.pending = { elements: merged, files: { ...this.pending.files, ...scene.files } };
      api.addFiles(Object.values(scene.files));
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER, ...(background ? { appState: { viewBackgroundColor: background } } : {}) });
      if (initial) { api.history.clear(); api.scrollToContent(undefined, { fitToContent: true }); }
    } finally { this.receiving = false; }
  }
  private roster() {
    const participants = [...this.members].map(([id, name]) => ({ id, name }));
    this.update({ participants }); this.broadcast({ type: 'roster', members: participants });
  }

  change(elements: readonly ExcalidrawElement[], files: BinaryFiles) {
    if (!this.ready || this.receiving || this.stopped || (!this.state.isHost && !this.state.canDraw)) return;
    this.pending = { elements, files };
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.pending) return;
      const scene = { elements: changedElements(this.pending.elements, this.known), files: Object.fromEntries(Object.entries(this.pending.files).filter(([id]) => !this.knownFiles.has(id))) };
      this.pending = null;
      if (!scene.elements.length && !Object.keys(scene.files).length) return;
      this.remember(scene); this.broadcast({ type: 'scene', scene });
    }, 55);
  }
  pointer(payload: { pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'up' | 'down' }) {
    if (!this.ready || this.stopped || Date.now() - this.lastPointer < 50) return;
    this.lastPointer = Date.now();
    this.broadcast({ type: 'pointer', id: this.peer?.id, pointer: payload.pointer, button: payload.button });
  }
  setCanDraw(canDraw: boolean) {
    if (!this.state.isHost) return;
    this.update({ canDraw }); this.broadcast({ type: 'permissions', canDraw });
    if (!canDraw) {
      const api = this.options.getApi();
      if (api) this.broadcast({ type: 'init', scene: { elements: api.getSceneElementsIncludingDeleted(), files: api.getFiles() }, title: this.options.getTitle(), background: api.getAppState().viewBackgroundColor, canDraw });
    }
  }

  async shareScreen() {
    if (!this.state.isHost || !this.ready) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      this.update({ stream });
      stream.getVideoTracks()[0].addEventListener('ended', () => this.stopScreen(), { once: true });
      for (const id of this.members.keys()) if (id !== this.peer?.id) this.shareWith(id, stream);
    } catch (error) {
      if ((error as DOMException).name !== 'NotAllowedError') this.update({ error: 'Screen sharing is unavailable. Use the screen-share button in your video call.' });
    }
  }
  private shareWith(id: string, stream: MediaStream) {
    if (!this.peer) return;
    this.calls.get(id)?.close();
    const call = this.peer.call(id, stream, { metadata: { key: this.token } });
    this.calls.set(id, call);
    call.on('error', () => this.update({ error: 'Screen video could not reach a student. Drawing is still shared.' }));
  }
  stopScreen() {
    this.state.stream?.getTracks().forEach(track => track.stop());
    this.calls.forEach(call => call.close()); this.calls.clear();
    this.update({ stream: null }); this.broadcast({ type: 'screen-stop' });
  }
  destroy() {
    if (this.stopped) return;
    this.stopped = true; this.ready = false;
    clearTimeout(this.timer); clearTimeout(this.connectTimeout);
    if (this.state.isHost) this.broadcast({ type: 'end' });
    this.stopScreen();
    this.connections.forEach(connection => connection.close()); this.connections.clear();
    this.peer?.destroy(); this.peer = null;
    this.options.getApi()?.updateScene({ collaborators: new Map() });
    this.update({ ...offlineRoom });
  }
}
