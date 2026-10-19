/**
 * Hyunk AI Hub - Tiered Live Web Search
 *
 * The old implementation only asked the DuckDuckGo *Instant Answer* API. That
 * endpoint is not a search engine: it returns an abstract, a knowledge panel
 * or nothing at all, so a query like "gubernur kaltim sekarang" came back
 * empty or with years old information - and the model happily answered from
 * its own training data instead.
 *
 * This module searches in tiers, from the most reliable source to the most
 * forgiving one:
 *
 *   1. Brave Search API   (real search, optional freshness filter)
 *   2. Tavily API         (real search, built for LLMs)
 *   3. Serper.dev API     (real search, Google results + news)
 *   4. Google Programmable Search (real search)
 *   5. DuckDuckGo HTML    (real search, scraped - no key needed)
 *   6. Mojeek             (real search, independent index)
 *   7. DuckDuckGo Lite    (real search, scraped - simpler markup)
 *   8. Wikipedia search   (encyclopedic fallback, resolves the right page)
 *   9. DuckDuckGo Instant Answer (last resort, the old behaviour)
 *
 * The first tier that returns a usable result wins. Every result keeps its
 * publication date when the provider reports one, so the model can tell fresh
 * information from an old article.
 *
 * The module is dependency free and every parser is a pure function, so the
 * behaviour can be tested without a network connection.
 */

/** A single hit of the search. */
export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  /** The publication date of the source, when the provider reports one. */
  publishedDate?: string;
  /** The provider that delivered the hit. */
  provider?: string;
}

/** The answer of the search. */
export interface WebSearchResponse {
  results: WebSearchResultItem[];
  /** The text that is injected into the prompt of the model. */
  summary: string;
  /** The tier that answered the query ("none" when nothing was found). */
  provider: string;
  /** True when the query asked for recent information. */
  recency: boolean;
  /** The tiers that failed, for the server log. */
  errors?: string[];
}

/** The timeout of a single tier. */
const TIER_TIMEOUT_MS = 6000;

/** The browser user agent used by the scraping tiers. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Helpers (pure functions)
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

/** Decodes the HTML entities of a scraped text. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const value = HTML_ENTITIES[entity.toLowerCase()];
    return value ?? match;
  });
}

/** Removes the tags of a snippet and normalises the whitespace. */
export function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unwraps the redirect of DuckDuckGo: `//duckduckgo.com/l/?uddg=<encoded url>`
 * becomes the real destination.
 */
export function unwrapDuckDuckGoUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';

  if (url.startsWith('//')) url = `https:${url}`;

  if (url.includes('uddg=')) {
    try {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const target = parsed.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    } catch {
      // keep the original link
    }
  }

  return url;
}

/**
 * True when the query asks for information that may have changed recently
 * ("sekarang", "terbaru", "hari ini", "latest", "news", …).
 */
export function wantsRecentInformation(query: string): boolean {
  const text = query.toLowerCase();
  const patterns = [
    /\bsekarang\b/,
    /\bterbaru\b/,
    /\bterkini\b/,
    /\bkini\b/,
    /\bhari ini\b/,
    /\bminggu ini\b/,
    /\bbulan ini\b/,
    /\btahun ini\b/,
    /\bnow\b/,
    /\blatest\b/,
    /\brecent(ly)?\b/,
    /\bcurrent(ly)?\b/,
    /\btoday\b/,
    /\bnews\b/,
    /\bberita\b/,
    /\bupdate[ds]?\b/,
    /\bposisinya\b/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Parses the markup of the DuckDuckGo HTML endpoint.
 *
 * The title link carries the class `result__a` (not `result__url`, which is
 * why the old parser found nothing) and the snippet the class
 * `result__snippet`.
 */
export function parseDuckDuckGoHtml(
  html: string,
  maxResults: number,
  provider = 'DuckDuckGo'
): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const blocks = html.split(/<div[^>]+class=["'][^"']*\bresult\b[^"']*["']/i).slice(1);

  for (const block of blocks) {
    if (results.length >= maxResults) break;

    const link =
      block.match(
        /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      ) ||
      block.match(
        /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
      );
    if (!link) continue;

    const url = unwrapDuckDuckGoUrl(link[1]);
    const title = stripHtml(link[2]);
    if (!url || !title) continue;

    const snippetMatch =
      block.match(
        /<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
      ) ||
      block.match(
        /<(?:div|td)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|td)>/i
      );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

    if (!results.some((item) => item.url === url)) {
      results.push({ title, url, snippet, provider });
    }
  }

  return results;
}

/**
 * Parses the markup of the DuckDuckGo Lite endpoint. The table markup is
 * simpler: the link has the class `result-link`, the snippet `result-snippet`.
 */
export function parseDuckDuckGoLite(
  html: string,
  maxResults: number,
  provider = 'DuckDuckGo Lite'
): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const pattern =
    /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && results.length < maxResults) {
    const url = unwrapDuckDuckGoUrl(match[1]);
    const title = stripHtml(match[2]);
    if (!url || !title) continue;

    // The snippet follows the link inside the same table row.
    const rest = html.slice(match.index, match.index + 1200);
    const snippetMatch = rest.match(
      /class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/td>/i
    );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

    if (!results.some((item) => item.url === url)) {
      results.push({ title, url, snippet, provider });
    }
  }

  return results;
}

