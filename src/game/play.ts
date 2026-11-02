import type { Gamepads } from '../input/gamepads';
import type { KeyboardMouse } from '../input/keyboardMouse';
import { checkRoom } from '../room/room';
import type { Room, Vec2 } from '../room/types';
import { el } from '../ui/dom';
import { TOWER_ORDER } from './defs';
import { GameView } from './gameView';
import { Players, type Player } from './players';
import { Game, type PlaceResult } from './sim';
import { World } from './world';

const REASONS: Record<Exclude<PlaceResult, 'ok'>, string> = {
  'outside-build-zone': 'Build zones only',
  blocked: 'Blocked area',
  'on-path': 'Too close to the path',
  'too-close': 'Too close to a tower',
  'no-credits': 'Not enough credits',
  'not-now': '',
};

/** Play mode: owns the running game, the players and the on-screen HUD. */
export class Play {
  readonly view = new GameView();
  readonly players = new Players();
  game: Game | null = null;
  private problem = '';
  private banner = '';
  private bannerUntil = 0;

  private readonly stats = el('div', { class: 'play-stats' });
  private readonly centre = el('div', { class: 'play-banner' });
  private readonly help = el('div', { class: 'play-help' });

  constructor(
    hud: HTMLElement,
    private readonly gamepads: Gamepads,
    private readonly km: KeyboardMouse,
  ) {
    hud.append(this.stats, this.centre, this.help);
  }

  private roomJson = '';

  /**
   * Entering play mode: resume the current game (paused) if the room is unchanged,
   * otherwise start a fresh one.
   */
  enter(room: Room): void {
    const json = JSON.stringify(room);
    if (this.game && json === this.roomJson) {
      if (this.game.phase === 'wave' && !this.game.paused) this.game.togglePause();
      return;
    }
    this.start(room);
  }

  /** Start a fresh game in `room` (a copy is taken). */
  start(room: Room): void {
    this.roomJson = JSON.stringify(room);
    const copy = JSON.parse(this.roomJson) as Room;
    const errors = checkRoom(copy).filter((p) => p.level === 'error');
    if (errors.length) {
      this.game = null;
      this.problem = `This room isn't ready to play: ${errors[0].message} Fix it in the Room editor (F2).`;
    } else {
      this.game = new Game(new World(copy));
      this.problem = '';
      // Start every cursor in the middle of the first build zone.
      const zone = this.game.world.buildZones[0];
      if (zone?.length) {
        const c = {
          x: zone.reduce((s, p) => s + p.x, 0) / zone.length,
          y: zone.reduce((s, p) => s + p.y, 0) / zone.length,
        };
        for (const p of this.players.all) p.cursor = { ...c };
      }
    }
    this.renderHud();
  }

  private toWorld = (px: Vec2): Vec2 => {
    const aspect = this.game?.world.aspect ?? 16 / 9;
    return { x: (px.x / window.innerWidth) * aspect, y: px.y / window.innerHeight };
  };

  /** One fixed simulation step (1/60 s). */
  step(dt: number): void {
    const game = this.game;
    const actions = this.players.update(
      dt,
      this.gamepads,
      this.km,
      this.toWorld,
      game?.world.aspect ?? 16 / 9,
    );
    if (!game) return;
    for (const { player, action } of actions) this.act(game, player, action);
    game.step(dt);
    for (const e of game.events) this.onEvent(e);
    game.events = [];
  }

  private act(game: Game, p: Player, action: string): void {
    switch (action) {
      case 'menu':
        if (game.phase === 'won' || game.phase === 'lost') {
          this.game = new Game(game.world);
          this.flash('New game');
        } else if (game.phase === 'build' && !game.paused) game.startWave();
        else game.togglePause();
        break;
      case 'next':
      case 'prev': {
        const i = TOWER_ORDER.indexOf(p.tower);
        const n = TOWER_ORDER.length;
        p.tower = TOWER_ORDER[(i + (action === 'next' ? 1 : n - 1)) % n];
        break;
      }
      case 'place': {
        const r = game.place(p.tower, p.cursor, p.id);
        if (r !== 'ok' && REASONS[r]) this.note(p, REASONS[r]);
        break;
      }
      case 'sell': {
        const refund = game.sell(p.cursor);
        if (refund) this.note(p, `Sold +${refund}`);
        break;
      }
    }
  }

  private note(p: Player, text: string): void {
    p.note = text;
    p.noteUntil = performance.now() + 1500;
  }

  private flash(text: string, ms = 2500): void {
    this.banner = text;
    this.bannerUntil = performance.now() + ms;
  }

  private onEvent(e: string): void {
    const [kind, a, b] = e.split(':');
    if (kind === 'wave-start') this.flash(`Wave ${a}`, 1800);
    if (kind === 'wave-clear' && this.game?.phase !== 'won')
      this.flash(`Wave ${a} cleared! +${b} credits`);
  }

  canPlace = (p: Player): boolean => !!this.game && this.game.canPlace(p.tower, p.cursor) === 'ok';

  render(width: number, height: number, scale: number): void {
    this.view.scale1 = scale;
    if (this.game) this.view.draw(this.game, this.players.all, width, height, this.canPlace);
    this.renderHud();
  }

  private renderHud(): void {
    const g = this.game;
    if (!g) {
      this.stats.textContent = '';
      this.centre.textContent = this.problem;
      this.centre.hidden = !this.problem;
      this.help.textContent = '';
      return;
    }
    this.stats.textContent = `Wave ${g.wave}/${g.waveCount}   ♥ ${g.lives}   ◆ ${g.credits}`;
    let centre = '';
    if (g.phase === 'won')
      centre = `You win! All ${g.waveCount} waves held. Press Menu (or Space) to play again.`;
    else if (g.phase === 'lost')
      centre = `Game over on wave ${g.wave}. Press Menu (or Space) to try again.`;
    else if (g.paused) centre = 'Paused. Press Menu (or Space) to continue.';
    else if (performance.now() < this.bannerUntil) centre = this.banner;
    else if (g.phase === 'build') {
      centre =
        g.wave === 0
          ? 'Build towers in the cyan zones, then press Menu (or Space) to start wave 1.'
          : `Press Menu (or Space) to start wave ${g.wave + 1}.`;
    }
    if (this.centre.textContent !== centre) this.centre.textContent = centre;
    this.centre.hidden = !centre;

    const pads = this.players.pads.filter((p) => p.active).length;
    const help =
      (pads
        ? 'Controller: stick move · A build · B sell · X / LB / RB tower · Menu wave / pause'
        : 'No controller yet: plug one in and press any button on it.') +
      '\nMouse: click build · right-click sell · 1-3 or Q / E tower · Space wave / pause · F2 leave';
    if (this.help.textContent !== help) this.help.textContent = help;
    // Only between waves: during a wave it would cover the room.
    this.help.hidden = g.phase === 'wave' && !g.paused;
  }
}
