import { isLandscape, isMobileDevice } from '../core/Mobile';

/**
 * The "turn your phone" screen.
 *
 * The game is played in landscape. Chrome on Android can be locked to
 * landscape, but iOS cannot - there the player has to turn the phone by
 * hand. This overlay covers the game until the phone lies sideways.
 */
export class RotateOverlay {
  readonly root: HTMLDivElement;

  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen rotate-overlay hidden';

    const card = document.createElement('div');
    card.className = 'menu-card panel';

    const phone = document.createElement('div');
    phone.className = 'rotate-phone';

    const title = document.createElement('div');
    title.className = 'rotate-title';
    title.textContent = 'Turn your phone';

    const text = document.createElement('div');
    text.className = 'rotate-text';
    text.textContent = 'Open Road is played in landscape.';

    card.append(phone, title, text);
    this.root.appendChild(card);

    parent.appendChild(this.root);
  }

  /** Show the overlay when the phone is held upright, hide it otherwise. */
  update(): void {
    const shouldShow = isMobileDevice() && !isLandscape();
    if (shouldShow === this.visible) return;
    this.visible = shouldShow;
    this.root.classList.toggle('hidden', !shouldShow);
  }

  /** True while the overlay covers the game. */
  get isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.root.remove();
  }
}
