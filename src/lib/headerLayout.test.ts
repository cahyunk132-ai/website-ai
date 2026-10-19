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
 *  4. "tombolnya aneh" - the toolbar mixed three labelled buttons with seven
 *     icon-only ones, which looked random and cryptic. Every action now has
 *     a visible label and the actions live in their own wrapping row, so
 *     they can neither overlap the main bar nor each other.
 */
describe('header toolbar layout', () => {
  it('keeps every action directly in the toolbar', () => {
    // The "More" menu is gone, the actions are one click away again.
    expect(page).not.toMatch(/HeaderOverflowMenu/);
    expect(page).not.toMatch(/headerOverflowItems/);
  });

  it('shows all eleven toolbar actions', () => {
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

    // The tooltips now live in the shared action list and are handed to the
    // button as `title={action.title}`.
    const start = page.indexOf('const headerActions = [');
    const block = page.slice(start, page.indexOf('\n  ];', start));
    for (const title of actions) {
      expect(block).toContain(`title: '${title}'`);
    }
    expect(headerMarkup).toContain('title={action.title}');

    // Six Thinking Hats has a dynamic tooltip: the locked state explains the
    // tier that is needed, the unlocked state describes the feature.
    expect(block).toContain("id: 'sixhats'");
    expect(block).toContain("label: 'Six Hats'");
    expect(block).toContain('Six Thinking Hats - enam sudut pandang + kesimpulan');
    expect(block).toContain('Butuh ${SIX_HATS_REQUIRED_LABEL}');
  });

  it('keeps the secondary actions in the command palette as well', () => {
    for (const id of ['download-app', 'open-keys', 'open-parameters', 'shortcuts']) {
      expect(page).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('labels every toolbar action instead of leaving cryptic icons', () => {
    // The action list is rendered from one array, so icon and label always
    // travel together - no more "icon only" buttons in the middle of the bar.
    const start = page.indexOf('const headerActions = [');
    expect(start).toBeGreaterThan(-1);
    const block = page.slice(start, page.indexOf('\n  ];', start));

    const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Skills',
      'Six Hats',
      'Tools',
      'Palette',
      'Memory',
      'Jadwal',
      'Share',
      'Sampah',
      'Export',
      'Download',
      'Key Pool',
    ]);

    // Every action also has an icon and a tooltip for the narrow screens.
    const icons = [...block.matchAll(/\n      icon: /g)].length;
    const titles = [...block.matchAll(/\n      title: /g)].length;
    expect(icons).toBe(labels.length);
    expect(titles).toBe(labels.length);

    // The label is rendered next to the icon.
    expect(headerMarkup).toMatch(
      /<span className="hidden sm:inline font-medium">\{action\.label\}<\/span>/
    );
    expect(page).toMatch(
      /const toolbarButtonClass = `px-2\.5 py-1\.5 rounded-xl border[^`]*flex items-center gap-1\.5/
    );
  });

  it('keeps the actions in their own wrapping row', () => {
    // The header itself wraps, the main bar may shrink, and the action row
    // takes a full line of its own -> nothing can overlap anything.
    expect(headerMarkup).toMatch(/flex flex-wrap items-center/);
    expect(headerMarkup).toMatch(/flex items-center gap-1\.5 sm:gap-2\.5 min-w-0/);
    expect(headerMarkup).toMatch(
      /w-full flex items-center gap-1 sm:gap-1\.5 flex-wrap pt-1\.5 border-t/
    );
  });

  it('does not scroll the entire header so dropdowns are not clipped', () => {
    // The root <header> must not use overflow-x-auto, otherwise dropdowns
    // (like ModelSelector) get clipped at the bottom of the header and the
    // entire navbar scrolls horizontally.
    expect(page).toMatch(/<header[^>]*compact-header/);
    const headerTag = page.slice(
      page.indexOf('<header'),
      page.indexOf('>', page.indexOf('<header'))
    );
    expect(headerTag).not.toMatch(/overflow-x-auto/);
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
