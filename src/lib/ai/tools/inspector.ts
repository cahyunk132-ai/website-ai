/**
 * Hyunk AI Hub - Page Inspector (server side only)
 *
 * Extracts the metadata and the content signals of a page: titles, meta tags,
 * Open Graph / Twitter cards, heading structure, images without an alt
 * attribute, link statistics, word count and the timing of the response.
 *
 * Useful for SEO reviews, accessibility checks and for the agent that has to
 * describe a page without downloading it entirely.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 HyunkAIHub-PageInspector/1.0';

const MAX_BODY_BYTES = 768 * 1024;
const REQUEST_TIMEOUT_MS = 10000;

export interface PageInspection {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  contentType: string;
  contentLength?: string;
  compressed: boolean;
  meta: {
    title?: string;
    description?: string;
    keywords?: string;
    canonical?: string;
    robots?: string;
    viewport?: string;
    charset?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogType?: string;
    twitterCard?: string;
    author?: string;
    lang?: string;
  };
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    counts: Record<string, number>;
  };
  images: { total: number; withoutAlt: number; lazy: number; sampleWithoutAlt: string[] };
  links: { total: number; internal: number; external: number; nofollow: number; withoutText: number };
  words: number;
  scripts: number;
  stylesheets: number;
  forms: number;
  issues: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'; message: string }>;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function metaContent(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return decodeEntities(match[1]).trim();
  }

  return undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(tag);
  return match ? decodeEntities(match[1]).trim() : undefined;
}

/**
 * Reads a page and returns its structured inspection report.
 */
export async function inspectPage(
  rawUrl: string,
  assertSafeUrl: (url: string) => URL
): Promise<PageInspection> {
  const started = Date.now();
  const issues: PageInspection['issues'] = [];

  const parsed = assertSafeUrl(rawUrl);

  const response = await fetch(parsed.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const contentType = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let received = 0;

  if (reader) {
    while (received < MAX_BODY_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  const finalUrl = response.url || parsed.toString();
  const isHtml = contentType.includes('text/html') || /<html/i.test(html.slice(0, 2000));

  const headings: PageInspection['headings'] = { h1: [], h2: [], h3: [], counts: {} };

  if (isHtml) {
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const matches = html.match(new RegExp(`<${level}[^>]*>([\\s\\S]*?)</${level}>`, 'gi')) || [];
      headings.counts[level] = matches.length;
      const texts = matches.map((m) => stripTags(m.replace(new RegExp(`^<${level}[^>]*>|</${level}>$`, 'gi'), '')));
      if (level === 'h1') headings.h1 = texts;
      if (level === 'h2') headings.h2 = texts;
      if (level === 'h3') headings.h3 = texts;
    }
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const withoutAlt: string[] = [];
  let lazy = 0;
  for (const tag of imgTags) {
    if (attribute(tag, 'alt') === undefined) {
      const src = attribute(tag, 'src');
      if (src) withoutAlt.push(src.slice(0, 120));
    }
    if (/loading=["']lazy["']/i.test(tag)) lazy += 1;
  }

  const linkTags = html.match(/<a\b[^>]*>/gi) || [];
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let withoutText = 0;
  for (const tag of linkTags) {
    const href = attribute(tag, 'href') || '';
    if (/^https?:\/\//i.test(href)) {
      try {
        if (new URL(href).hostname === parsed.hostname) internal += 1;
        else external += 1;
      } catch {
        external += 1;
      }
    } else if (href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) {
      internal += 1;
    }
    if (/rel=["'][^"']*nofollow/i.test(tag)) nofollow += 1;
    const match = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(html.slice(html.indexOf(tag), html.indexOf(tag) + 4000));
    if (match && !stripTags(match[2])) withoutText += 1;
  }

  const text = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const meta: PageInspection['meta'] = {
    title: metaContent(html, 'title') || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : undefined),
    description: metaContent(html, 'description'),
    keywords: metaContent(html, 'keywords'),
    canonical: (() => {
      const match = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html);
      if (match) return decodeEntities(match[1]);
      const alt = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(html);
      return alt ? decodeEntities(alt[1]) : undefined;
    })(),
    robots: metaContent(html, 'robots'),
    viewport: metaContent(html, 'viewport'),
    charset: /<meta[^>]+charset=["']?([^"'\s>]+)/i.exec(html)?.[1],
    ogTitle: metaContent(html, 'og:title'),
    ogDescription: metaContent(html, 'og:description'),
    ogImage: metaContent(html, 'og:image'),
    ogType: metaContent(html, 'og:type'),
    twitterCard: metaContent(html, 'twitter:card'),
    author: metaContent(html, 'author'),
    lang: /<html[^>]+lang=["']([^"']+)["']/i.exec(html)?.[1],
  };

  if (!meta.title) {
    issues.push({ severity: 'HIGH', message: 'The page has no <title> element.' });
  } else if (meta.title.length > 60) {
    issues.push({
      severity: 'MEDIUM',
      message: `The title is ${meta.title.length} characters long, search engines truncate it after 60.`,
    });
  }

  if (!meta.description) {
    issues.push({ severity: 'MEDIUM', message: 'The page has no meta description.' });
  }

  if (headings.counts.h1 === 0) {
    issues.push({ severity: 'MEDIUM', message: 'The page has no H1 heading.' });
  } else if (headings.counts.h1 > 1) {
    issues.push({
      severity: 'LOW',
      message: `The page has ${headings.counts.h1} H1 headings, one is recommended.`,
    });
  }

  if (withoutAlt.length) {
    issues.push({
      severity: 'MEDIUM',
      message: `${withoutAlt.length} image(s) have no alt attribute (accessibility and SEO).`,
    });
  }

  if (!meta.viewport) {
    issues.push({
      severity: 'MEDIUM',
      message: 'The page has no viewport meta tag, it will not be responsive on mobile.',
    });
  }

  if (!meta.canonical) {
    issues.push({ severity: 'LOW', message: 'The page has no canonical link.' });
  }

  if (!meta.ogTitle) {
    issues.push({
      severity: 'INFO',
      message: 'The page has no Open Graph title, it will look plain when shared on social media.',
    });
  }

  const contentEncoding = response.headers.get('content-encoding');
  const compressed = Boolean(contentEncoding && contentEncoding !== 'identity');

  return {
    url: parsed.toString(),
    finalUrl,
    status: response.status,
    statusText: response.statusText,
    responseTimeMs: Date.now() - started,
    contentType,
    contentLength: response.headers.get('content-length') || undefined,
    compressed,
    meta,
    headings,
    images: {
      total: imgTags.length,
      withoutAlt: withoutAlt.length,
      lazy,
      sampleWithoutAlt: withoutAlt.slice(0, 10),
    },
    links: {
      total: linkTags.length,
      internal,
      external,
      nofollow,
      withoutText,
    },
    words,
    scripts: (html.match(/<script\b/gi) || []).length,
    stylesheets: (html.match(/<link[^>]+rel=["']stylesheet["']/gi) || []).length,
    forms: (html.match(/<form\b/gi) || []).length,
    issues,
  };
}
