import { describe, expect, it } from 'vitest';
import { Editor } from '../src/editor/editor';

const VP = { width: 1000, height: 1000 };

/** Editor with one surface covering (200,200)-(800,800). */
function setup(): Editor {
  const ed = new Editor(VP);
  ed.addSurface();
  return ed;
}

const click = (ed: Editor, x: number, y: number, button = 0, double = false) => {
  ed.pointerDown({ x, y }, button, double);
  ed.pointerUp();
};

describe('Editor', () => {
  it('draws a path from a spawn to a goal and links both ends', () => {
    const ed = setup();
    ed.setTool('spawn');
    click(ed, 250, 250);
    ed.setTool('goal');
    click(ed, 750, 750);
    ed.setTool('path');
    click(ed, 252, 248); // on the spawn
    click(ed, 500, 300);
    click(ed, 748, 752); // on the goal: finishes the path
    expect(ed.draft).toBeNull();
    const [path] = ed.room.paths;
    expect(path.spawnId).toBe(ed.room.spawns[0].id);
    expect(path.goalId).toBe(ed.room.goals[0].id);
    expect(path.waypoints).toHaveLength(1);
    expect(path.waypoints[0].x).toBeCloseTo(0.5);
    expect(path.waypoints[0].y).toBeCloseTo(1 / 6);
  });

  it('closes a zone with Enter and refuses one with too few points', () => {
    const ed = setup();
    ed.setTool('buildZone');
    click(ed, 300, 300);
    click(ed, 400, 300);
    ed.finishDraft();
    expect(ed.room.buildZones).toHaveLength(0);
    expect(ed.message).toMatch(/three points/);
    click(ed, 400, 400);
    ed.finishDraft();
    expect(ed.room.buildZones).toHaveLength(1);
    expect(ed.room.buildZones[0].points).toHaveLength(3);
  });

  it('keeps features glued to their surface when a corner moves', () => {
    const ed = setup();
    ed.setTool('spawn');
    click(ed, 500, 500); // surface centre
    const uvBefore = { ...ed.room.spawns[0].at };
    ed.setTool('corners');
    ed.pointerDown({ x: 800, y: 800 }, 0, false); // bottom-right corner
    ed.pointerMove({ x: 900, y: 950 });
    ed.pointerUp();
    expect(ed.room.surfaces[0].corners[2]).toEqual({ x: 0.9, y: 0.95 });
    expect(ed.room.spawns[0].at).toEqual(uvBefore);
    const p = ed.uvToPx(ed.room.spawns[0].surfaceId, ed.room.spawns[0].at)!;
    // Under perspective the surface centre is where the diagonals cross:
    // TL(200,200)-BR(900,950) meets TR(800,200)-BL(200,800) at x + y = 1000.
    const t = 600 / 1450;
    expect(p.x).toBeCloseTo(200 + 700 * t, 6);
    expect(p.y).toBeCloseTo(200 + 750 * t, 6);
  });

  it('undoes and redoes a whole drag as one step', () => {
    const ed = setup();
    ed.setTool('corners');
    ed.pointerDown({ x: 200, y: 200 }, 0, false);
    ed.pointerMove({ x: 210, y: 210 });
    ed.pointerMove({ x: 220, y: 230 });
    ed.pointerUp();
    expect(ed.room.surfaces[0].corners[0]).toEqual({ x: 0.22, y: 0.23 });
    ed.undo();
    expect(ed.room.surfaces[0].corners[0]).toEqual({ x: 0.2, y: 0.2 });
    ed.redo();
    expect(ed.room.surfaces[0].corners[0]).toEqual({ x: 0.22, y: 0.23 });
  });

  it('nudges the selected corner by pixels', () => {
    const ed = setup();
    ed.setTool('corners');
    click(ed, 800, 200);
    ed.nudge(10, -1);
    expect(ed.room.surfaces[0].corners[1].x).toBeCloseTo(0.81);
    expect(ed.room.surfaces[0].corners[1].y).toBeCloseTo(0.199);
  });

  it('selects and deletes, and refuses to draw with no surface', () => {
    const ed = setup();
    ed.setTool('goal');
    click(ed, 400, 400);
    ed.setTool('select');
    click(ed, 401, 401);
    expect(ed.selection?.kind).toBe('goal');
    ed.deleteSelection();
    expect(ed.room.goals).toHaveLength(0);

    const empty = new Editor(VP);
    empty.setTool('spawn');
    click(empty, 500, 500);
    expect(empty.room.spawns).toHaveLength(0);
    expect(empty.message).toMatch(/Add a surface/);
  });

  it('inserts a waypoint by double-clicking a selected path', () => {
    const ed = setup();
    ed.setTool('spawn');
    click(ed, 300, 500);
    ed.setTool('goal');
    click(ed, 700, 500);
    ed.setTool('path');
    click(ed, 300, 500);
    click(ed, 700, 500);
    expect(ed.room.paths[0].waypoints).toHaveLength(0);
    ed.setTool('select');
    click(ed, 500, 500);
    expect(ed.selection?.kind).toBe('path');
    click(ed, 500, 502, 0, true);
    expect(ed.room.paths[0].waypoints).toHaveLength(1);
  });
});
