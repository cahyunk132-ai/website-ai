import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchWeb,
  buildSummary,
  parseDuckDuckGoHtml,
  parseDuckDuckGoLite,
  parseMojeekHtml,
  unwrapDuckDuckGoUrl,
  decodeHtmlEntities,
  stripHtml,
  wantsRecentInformation,
} from './webSearch';

/** A realistic excerpt of the markup of the DuckDuckGo HTML endpoint. */
const DDG_HTML = `
<html><body>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kaltimprov.go.id%2Fberita&amp;rut=xyz">Gubernur Kalimantan Timur &#39;terbaru&#39;</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kaltimprov.go.id%2Fberita">Rincian <b>gubernur</b> yang sedangSpoiler &amp;品种 &#x27;hari ini&#39;.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://news.example.com/2026/10/20/daftar-gubernur">Daftar gubernur provinces</a>
    </h2>
    <a class="result__snippet" href="https://news.example.com/2026/10/20/daftar-gubernur">Pembaruan名单 20 Oktober 2026.</a>
  </div>
</div>
</body></html>
`;

/** A realistic excerpt of the markup of the DuckDuckGo Lite endpoint. */
const DDG_LITE = `
<table>
<tr><td><a class='result-link' href='https://www.example.com/a'>Contoh hasil pertama</a></td></tr>
<tr><td class='result-snippet'>Ringkasan hasil pertama untuk topik.</td></tr>
<tr><td><a class='result-link' href='https://www.example.com/b'>Contoh hasil kedua</a></td></tr>
<tr><td class='result-snippet'>Ringkasan hasil kedua untuk topik.</td></tr>
</table>
`;

/** A realistic excerpt of the markup of the Mojeek result list. */
const MOJEEK_HTML = `
<ul class="results-standard">
  <li>
    <h2><a href="https://www.example.com/berita">Berita(option)</a></h2>
    <p class="s">Ringkasan berita dari Mojeek.</p>
  </li>
  <li>
    <h2><a href="https://www.example.com/berita2">Berita kedua</a></h2>
    <p class="s">Ringkasan kedua.</p>
  </li>
</ul>
`;

