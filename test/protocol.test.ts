import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/remote/protocol';

describe('parseCommand', () => {
  it('accepts well-formed commands', () => {
    expect(parseCommand({ kind: 'undo' })).toEqual({ kind: 'undo' });
    expect(parseCommand({ kind: 'tool', tool: 'path' })).toEqual({ kind: 'tool', tool: 'path' });
    expect(
      parseCommand({
        kind: 'pointer',
        phase: 'down',
        at: { x: 0.5, y: 0.25 },
        button: 0,
        double: false,
        hit: 0.05,
      }),
    ).toEqual({
      kind: 'pointer',
      phase: 'down',
      at: { x: 0.5, y: 0.25 },
      button: 0,
      double: false,
      hit: 0.05,
    });
    expect(parseCommand({ kind: 'nudge', dx: -10, dy: 1 })).toEqual({
      kind: 'nudge',
      dx: -10,
      dy: 1,
    });
  });

  it('rejects anything malformed or unknown', () => {
    for (const bad of [
      null,
      'undo',
      { kind: 'format-disk' },
      { kind: 'tool', tool: 'eraser' },
      { kind: 'pointer', phase: 'down', at: { x: NaN, y: 0 }, button: 0, double: false, hit: 0.1 },
      { kind: 'pointer', phase: 'down', at: { x: 0, y: 0 }, button: 1, double: false, hit: 0.1 },
      { kind: 'pointer', phase: 'tap', at: { x: 0, y: 0 }, button: 0, double: false, hit: 0.1 },
      { kind: 'nudge', dx: 1e6, dy: 0 },
      { kind: 'open', file: '' },
      { kind: 'rename', name: 'x'.repeat(61) },
    ]) {
      expect(parseCommand(bad)).toBeNull();
    }
  });
});
