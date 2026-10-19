/**
 * Hyunk AI Hub - Six Thinking Hats
 *
 * The Six Thinking Hats method (Edward de Bono) looks at one topic from six
 * different angles:
 *
 *   white  - facts, data, objective information
 *   red    - emotions, intuition, feelings
 *   black  - risks, dangers, what can go wrong
 *   yellow - benefits, opportunities, optimism
 *   green  - creativity, alternatives, new ideas
 *   blue   - process, conclusion and the next step
 *
 * Every hat is a separate AI request with its own system prompt. The first
 * five run in parallel, the Blue Hat runs last because it needs the result of
 * the other five to summarise them.
 *
 * The module is dependency free so it can be used by the server route and by
 * the browser component.
 */

/** The lowest tier that may use the feature (Premium 3 and Premium 4). */
export const SIX_HATS_MIN_TIER = 3;

export type SixHatId = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

export interface SixHatDefinition {
  id: SixHatId;
  name: string;
  emoji: string;
  /** The colour of the card (hex value). */
  color: string;
  /** The short description shown in the header of the card. */
  focus: string;
  /** The system prompt of the request that generates this hat. */
  systemPrompt: string;
}

/** The five hats that run in parallel. */
export const PARALLEL_HAT_IDS: SixHatId[] = ['white', 'red', 'black', 'yellow', 'green'];

/** The hat that summarises the other five. */
export const BLUE_HAT_ID: SixHatId = 'blue';

/**
 * The definition of the six hats. The system prompts are the contract of the
 * feature: every hat must answer with its own perspective only.
 */
export const SIX_HATS: SixHatDefinition[] = [
  {
    id: 'white',
    name: 'White Hat',
    emoji: '🤍',
    color: '#e5e7eb',
    focus: 'Fakta & Data',
    systemPrompt: `Kamu adalah White Hat dalam Six Thinking Hats. Analisis topik ini HANYA berdasarkan fakta, data, angka, dan informasi objektif yang tersedia. Jangan opini, jangan emosi. Sajikan apa yang diketahui dan apa yang belum diketahui.`,
  },
  {
    id: 'red',
    name: 'Red Hat',
    emoji: '❤️',
    color: '#ef4444',
    focus: 'Emosi & Intuisi',
    systemPrompt: `Kamu adalah Red Hat dalam Six Thinking Hats. Ekspresikan reaksi emosional, perasaan, dan intuisi tentang topik ini. Tidak perlu justifikasi logis — ini murni tentang bagaimana rasanya, firasat, dan respons emosional.`,
  },
  {
    id: 'black',
    name: 'Black Hat',
    emoji: '🖤',
    color: '#1f2937',
    focus: 'Risiko & Negatif',
    systemPrompt: `Kamu adalah Black Hat dalam Six Thinking Hats. Identifikasi semua risiko, bahaya, kelemahan, hambatan, dan hal-hal yang bisa salah. Berpikir kritis dan pesimistis — cari semua alasan mengapa ini bisa gagal atau berbahaya.`,
  },
  {
    id: 'yellow',
    name: 'Yellow Hat',
    emoji: '💛',
    color: '#eab308',
    focus: 'Optimisme & Positif',
    systemPrompt: `Kamu adalah Yellow Hat dalam Six Thinking Hats. Identifikasi semua nilai positif, manfaat, peluang, dan alasan optimisme. Cari semua alasan mengapa ini bisa berhasil dan apa keuntungannya.`,
  },
  {
    id: 'green',
    name: 'Green Hat',
    emoji: '💚',
    color: '#22c55e',
    focus: 'Kreativitas & Ide',
    systemPrompt: `Kamu adalah Green Hat dalam Six Thinking Hats. Generate ide-ide kreatif, alternatif baru, kemungkinan yang belum terpikirkan, dan solusi inovatif. Berpikir lateral, out-of-the-box, tanpa batas.`,
  },
  {
    id: 'blue',
    name: 'Blue Hat',
    emoji: '💙',
    color: '#3b82f6',
    focus: 'Proses & Kesimpulan',
    systemPrompt: `Kamu adalah Blue Hat dalam Six Thinking Hats. Setelah mempertimbangkan semua perspektif (fakta, emosi, risiko, peluang, dan ide kreatif), rangkum analisis secara keseluruhan, tentukan langkah selanjutnya yang paling tepat, dan buat kesimpulan final yang actionable.`,
  },
];

/** Looks up a hat by its id. */
export function getSixHat(id: string): SixHatDefinition | undefined {
  return SIX_HATS.find((hat) => hat.id === id);
}

/**
 * True when the account may use the feature: Premium 3, Premium 4 and the
 * administrator.
 */
export function canUseSixHats(role: string | null | undefined, tier: number): boolean {
  if (role === 'admin') return true;
  return tier >= SIX_HATS_MIN_TIER;
}

/** The name of the tier that is required for the feature. */
export const SIX_HATS_REQUIRED_LABEL = 'Premium 3';

/**
 * The results of the six hats, keyed by the id of the hat.
 */
export type SixHatResults = Partial<Record<SixHatId, string>>;

/**
 * The maximum number of characters of one perspective that is handed over to
 * the Blue Hat. The context of the summary stays small enough for the smaller
 * models, the essential part of every answer is kept.
 */
export const BLUE_HAT_CONTEXT_MAX_CHARS = 2000;

/**
 * Builds the context of the Blue Hat: the five other perspectives are handed
 * over so the summary can really integrate them.
 */
export function buildBlueHatContext(
  results: SixHatResults,
  maxChars: number = BLUE_HAT_CONTEXT_MAX_CHARS
): string {
  return PARALLEL_HAT_IDS.map((id) => {
    const hat = getSixHat(id);
    const text = (results[id] || '').trim();
    const clipped =
      text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;

    return `### ${hat?.emoji ?? ''} ${hat?.name ?? id} — ${hat?.focus ?? ''}\n${
      clipped || '(tidak ada jawaban)'
    }`;
  }).join('\n\n');
}

/**
 * The markdown of the analysis. It is stored as a single assistant message in
 * the conversation history and it is the format of the "Copy Semua" button.
 */
export function buildSixHatsMarkdown(topic: string, results: SixHatResults): string {
  const blocks = SIX_HATS.map((hat) => {
    const text = (results[hat.id] || '').trim() || '_Belum ada jawaban._';
    return `### ${hat.emoji} ${hat.name} — ${hat.focus}\n${text}`;
  });

  return [
    '## 🎩 Six Thinking Hats Analysis',
    `**Topik:** ${topic.trim()}`,
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