/**
 * Parses the markup of Mojeek, an independent search index with a simple
 * list structure: the title is a heading, the snippet a paragraph.
 */
export function parseMojeekHtml(
  html: string,
  maxResults: number,
  provider = 'Mojeek'
): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const blocks = html.split(/<li[^>]*>/i).slice(1);

  for (const block of blocks) {
    if (results.length >= maxResults) break;

    const heading = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!heading) continue;

    const title = stripHtml(heading[1]);
    if (!title) continue;

    const link = block.match(/<a[^>]*href=["']([^"']+)["']/i);
    if (!link) continue;

    const snippetMatch = block.match(
      /<p[^>]*class=["'][^"']*\bs\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
    );

    results.push({
      title,
      url: link[1],
      snippet: snippetMatch ? stripHtml(snippetMatch[1]) : '',
      provider,
    });
  }

  return results;
}

/**
 * Builds the text that is injected into the prompt of the model. Every hit is
 * numbered, carries its source and - when known - its publication date.
 */
export function buildSummary(
  results: WebSearchResultItem[],
  query: string,
  recency = false
): string {
  const blocks = results.map((result, index) => {
    const lines = [`[${index + 1}] ${result.title}`, `Source: ${result.url}`];
    if (result.publishedDate) lines.push(`Published: ${result.publishedDate}`);
    if (result.snippet) lines.push(result.snippet);
    return lines.join('\n');
  });

  const header = recency
    ? `Live web results for "${query}" (the user asked for the latest information - prefer the most recent source and state the date of each fact).`
    : `Live web results for "${query}".`;

  return `${header}\n\n${blocks.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// The tiers
// ---------------------------------------------------------------------------

interface SearchTier {
  /** The name that is reported in the logs and in the summary. */
  name: string;
  /** True when the tier has everything it needs (an API key for example). */
  isConfigured(): boolean;
  /** Runs the tier and returns the hits it found. */
  run(query: string, maxResults: number, recency: boolean): Promise<WebSearchResultItem[]>;
}

/** Reads an environment variable and trims it. */
function env(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/** The first non empty value of a list of environment variables. */
function envAny(...names: string[]): string {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return '';
}

/** A JSON fetch with a timeout. */
async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIER_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HyunkAIHub/1.0 (compatible; +https://hyunkai.com)',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/** A text fetch with a timeout. */
async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIER_TIMEOUT_MS),
    headers: {
      'User-Agent': BROWSER_UA,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/** 1. Brave Search API - the most reliable free tier (2000 queries/month). */
const braveTier: SearchTier = {
  name: 'brave',
  isConfigured: () => Boolean(envAny('BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY')),
  async run(query, maxResults, recency) {
    const key = envAny('BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY');
    const params = new URLSearchParams({ q: query, count: String(maxResults) });
    if (recency) params.set('freshness', 'pm');

    const data = await fetchJson(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      { headers: { 'X-Subscription-Token': key } }
    );

    const hits = Array.isArray(data?.web?.results) ? data.web.results : [];
    return hits.slice(0, maxResults).map((hit: any) => ({
      title: String(hit.title || query),
      url: String(hit.url || ''),
      snippet: stripHtml(hit.description || ''),
      publishedDate: hit.page_age || hit.age || undefined,
      provider: 'Brave Search',
    }));
  },
};

/** 2. Tavily - a search API that is built for LLMs. */
const tavilyTier: SearchTier = {
  name: 'tavily',
  isConfigured: () => Boolean(env('TAVILY_API_KEY')),
  async run(query, maxResults, recency) {
    const key = env('TAVILY_API_KEY');
    const body: Record<string, unknown> = {
      api_key: key,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    };
    if (recency) body.days = 30;

    const data = await fetchJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const hits = Array.isArray(data?.results) ? data.results : [];
    return hits.slice(0, maxResults).map((hit: any) => ({
      title: String(hit.title || query),
      url: String(hit.url || ''),
      snippet: stripHtml(hit.content || ''),
      publishedDate: hit.published_date || undefined,
      provider: 'Tavily',
    }));
  },
};

/** 3. Serper.dev - Google results and news in one call. */
const serperTier: SearchTier = {
  name: 'serper',
  isConfigured: () => Boolean(env('SERPER_API_KEY')),
  async run(query, maxResults) {
    const key = env('SERPER_API_KEY');
    const data = await fetchJson('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, num: maxResults, gl: 'id', hl: 'id' }),
    });

    const organic = Array.isArray(data?.organic) ? data.organic : [];
    const news = Array.isArray(data?.news) ? data.news : [];

    const hits = [
      ...news.map((hit: any) => ({
        title: String(hit.title || query),
        url: String(hit.link || ''),
        snippet: stripHtml(hit.snippet || ''),
        publishedDate: hit.date || undefined,
        provider: 'Serper News',
      })),
      ...organic.map((hit: any) => ({
        title: String(hit.title || query),
        url: String(hit.link || ''),
        snippet: stripHtml(hit.snippet || ''),
        publishedDate: hit.date || undefined,
        provider: 'Serper',
      })),
    ].filter((hit) => hit.url);

    return hits.slice(0, maxResults);
  },
};

/** 4. Google Programmable Search. */
const googleTier: SearchTier = {
  name: 'google-cse',
  isConfigured: () =>
    Boolean(envAny('GOOGLE_CSE_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_API_KEY')) &&
    Boolean(envAny('GOOGLE_CSE_ID', 'GOOGLE_SEARCH_CX', 'GOOGLE_CX')),
  async run(query, maxResults, recency) {
    const key = envAny('GOOGLE_CSE_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_API_KEY');
    const cx = envAny('GOOGLE_CSE_ID', 'GOOGLE_SEARCH_CX', 'GOOGLE_CX');

    const params = new URLSearchParams({
      key,
      cx,
      q: query,
      num: String(Math.min(maxResults, 10)),
    });
    if (recency) params.set('dateRestrict', 'm3');

    const data = await fetchJson(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`
    );

    const hits = Array.isArray(data?.items) ? data.items : [];
    return hits.slice(0, maxResults).map((hit: any) => ({
      title: String(hit.title || query),
      url: String(hit.link || ''),
      snippet: stripHtml(hit.snippet || ''),
      publishedDate:
        hit.pagemap?.newsarticle?.[0]?.datepublished ||
        hit.pagemap?.metatags?.[0]?.['article:published_time'] ||
        undefined,
      provider: 'Google',
    }));
  },
};

