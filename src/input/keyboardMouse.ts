/** Tracks held keys and the mouse. Read the public fields each frame. */
export class KeyboardMouse {
  readonly heldKeys = new Set<string>();
  lastKey = '';
  mouseX = 0;
  mouseY = 0;
  mouseInside = false;
  /** Bitmask as in PointerEvent.buttons: 1 left, 2 right, 4 middle, 8 back, 16 forward. */
  mouseButtons = 0;
  wheel = 0;

  private readonly pressHandlers = new Map<string, () => void>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      this.heldKeys.add(e.code);
      this.lastKey = e.code;
      // While typing in a text field only function keys act as shortcuts.
      const typing = isTextField(e.target) && !/^F\d+$/.test(e.code);
      const handler = typing ? undefined : this.pressHandlers.get(e.code);
      if (handler) {
        e.preventDefault();
        if (!e.repeat) handler();
      }
    });
    target.addEventListener('keyup', (e) => this.heldKeys.delete(e.code));
    // Releasing keys while the window is unfocused never fires keyup.
    target.addEventListener('blur', () => {
      this.heldKeys.clear();
      this.mouseButtons = 0;
    });

    const onPointer = (e: PointerEvent): void => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseButtons = e.buttons;
      this.mouseInside = true;
    };
    target.addEventListener('pointermove', onPointer);
    target.addEventListener('pointerdown', onPointer);
    target.addEventListener('pointerup', onPointer);
    document.documentElement.addEventListener('pointerleave', () => (this.mouseInside = false));
    target.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    // Let right-click reach the checker instead of opening a menu.
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Run `handler` once per press of `code` (KeyboardEvent.code), and stop the browser default. */
  onPress(code: string, handler: () => void): void {
    this.pressHandlers.set(code, handler);
  }
}

function isTextField(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
