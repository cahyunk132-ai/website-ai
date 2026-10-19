import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src', 'components', 'Sidebar.tsx'), 'utf8');
const modelSelector = readFileSync(
  join(process.cwd(), 'src', 'components', 'ModelSelector.tsx'),
  'utf8'
);
const overflowMenu = readFileSync(
  join(process.cwd(), 'src', 'components', 'HeaderOverflowMenu.tsx'),
  'utf8'
);

/** Removes the `//` comments so a comment cannot satisfy (or break) a check. */
const stripComments = (source: string) => source.replace(/\/\/[^\n]*/g, '');

const headerMarkup = page.slice(page.indexOf('<header'), page.indexOf('</header>'));

/**
 * Regression tests for the two problems reported from the laptop screenshot:
 *
 *  1. "tombolnya tabrakan" - the header toolbar buttons overlapped each other
 *     and the model selector was squeezed down to a couple of characters.
 *  2. "burger buttomnya tidak bekerja di laptop" - the hamburger button did
 *     nothing on a desktop, because the collapsed state of the sidebar used
 *     `md:w-0` while the base classes also contained `md:w-72`. In the
 *     generated stylesheet `.md:w-72` is emitted AFTER `.md:w-0`, so the
 *     sidebar kept its full width and the toggle looked broken.
 */
describe('header toolbar layout', () => {
  it('renders the overflow menu instead of a long row of buttons', () => {
    expect(page).toMatch(/<HeaderOverflowMenu\s+items=\{headerOverflowItems\}/);
    expect(overflowMenu).toMatch(/export const HeaderOverflowMenu/);
  });

  it('keeps only a few buttons visible in the toolbar', () => {
    // The right hand group of the header starts with the last `shrink-0`
    // wrapper and ends with the closing header tag.
    const rightGroup = headerMarkup.slice(headerMarkup.lastIndexOf('shrink-0">'));
    const visibleLabels = [
      'Skills',
      'Tools',
      'Palette',
      'Memory',
      'Jadwal',
      'Share',
      'Sampah',
      'Export',
      'Download',
      'Key Pool',
    ].filter((label) => rightGroup.includes(`>${label}</span>`));

    // Only Skills, Tools and Palette may stay in the toolbar.
    expect(visibleLabels).toEqual(['Skills', 'Tools', 'Palette']);
  });

  it('moves the secondary actions into the overflow menu', () => {
    for (const id of [
      'new-chat',
      'search',
      'memory',
      'schedules',
      'share',
      'trash',
      'export',
      'download',
      'keys',
      'dashboard',
      'parameters',
      'theme',
      'notifications',
      'shortcuts',
    ]) {
      expect(page).toMatch(new RegExp(`id: '${id}'`));
    }
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
    const burger = page.slice(page.indexOf('Sembunyikan sidebar') - 900, page.indexOf('Sembunyikan sidebar'));
    expect(burger).toMatch(/onClick=\{\(\) => setIsSidebarOpen\(!isSidebarOpen\)\}/);
    expect(page).toMatch(/aria-label=\{isSidebarOpen \? 'Sembunyikan sidebar' : 'Tampilkan sidebar'\}/);
  });
});