/** 5. DuckDuckGo HTML - a real search without an API key. */
const duckDuckGoHtmlTier: SearchTier = {
  name: 'duckduckgo-html',
  isConfigured: () => true,
  async run(query, maxResults) {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    );
    return parseDuckDuckGoHtml(html, maxResults);
  },
};

/** 6. Mojeek - an independent index, a good backup when DuckDuckGo blocks. */
const mojeekTier: SearchTier = {
  name: 'mojeek',
  isConfigured: () => true,
  async run(query, maxResults) {
    const html = await fetchText(
      `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`
    );
    return parseMojeekHtml(html, maxResults);
  },
};

/** 7. DuckDuckGo Lite - the same search with a simpler markup. */
const duckDuckGoLiteTier: SearchTier = {
  name: 'duckduckgo-lite',
  isConfigured: () => true,
  async run(query, maxResults) {
    const html = await fetchText(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
    );
    return parseDuckDuckGoLite(html, maxResults);
  },
};

/** 8. Wikipedia - resolves the right page and returns its summary. */
const wikipediaTier: SearchTier = {
  name: 'wikipedia',
  isConfigured: () => true,
  async run(query, maxResults) {
    const languages = ['id', 'en'];
    const results: WebSearchResultItem[] = [];

    for (const language of languages) {
      if (results.length >= maxResults) break;

      const search = await fetchJson(
        `https://${language}.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=3&srsearch=${encodeURIComponent(
          query
        )}`
      );

      const hits = Array.isArray(search?.query?.search) ? search.query.search : [];
      for (const hit of hits) {
        if (results.length >= maxResults) break;
        const title = String(hit.title || '').replace(/ /g, '_');
        if (!title) continue;

        const summary = await fetchJson(
          `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        ).catch(() => null);

        const extract = summary?.extract ? stripHtml(summary.extract) : '';
        const snippet = extract || stripHtml(hit.snippet || '').replace(/<[^>]+>/g, '');
        if (!snippet) continue;

        results.push({
          title: summary?.title || hit.title || query,
          url:
            summary?.content_urls?.desktop?.page ||
            `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
          snippet,
          publishedDate: summary?.timestamp || hit.timestamp || undefined,
          provider: `Wikipedia (${language})`,
        });
      }
    }

    return results;
  },
};

