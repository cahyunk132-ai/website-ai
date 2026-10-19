'use client';

import { useEffect, useRef } from 'react';

/**
 * Minimal surface of the browser history used by the overlay guard.
 * Keeping it explicit makes the behaviour unit testable without a DOM.
 */
export interface OverlayBackHost {
  history: {
    pushState(state: unknown, title: string): void;
    back(): void;
    state: unknown;
  };
  addEventListener(type: 'popstate', handler: (event: any) => void): void;
  removeEventListener(type: 'popstate', handler: (event: any) => void): void;
}

const OVERLAY_MARKER = '__hyunkOverlay';

/**
 * Makes the Android hardware back button close an overlay instead of leaving
 * the application.
 *
 * While the overlay is open one history entry is pushed. Pressing back pops
 * that entry, fires `popstate` and the overlay is closed. When the overlay is
 * closed by any other means the extra entry is removed again, so the back
 * button keeps its normal behaviour afterwards.
 *
 * Returns a function that removes the guard.
 */
export function createOverlayBackHandler(
  host: OverlayBackHost,
  onClose: () => void
): () => void {
  const marker = `${OVERLAY_MARKER}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    host.history.pushState({ [OVERLAY_MARKER]: marker }, '');
  } catch {
    // History API unavailable (very old WebView): the overlay simply cannot
    // intercept the back button.
    return () => undefined;
  }

  const handlePopState = () => {
    // The browser reports the state of the entry that is now current, so the
    // marker of the popped entry is already gone. The only way to reach a
    // popstate while the overlay is open is a back navigation: close it.
    onClose();
  };

  host.addEventListener('popstate', handlePopState);

  return () => {
    host.removeEventListener('popstate', handlePopState);
    // The overlay was closed without a back press: drop the marker entry so
    // the back button does not need an extra press afterwards.
    const current = host.history.state as Record<string, unknown> | null;
    if (current && current[OVERLAY_MARKER] === marker) {
      host.history.back();
    }
  };
}

/**
 * React wrapper around {@link createOverlayBackHandler}.
 */
export function useAndroidBackButton(isOpen: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);

  // Keep the latest callback without re-running the effect (an unstable
  // callback would push a new history entry on every render).
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    return createOverlayBackHandler(window as unknown as OverlayBackHost, () =>
      closeRef.current()
    );
  }, [isOpen]);
}
