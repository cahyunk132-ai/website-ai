import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// The sidebar pulls in the storage layer, which talks to Supabase. The
// component itself is rendered without any data, so the network is never
// touched, but the client creation is stubbed to keep the test hermetic.
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }),
  }),
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }),
  }),
}));

// The user menu inside the sidebar needs the auth context, which is not
// part of this test.
vi.mock('./UserProfileMenu', () => ({
  UserProfileMenu: () => React.createElement('div', null, 'user-menu'),
}));

import { Sidebar } from './Sidebar';

const noop = () => undefined;

const renderSidebar = (isOpen: boolean) =>
  renderToStaticMarkup(
    React.createElement(Sidebar, {
      conversations: [],
      folders: [],
      activeConversationId: null,
      onSelectConversation: noop,
      onNewConversation: noop,
      onDeleteConversation: noop,
      onRenameConversation: noop,
      onToggleFavorite: noop,
      isOpen,
      onToggleOpen: noop,
      onToggleTheme: noop,
      theme: 'dark',
      user: null,
      onLogout: noop,
      onOpenAuth: noop,
      onOpenMemory: noop,
      onOpenSchedules: noop,
      onOpenTrash: noop,
      activeTag: null,
      onSelectTag: noop,
    } as never)
  );

/** Returns the class list of the `<aside>` element. */
const asideClasses = (html: string) => {
  const match = html.match(/<aside class="([^"]*)"/);
  expect(match).not.toBeNull();
  return match![1];
};

describe('Sidebar collapsed state', () => {
  it('hides the sidebar completely on a desktop when it is closed', () => {
    const classes = asideClasses(renderSidebar(false));
    // `md:hidden` wins over the base `flex` and hides the whole sidebar on
    // a desktop, while the phone keeps the slide out animation.
    expect(classes).toContain('-translate-x-full md:hidden');
    expect(classes).not.toContain('md:w-0');
  });

  it('shows the sidebar when it is open', () => {
    const classes = asideClasses(renderSidebar(true));
    expect(classes).toContain('translate-x-0');
    expect(classes).not.toContain('md:hidden');
  });
});
