#!/usr/bin/env node
/**
 * Generates the SQL seed of the agent skill catalogue.
 *
 * The TypeScript library (src/lib/skills/builtins.ts) is the single source of
 * truth. This script transpiles it and writes the idempotent seed migration
 * so the database can never drift away from the code.
 *
 * Usage:
 *   node scripts/generate-skill-migration.js
 *
 * The result is verified by src/lib/skills/migration.test.ts, which compares
 * the seeded rows with the TypeScript definitions.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const BUILTINS_PATH = path.join(ROOT, 'src', 'lib', 'skills', 'builtins.ts');
const OUTPUT_PATH = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20261024000000_agent_skills_expansion.sql'
);

/** Loads the built-in catalogue straight from the TypeScript source. */
function loadBuiltins() {
  const source = fs.readFileSync(BUILTINS_PATH, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: BUILTINS_PATH,
  });

  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  const factory = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText);
  factory(module.exports, require, module, BUILTINS_PATH, path.dirname(BUILTINS_PATH));

  return module.exports.BUILTIN_SKILLS;
}

/** Escapes a value for a single quoted SQL literal. */
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** Renders one seeded row. */
function renderRow(skill) {
  if (skill.content.includes('$body$')) {
    throw new Error(`the body of "${skill.slug}" contains the dollar quote delimiter`);
  }

  return [
    '  (',
    '    null,',
    `    ${literal(skill.slug)},`,
    `    ${literal(skill.name)},`,
    `    ${literal(skill.description)},`,
    `    $body$${skill.content}$body$,`,
    `    ${literal(skill.category)}, ${literal(skill.icon)}, array[${skill.tags
      .map(literal)
      .join(', ')}], ${literal(skill.kind)}, true, false, ${skill.sortOrder}`,
    '  )',
  ].join('\n');
}

function main() {
  const skills = loadBuiltins();

  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error('no built-in skills found');
  }

  const slugs = skills.map((skill) => skill.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error('duplicate slug in the built-in catalogue');
  }

  const rows = skills.map(renderRow).join(',\n');

  const sql = `-- =============================================================================
-- Hyunk AI Hub - Agent Skills Catalogue Seed
-- =============================================================================
-- GENERATED FILE - do not edit by hand.
-- Source of truth: src/lib/skills/builtins.ts
-- Regenerate with: node scripts/generate-skill-migration.js
--
-- The skills live in Supabase only. This statement seeds the WHOLE catalogue
-- (the original 12 skills and the ones added later) so the database always
-- matches the TypeScript library.
--
-- The script is idempotent: re-running it refreshes the seeded system skills,
-- it never duplicates them.
-- =============================================================================

insert into public.skills
  (user_id, slug, name, description, content, category, icon, tags, kind, is_active, is_pinned, sort_order)
values
${rows}
on conflict (slug) where user_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  content = excluded.content,
  category = excluded.category,
  icon = excluded.icon,
  tags = excluded.tags,
  kind = excluded.kind,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc'::text, now());
`;

  fs.writeFileSync(OUTPUT_PATH, sql, 'utf8');
  console.log(`wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${skills.length} skills`);
}

main();
