import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ role: 'free' as string | null }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: state.role ? { role: state.role } : null }) }));
import { SettingsModal } from './SettingsModal';

describe('endpoint settings visibility', () => {
  it.each([null, 'free', 'premium1', 'premium4'])('does not expose endpoint or credential forms to %s', (role) => {
    state.role = role;
    const html = renderToStaticMarkup(<SettingsModal isOpen onClose={() => {}} />);
    expect(html).toContain('Hanya Administrator');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Base URL HTTPS');
  });
  it('shows endpoint creation, API key input, model tiers and connection test to admin', () => {
    state.role = 'admin';
    const html = renderToStaticMarkup(<SettingsModal isOpen onClose={() => {}} />);
    for (const text of ['Base URL HTTPS', 'type="password"', 'Tier minimum', 'Vision', 'Simpan endpoint', 'Tes koneksi /models', '+ Tambah API key', 'beberapa key untuk satu endpoint']) expect(html).toContain(text);
  });
});
