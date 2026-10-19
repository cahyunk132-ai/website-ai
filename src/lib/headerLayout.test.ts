import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src', 'components', 'Sidebar.tsx'), 'utf8');
const modelSelector = readFileSync(
  join(process.cwd(), 'src', 'components', 'ModelSelector.tsx'),
  'utf8'
);
const authModal = readFileSync(
  join(process.cwd(), 'src', 'components', 'AuthModal.tsx'),
  'utf8'
);

/** Removes the `//` comments so a comment cannot satisfy (or break) a check. */
const stripComments = (source: string) => source.replace(/\/\/[^\n]*/g, '');

const headerMarkup = page.slice(page.indexOf('<header'), page.indexOf('</header>'));

/**
 * Regression tests for the problems reported from the laptop screenshots:
 *
 *  1. "tombolnya tabrakan" - the header toolbar buttons overlapped each other
 *     and the model selector was squeezed down to a couple of characters.
 *  2. "burger buttomnya tidak bekerja di laptop" - the hamburger button did
 *     nothing on a desktop, because the collapsed state of the sidebar used
 *     `md:w-0` while the base classes also contained `md:w-72`. In the
 *     generated stylesheet `.md:w-72` is emitted AFTER `.md:w-0`, so the
 *     sidebar kept its full width and the toggle looked broken.
 *  3. "tombol morenya merepotkan" - the "More" dropdown hid the actions
 *     behind an extra click, so the buttons are back in the toolbar, this
 *     time as compact icon buttons that can never overlap.
 */
describe('header toolbar layout', () => {
  it('keeps every action directly in the toolbar', () => {
    // The "More" menu is gone, the actions are one click away again.
    expect(page).not.toMatch(/HeaderOverflowMenu/);
    expect(page).not.toMatch(/headerOverflowItems/);
  });

  it('shows all ten toolbar actions', () => {
    const actions = [
      'Agent Skills & Personas',
      'Tool Runner - jalankan tool langsung',
      'Command Palette (Ctrl/Cmd + K)',
      'AI Memory - fakta yang diingat AI antar percakapan',
      'Jadwal Otomatis - prompt cron',
      'Bagikan percakapan (tautan publik)',
      'Sampah - pulihkan percakapan yang dihapus',
      'Export Conversation (PDF / Markdown / JSON)',
      'Download Windows & Mobile Apps',
      'Manage API Key Pool',
    ];

    for (const title of actions) {
      expect(headerMarkup).toContain(`title="${title}"`);
    }
  });

  it('keeps the secondary actions in the command palette as well', () => {
    for (const id of ['download-app', 'open-keys', 'open-parameters', 'shortcuts']) {
      expect(page).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('uses compact icon buttons so the row can never overlap', () => {
    // The shared class of the toolbar buttons: no label, only the tooltip.
    expect(page).toMatch(/const toolbarButtonClass = `p-2 rounded-xl border/);
    // Only the three most used buttons still carry a text label.
    const labels = ['Skills', 'Tools', 'Palette'].filter((label) =>
      headerMarkup.includes(`>${label}</span>`)
    );
    expect(labels).toEqual(['Skills', 'Tools', 'Palette']);
  });

  it('lets the header scroll instead of overlapping the buttons', () => {
    expect(headerMarkup).toMatch(/overflow-x-auto/);
    expect(headerMarkup).toMatch(/no-scrollbar/);
  });

  it('gives the model selector room to breathe', () => {
    expect(modelSelector).toMatch(/max-w-\[120px\]/);
    expect(modelSelector).toMatch(/lg:max-w-none/);
  });

  it('does not use the undefined `xs` breakpoint', () => {
    // `xs` is not a Tailwind breakpoint, so `xs:inline` never generated any
    // CSS and the Chat / Agent labels stayed invisible forever.
    expect(stripComments(page)).not.toMatch(/\bxs:/);
    expect(stripComments(modelSelector)).not.toMatch(/\bxs:/);
  });
});

describe('quick login buttons', () => {
  it('only offers the demo account', () => {
    expect(authModal).toMatch(/Akun Demo/);
    expect(authModal).not.toMatch(/Akun Admin/);
    expect(authModal).not.toMatch(/admin@hyunkai\.com/);
  });
});

describe('sidebar toggle', () => {
  it('hides the sidebar on a desktop when it is closed', () => {
    // `md:w-0` loses against `md:w-72` in the generated stylesheet, the
    // collapsed state therefore has to use `md:hidden`.
    const code = stripComments(sidebar);
    expect(code).toMatch(/'-translate-x-full md:hidden'/);
    expect(code).not.toMatch(/md:w-0/);
  });

  it('opens the sidebar by default on a wide screen', () => {
    expect(page).toMatch(
      /if \(window\.innerWidth >= 768\) \{\s*setIsSidebarOpen\(true\);/
    );
  });

  it('toggles the sidebar from the burger button', () => {
    const burger = page.slice(
      page.indexOf('Sembunyikan sidebar') - 900,
      page.indexOf('Sembunyikan sidebar')
    );
    expect(burger).toMatch(/onClick=\{\(\) => setIsSidebarOpen\(!isSidebarOpen\)\}/);
    expect(page).toMatch(
      /aria-label=\{isSidebarOpen \? 'Sembunyikan sidebar' : 'Tampilkan sidebar'\}/
    );
  });
});
