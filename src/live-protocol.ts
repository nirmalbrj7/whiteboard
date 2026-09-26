import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';

export type ScenePacket = { elements: readonly ExcalidrawElement[]; files: BinaryFiles };
export const fingerprint = (element: ExcalidrawElement) => `${element.version}:${element.versionNonce}`;

export function changedElements(elements: readonly ExcalidrawElement[], known: Map<string, string>) {
  return elements.filter(element => known.get(element.id) !== fingerprint(element));
}

export function validScene(value: unknown): value is ScenePacket {
  if (!value || typeof value !== 'object') return false;
  const packet = value as ScenePacket;
  const types = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text', 'image', 'frame', 'magicframe', 'embeddable', 'iframe']);
  return Array.isArray(packet.elements) && packet.elements.length <= 50_000 &&
    packet.elements.every(element => element && typeof element.id === 'string' && element.id.length <= 200 && types.has(element.type) && Number.isFinite(element.version) && Number.isFinite(element.versionNonce) && Number.isFinite(element.x) && Number.isFinite(element.y) && Number.isFinite(element.width) && Number.isFinite(element.height)) &&
    !!packet.files && typeof packet.files === 'object' && !Array.isArray(packet.files) &&
    Object.values(packet.files).every(file => file && typeof file.id === 'string' && typeof file.dataURL === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif);/i.test(file.dataURL) && file.dataURL.length < 30_000_000);
}

export function parseInvite(value: string): { host: string; token: string } | null {
  try {
    const url = new URL(value);
    const params = new URLSearchParams(url.hash.slice(1));
    const host = params.get('room'), token = params.get('key');
    if (host && token && /^classboard-[a-f0-9-]{36}$/.test(host) && /^[a-f0-9-]{36}$/.test(token)) return { host, token };
  } catch { /* An invite must be a full room URL. */ }
  return null;
}
