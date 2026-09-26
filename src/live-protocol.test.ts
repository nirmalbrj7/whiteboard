import { describe, expect, it } from 'vitest';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { changedElements, fingerprint, parseInvite, validScene } from './live-protocol';

const shape = (patch = {}) => ({ id: 'shape-1', type: 'rectangle', x: 0, y: 0, width: 120, height: 80, version: 1, versionNonce: 42, isDeleted: false, ...patch } as ExcalidrawElement);

describe('live-room protocol', () => {
  it('sends additions and updates while suppressing unchanged elements', () => {
    const original = shape();
    const known = new Map([[original.id, fingerprint(original)]]);
    expect(changedElements([original], known)).toHaveLength(0);
    const edited = shape({ version: 2 });
    expect(changedElements([edited, shape({ id: 'new' })], known)).toHaveLength(2);
  });
  it('includes deletion tombstones so remote clients remove erased objects', () => {
    const original = shape();
    const deleted = shape({ isDeleted: true, version: 2 });
    expect(changedElements([deleted], new Map([[original.id, fingerprint(original)]]))).toEqual([deleted]);
  });
  it('detects competing edits with equal versions and different nonces', () => {
    const original = shape();
    expect(changedElements([shape({ versionNonce: 21 })], new Map([[original.id, fingerprint(original)]]))).toHaveLength(1);
  });
  it('accepts well-formed drawings and rejects malformed or non-finite coordinates', () => {
    expect(validScene({ elements: [shape()], files: {} })).toBe(true);
    for (const value of [null, {}, { elements: [shape({ x: Infinity })], files: {} }, { elements: [shape({ type: 'script' })], files: {} }]) expect(validScene(value)).toBe(false);
  });
  it('accepts embedded images but rejects external tracking URLs', () => {
    expect(validScene({ elements: [], files: { image: { id: 'image', dataURL: 'data:image/png;base64,YQ==' } } })).toBe(true);
    expect(validScene({ elements: [], files: { image: { id: 'image', dataURL: 'https://example.com/track' } } })).toBe(false);
  });
  it('requires both a valid host id and room key', () => {
    const host = 'classboard-00000000-0000-0000-0000-000000000000';
    const token = '11111111-1111-1111-1111-111111111111';
    expect(parseInvite(`https://example.com/board/#room=${host}&key=${token}`)).toEqual({ host, token });
    expect(parseInvite(`https://example.com/#room=${host}`)).toBeNull();
    expect(parseInvite('not a link')).toBeNull();
    expect(parseInvite('https://example.com/#room=bad&key=bad')).toBeNull();
  });
});