/** Builds a fetch mock that answers depending on the URL. */
function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; json?: any; text?: string }) {
  const fetchMock = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    const answer = handler(url, init);

    if (answer.status && answer.status >= 400) {
      return {
        ok: false,
        status: answer.status,
        statusText: 'Error',
        json: async () => ({}),
        text: async () => '',
      } as any;
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => answer.json ?? {},
      text: async () => answer.text ?? '',
    } as any;
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ENV_KEYS = [
  'WEB_SEARCH_BUDGET_MS',
  'BRAVE_SEARCH_API_KEY',
  'BRAVE_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
  'GOOGLE_CSE_API_KEY',
  'GOOGLE_SEARCH_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_CSE_ID',
  'GOOGLE_SEARCH_CX',
  'GOOGLE_CX',
];

describe('web search helpers', () => {
  it('detects a query that asks for recent information', () => {
    expect(wantsRecentInformation('gubernur kaltim sekarang')).toBe(true);
    expect(wantsRecentInformation('berita terbaru')).toBe(true);
    expect(wantsRecentInformation('what is the latest news')).toBe(true);
    expect(wantsRecentInformation('harga iPhone hari ini')).toBe(true);
    expect(wantsRecentInformation('current president of france')).toBe(true);
    expect(wantsRecentInformation('news about bali')).toBe(true);

    expect(wantsRecentInformation('apa itu typescript')).toBe(false);
    expect(wantsRecentInformation('cara install nodejs')).toBe(false);
  });

  it('decodes the html entities of a snippet', () => {
    expect(decodeHtmlEntities('a &amp; b')).toBe('a & b');
    expect(decodeHtmlEntities('&#39;quoted&#39;')).toBe("'quoted'");
    expect(decodeHtmlEntities('&#x27;quoted&#x27;')).toBe("'quoted'");
    expect(decodeHtmlEntities('no entity')).toBe('no entity');
  });

  it('strips the tags of a snippet', () => {
    expect(stripHtml('<b>tebal</b> &amp; <i>miring</i>')).toBe('tebal & miring');
  });

  it('unwraps the redirect of duckduckgo', () => {
    const wrapped =
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com%2Fpage&rut=abc';
    expect(unwrapDuckDuckGoUrl(wrapped)).toBe('https://www.example.com/page');
    expect(unwrapDuckDuckGoUrl('https://www.example.com/x')).toBe('https://www.example.com/x');
  });

  it('parses the markup of the duckduckgo html endpoint', () => {
    const results = parseDuckDuckGoHtml(DDG_HTML, 5);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Gubernur Kalimantan Timur 'terbaru'");
    expect(results[0].url).toBe('https://www.kaltimprov.go.id/berita');
    expect(results[0].snippet).toContain('Rincian');
    expect(results[0].snippet).not.toContain('<b>');
    expect(results[1].url).toBe('https://news.example.com/2026/10/20/daftar-gubernur');
  });

  it('parses the markup of the duckduckgo lite endpoint', () => {
    const results = parseDuckDuckGoLite(DDG_LITE, 5);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Contoh hasil pertama');
    expect(results[0].url).toBe('https://www.example.com/a');
    expect(results[0].snippet).toContain('Ringkasan hasil pertama');
  });

  it('parses the markup of the mojeek result list', () => {
    const results = parseMojeekHtml(MOJEEK_HTML, 5);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Berita(option)');
    expect(results[0].url).toBe('https://www.example.com/berita');
    expect(results[0].snippet).toBe('Ringkasan berita dari Mojeek.');
  });

  it('builds a summary with the source and the date of every hit', () => {
    const summary = buildSummary(
      [
        {
          title: 'Judul artikel',
          url: 'https://example.com/artikel',
          snippet: 'Isi ringkas artikel.',
          publishedDate: '2026-10-20',
        },
      ],
      'topik uji'
    );

    expect(summary).toContain('[1] Judul artikel');
    expect(summary).toContain('Source: https://example.com/artikel');
    expect(summary).toContain('Published: 2026-10-20');
    expect(summary).toContain('Isi ringkas artikel.');
    expect(summary).toContain('topik uji');
  });

  it('warns in the summary when the user asks for the latest information', () => {
    const summary = buildSummary(
      [{ title: 'T', url: 'https://example.com', snippet: 'S' }],
      'topik',
      true
    );
    expect(summary).toContain('latest information');
  });
});

describe('tiered web search', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('uses the brave api when a key is configured', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';

    const fetchMock = mockFetch((url) => {
      if (url.includes('api.search.brave.com')) {
        return {
          json: {
            web: {
              results: [
                {
                  title: 'Berita terbaru',
                  url: 'https://berita.example.com/1',
                  description: 'Ringkasan berita.',
                  page_age: '2026-10-19',
                },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected call: ${url}`);
    });

    const response = await searchWeb('gubernur kaltim sekarang', 4);

    expect(response.provider).toBe('brave');
    expect(response.results).toHaveLength(1);
    expect(response.results[0].publishedDate).toBe('2026-10-19');
    expect(response.recency).toBe(true);
    expect(response.summary).toContain('Source: https://berita.example.com/1');
    // The scraping tiers are never called when an API key is configured.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('duckduckgo'))).toBe(false);
  });

  it('falls back to the duckduckgo html endpoint without a key', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('html.duckduckgo.com')) return { text: DDG_HTML };
      throw new Error(`unexpected call: ${url}`);
    });

    const response = await searchWeb('gubernur kaltim', 4);

    expect(response.provider).toBe('duckduckgo-html');
    expect(response.results.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the lite endpoint when the html endpoint returns nothing', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('html.duckduckgo.com')) return { text: '<html>nothing here</html>' };
      if (url.includes('mojeek.com')) return { text: '<html>nothing here</html>' };
      if (url.includes('lite.duckduckgo.com')) return { text: DDG_LITE };
      throw new Error(`unexpected call: ${url}`);
    });

    const response = await searchWeb('gubernur kaltim', 4);

    expect(response.provider).toBe('duckduckgo-lite');
    expect(response.results).toHaveLength(2);
    // DuckDuckGo HTML, Mojeek and finally DuckDuckGo Lite.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to mojeek when duckduckgo blocks the request', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('html.duckduckgo.com')) return { status: 403 };
      if (url.includes('mojeek.com')) return { text: MOJEEK_HTML };
      throw new Error(`unexpected call: ${url}`);
    });

    const response = await searchWeb('gubernur kaltim', 4);

    expect(response.provider).toBe('mojeek');
    expect(response.results).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to wikipedia when every search endpoint fails', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('wikipedia.org/w/api.php')) {
        return {
          json: {
            query: {
              search: [{ title: 'Kalimantan Timur', snippet: 'Provinsi di Indonesia' }],
            },
          },
        };
      }
      if (url.includes('/api/rest_v1/page/summary/')) {
        return {
          json: {
            title: 'Kalimantan Timur',
            extract: 'Kalimantan Timur adalah sebuah provinsi di Indonesia.',
            timestamp: '2026-10-01T00:00:00Z',
            content_urls: { desktop: { page: 'https://id.wikipedia.org/wiki/Kalimantan_Timur' } },
          },
        };
      }
      return { status: 500 };
    });

    const response = await searchWeb('Kalimantan Timur', 4);

    expect(response.provider).toBe('wikipedia');
    expect(response.results[0].snippet).toContain('provinsi di Indonesia');
    expect(response.results[0].url).toContain('wikipedia.org');
  });

  it('reports that nothing was found when every tier fails', async () => {
    mockFetch(() => ({ status: 500 }));

    const response = await searchWeb('gubernur kaltim', 4);

    expect(response.results).toEqual([]);
    expect(response.provider).toBe('none');
    expect(response.summary).toContain('No live search results found');
    expect(response.errors?.length).toBeGreaterThan(0);
  });

  it('stops the chain of tiers when the time budget is exhausted', async () => {
    process.env.WEB_SEARCH_BUDGET_MS = '0';

    const fetchMock = mockFetch((url) => {
      if (url.includes('api.duckduckgo.com')) {
        return {
          json: {
            AbstractText: 'Jawaban instan.',
            Heading: 'Instan',
            AbstractURL: 'https://duckduckgo.com/instan',
          },
        };
      }
      return { status: 500 };
    });

    const response = await searchWeb('gubernur kaltim', 4);

    // Only the cheap last resort ran, the scraping tiers were skipped.
    expect(response.provider).toBe('duckduckgo-instant-answer');
    expect(response.results[0].snippet).toBe('Jawaban instan.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.errors?.join(' ')).toContain('budget');
  });

  it('does not search without a query', async () => {
    const fetchMock = mockFetch(() => ({ text: '' }));

    const response = await searchWeb('   ', 4);

    expect(response.results).toEqual([]);
    expect(response.summary).toContain('No search query provided');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
