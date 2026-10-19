import { describe, it, expect, vi } from 'vitest';
import { createOverlayBackHandler, OverlayBackHost } from './useAndroidBackButton';

/**
 * A tiny emulation of the browser history: a stack of states plus a back
 * button that pops the stack and notifies the popstate listeners.
 */
function createFakeHost() {
  const stack: any[] = [{ base: true }];
  const listeners: Array<(event: any) => void> = [];

  const host: OverlayBackHost & { pressBack: () => void; depth: () => number } = {
    history: {
      pushState(state: unknown) {
        stack.push(state);
      },
      back() {
        if (stack.length > 1) stack.pop();
      },
      get state() {
        return stack[stack.length - 1];
      },
    } as any,
    addEventListener(_type, handler) {
      listeners.push(handler);
    },
    removeEventListener(_type, handler) {
      const index = listeners.indexOf(handler);
      if (index >= 0) listeners.splice(index, 1);
    },
    pressBack() {
      if (stack.length > 1) stack.pop();
      for (const listener of [...listeners]) listener({ state: stack[stack.length - 1] });
    },
    depth: () => stack.length,
  };

  return host;
}

describe('Android back button guard', () => {
  it('closes the overlay when the back button is pressed', () => {
    const host = createFakeHost();
    const onClose = vi.fn();

    createOverlayBackHandler(host, onClose);
    expect(host.depth()).toBe(2);

    host.pressBack();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pushes exactly one history entry', () => {
    const host = createFakeHost();
    const dispose = createOverlayBackHandler(host, vi.fn());

    expect(host.depth()).toBe(2);
    dispose();
  });

  it('removes the history entry when the overlay is closed without a back press', () => {
    const host = createFakeHost();
    const onClose = vi.fn();

    const dispose = createOverlayBackHandler(host, onClose);
    expect(host.depth()).toBe(2);

    // The user closes the overlay with the close button.
    dispose();

    expect(host.depth()).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close the overlay twice', () => {
    const host = createFakeHost();
    const onClose = vi.fn();

    const dispose = createOverlayBackHandler(host, onClose);
    host.pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);

    // The overlay closes -> the cleanup runs -> the marker is already gone.
    dispose();
    expect(host.depth()).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the overlay on any back navigation', () => {
    const host = createFakeHost();
    const onClose = vi.fn();

    createOverlayBackHandler(host, onClose);

    // The browser reports the state of the entry that is now current, so the
    // marker is gone when the event fires. The overlay is closed anyway.
    host.pressBack();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('survives a host without a usable history API', () => {
    const broken = {
      history: {
        pushState() {
          throw new Error('History API disabled');
        },
        back() {},
        state: null,
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as OverlayBackHost;

    const dispose = createOverlayBackHandler(broken, vi.fn());
    expect(() => dispose()).not.toThrow();
  });
});
