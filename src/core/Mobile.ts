/**
 * Phone and tablet helpers: what kind of device is this, can it go full
 * screen and can it be locked to landscape.
 *
 * The browsers differ a lot here:
 *
 * - Chrome on Android can go full screen and can lock the orientation, but
 *   the lock only works while the page is full screen.
 * - Safari on iOS has no full screen for a normal web page and no
 *   orientation lock at all, so the game has to ask the player to turn the
 *   phone instead.
 * - A desktop browser can go full screen, but it should never be forced
 *   into landscape.
 */

/** A screen that can lock its orientation (not available on iOS). */
interface LockableScreen extends Screen {
  lock?: (orientation: string) => Promise<void>;
}

/** An element that can go full screen, with the old WebKit name as backup. */
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** True when the page is running on a phone or a tablet. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/android|iphone|ipod|windows phone|blackberry|iemobile|opera mini|mobile safari/i.test(ua)) {
    return true;
  }
  // iPadOS pretends to be a Mac - the touch points give it away.
  if (/ipad/i.test(ua)) return true;
  if (/macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

/** True when the device has a touch screen (phones, tablets, touch laptops). */
export function isTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if ((navigator.maxTouchPoints ?? 0) > 0) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** True when the screen is wider than it is high. */
export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

/** True while the page is shown full screen. */
export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.fullscreenElement ?? (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
}

/**
 * Put the page into full screen. Returns false when the browser refuses
 * (iOS Safari does).
 */
export async function requestFullscreen(element: HTMLElement): Promise<boolean> {
  const target = element as FullscreenElement;
  try {
    if (typeof target.requestFullscreen === 'function') {
      await target.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (typeof target.webkitRequestFullscreen === 'function') {
      await target.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Some browsers only accept the call without the options.
    try {
      if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen();
        return true;
      }
    } catch {
      // Fall through - the caller shows a hint instead.
    }
  }
  return false;
}

/** Leave the full screen mode. */
export async function exitFullscreen(): Promise<boolean> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return true;
    }
    const legacy = document as { webkitExitFullscreen?: () => Promise<void> | void };
    if (legacy.webkitExitFullscreen) {
      await legacy.webkitExitFullscreen();
      return true;
    }
  } catch {
    // Ignore - the player can leave the full screen with the browser.
  }
  return false;
}

/** Toggle the full screen mode. */
export async function toggleFullscreen(element: HTMLElement): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return requestFullscreen(element);
}

/**
 * Lock the screen to landscape. Only works on Android (and only in the full
 * screen mode) - everywhere else the player has to turn the phone.
 */
export async function lockLandscape(): Promise<boolean> {
  const orientation = typeof screen === 'undefined' ? undefined : (screen as LockableScreen);
  if (!orientation || typeof orientation.lock !== 'function') return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/** Call the callback whenever the device is turned. */
export function onOrientationChange(callback: () => void): () => void {
  const handler = (): void => callback();
  window.addEventListener('orientationchange', handler);
  window.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('orientationchange', handler);
    window.removeEventListener('resize', handler);
  };
}