/** 9. DuckDuckGo Instant Answer - the old behaviour, only as a last resort. */
const instantAnswerTier: SearchTier = {
  name: 'duckduckgo-instant-answer',
  isConfigured: () => true,
  async run(query, maxResults) {
    const data = await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
    );

    const results: WebSearchResultItem[] = [];

    if (data?.AbstractText) {
      results.push({
        title: String(data.Heading || query),
        url: String(data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`),
        snippet: String(data.AbstractText),
        provider: 'DuckDuckGo Instant Answer',
      });
    }

    const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    for (const topic of related) {
      if (results.length >= maxResults) break;
      if (topic?.Text && topic?.FirstURL) {
        results.push({
          title: String(topic.Text).slice(0, 80),
          url: String(topic.FirstURL),
          snippet: String(topic.Text),
          provider: 'DuckDuckGo Instant Answer',
        });
      }
    }

    return results;
  },
};

/** The tiers, from the most reliable to the most forgiving. */
export const SEARCH_TIERS: SearchTier[] = [
  braveTier,
  tavilyTier,
  serperTier,
  googleTier,
  duckDuckGoHtmlTier,
  mojeekTier,
  duckDuckGoLiteTier,
  wikipediaTier,
  instantAnswerTier,
];

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Searches the live web and returns the hits of the first tier that worked.
 */
export async function searchWeb(
  query: string,
  maxResults: number = 5,
  options: { recency?: boolean } = {}
): Promise<WebSearchResponse> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return {
      results: [],
      summary: 'No search query provided.',
      provider: 'none',
      recency: false,
    };
  }

  const recency = options.recency ?? wantsRecentInformation(cleanQuery);
  const errors: string[] = [];
  const started = Date.now();

  // The chain of tiers may take a while when every endpoint is slow. The
  // cheap last resort (the instant answer) always runs, the other tiers share
  // the budget.
  const rawBudget = Number(process.env.WEB_SEARCH_BUDGET_MS);
  const budgetMs = Number.isFinite(rawBudget) && rawBudget >= 0 ? rawBudget : 15000;
  const fallback = instantAnswerTier;

  for (const tier of SEARCH_TIERS) {
    if (tier === fallback) continue;
    if (!tier.isConfigured()) continue;

    if (Date.now() - started >= budgetMs) {
      errors.push(`search budget of ${budgetMs}ms exhausted`);
      break;
    }

    try {
      const results = await tier.run(cleanQuery, maxResults, recency);
      const usable = results.filter((item) => item.url && (item.title || item.snippet));

      if (usable.length > 0) {
        return {
          results: usable,
          summary: buildSummary(usable, cleanQuery, recency),
          provider: tier.name,
          recency,
          errors: errors.length ? errors : undefined,
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${tier.name}: ${message}`);
    }
  }

  // The last resort runs even when the budget is exhausted.
  try {
    const results = await fallback.run(cleanQuery, maxResults, recency);
    const usable = results.filter((item) => item.url && (item.title || item.snippet));

    if (usable.length > 0) {
      return {
        results: usable,
        summary: buildSummary(usable, cleanQuery, recency),
        provider: fallback.name,
        recency,
        errors: errors.length ? errors : undefined,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`${fallback.name}: ${message}`);
  }

  return {
    results: [],
    summary: `No live search results found for query: "${cleanQuery}".`,
    provider: 'none',
    recency,
    errors: errors.length ? errors : undefined,
  };
}
