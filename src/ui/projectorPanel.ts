import { el } from './dom';

const FALLBACK_TEXT =
  'Drag this browser window onto the projector screen, then press F11 for fullscreen.';

/**
 * "Go fullscreen on projector". Uses the Window Management API (Chrome/Edge)
 * to list displays so the player can pick the projector; otherwise explains
 * the drag + F11 fallback.
 */
export class ProjectorPanel {
  private readonly body = el('div', { class: 'projector-body' });
  private details: ScreenDetails | null = null;

  constructor(root: HTMLElement) {
    const button = el('button', { class: 'primary' }, 'Go fullscreen on projector');
    button.addEventListener('click', () => void this.start());
    root.append(el('h2', {}, 'Projector'), button, this.body);
    document.addEventListener('fullscreenchange', () => this.renderFullscreenState());
  }

  private async start(): Promise<void> {
    if (!window.getScreenDetails) {
      this.showFallback(
        'This browser cannot choose a display (use Chrome or Edge for the picker).',
      );
      return;
    }
    try {
      this.details ??= await window.getScreenDetails();
      this.details.addEventListener('screenschange', () => this.renderPicker());
      this.renderPicker();
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      this.showFallback(
        denied
          ? 'Permission to see your displays was denied. You can allow "Window management" in the site settings (padlock icon) and try again.'
          : `Could not list displays (${String(err)}).`,
      );
    }
  }

  private renderPicker(): void {
    const details = this.details;
    if (!details) return;
    const screens = details.screens;
    this.body.replaceChildren(el('p', {}, 'Choose the projector display:'));
    if (screens.length < 2) {
      this.body.append(
        el(
          'p',
          { class: 'warn' },
          'Only one display found. Connect the projector and set Windows to "Extend" (Win + P), then click the button again.',
        ),
      );
    }
    const list = el('div', { class: 'screen-list' });
    screens.forEach((screen, i) => {
      const tags = [
        screen.isPrimary ? 'primary' : '',
        screen.isInternal ? 'built-in' : '',
        screen === details.currentScreen ? 'this window' : '',
      ].filter(Boolean);
      const pixels = `${Math.round(screen.width * screen.devicePixelRatio)} × ${Math.round(screen.height * screen.devicePixelRatio)}`;
      const name = screen.label || `Display ${i + 1}`;
      const button = el(
        'button',
        {},
        `${name} — ${pixels}${tags.length ? ` (${tags.join(', ')})` : ''}`,
      );
      // requestFullscreen needs a fresh click, so it is called straight from this handler.
      button.addEventListener('click', () => {
        document.documentElement.requestFullscreen({ screen }).catch((err: unknown) => {
          this.showFallback(`Fullscreen on that display failed (${String(err)}).`);
        });
      });
      list.append(button);
    });
    this.body.append(list);
  }

  private showFallback(reason: string): void {
    const here = el('button', {}, 'Fullscreen on this screen');
    here.addEventListener(
      'click',
      () => void document.documentElement.requestFullscreen().catch(() => {}),
    );
    this.body.replaceChildren(el('p', { class: 'warn' }, reason), el('p', {}, FALLBACK_TEXT), here);
  }

  private renderFullscreenState(): void {
    if (document.fullscreenElement) {
      this.body.replaceChildren(
        el('p', {}, 'Fullscreen. Press H to hide panels, Esc to leave fullscreen.'),
      );
    } else {
      this.body.replaceChildren();
    }
  }
}
