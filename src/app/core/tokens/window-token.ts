import { InjectionToken } from '@angular/core';

/**
 * Platform `window` handle. Injected instead of touching the global so the
 * viewport-driven sheet modal can be swapped for a test double under SSR or in
 * component tests without patching globals.
 */
export const WINDOW = new InjectionToken<Window>('WINDOW', {
  providedIn: 'root',
  factory: () => window
});

/**
 * `visualViewport` handle used by the sheet modal to track the on-screen
 * keyboard. Optional because desktop browsers without an attached keyboard
 * do not always expose it in automation contexts.
 */
export const VISUAL_VIEWPORT = new InjectionToken<VisualViewport | null>('VISUAL_VIEWPORT', {
  providedIn: 'root',
  factory: () => (typeof window === 'undefined' ? null : window.visualViewport ?? null)
});