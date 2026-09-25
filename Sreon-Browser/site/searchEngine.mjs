// searchEngine.mjs
// Replaces the missing Rust "sreon-api" engine. No API key required.
// Queries DuckDuckGo's HTML endpoint server-side (avoids CORS/JS-rendering
// problems a browser would hit) and returns results in the same shape the
// existing frontend (site.js) already expects from /api/search.
//
// This is a real network call to a real search source on every request —
// nothing here is hard-coded or faked. If DuckDuckGo is briefly unreachable,
// callers get SOURCE_UNAVAILABLE and should retry, same as before.

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).trim();
}

// DuckDuckGo's HTML endpoint wraps outbound links in a redirect like
// //duckduckgo.com/l/?uddg=<encoded-real-url>&rut=... — unwrap it so the
// frontend links straight to the real site (youtube.com, etc.).
function resolveRealUrl(href) {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    if (url.hostname.endsWith('duckduckgo.com') && url.pathname === '/l/') {
      const real = url.searchParams.get('uddg');
      if (real) return decodeURIComponent(real);
    }
    return url.href;
  } catch {
    return href;
  }
}

// DuckDuckGo's exact div nesting shifts between markup revisions, so instead
// of matching a whole result "block" (fragile against nested </div>s), match
// each titled result__a link and each result__snippet independently, in
// document order, and pair the Nth link with the Nth snippet. This survives
// nesting/attribute changes as long as the two class names stay in sync,
// which is the stable part of DDG's HTML endpoint.
function parseResults(html) {
  const links = [];
  const linkRegex = /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const url = resolveRealUrl(linkMatch[1]);
    const title = stripTags(linkMatch[2]);
    if (title && /^https?:\/\//.test(url)) links.push({ title, url });
  }

  const snippets = [];
  const snippetRegex = /<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(snippetMatch[1]));
  }

  return links.map((link, index) => ({
    title: link.title,
    url: link.url,
    snippet: snippets[index] ?? '',
  }));
}

export class SearchEngine {
  constructor() {
    this.failure = false;
  }

  // Signature matches what server.mjs already calls:
  // engine().search(query, 'web', cursor)
  async search(query, category, cursor) {
    const trimmed = (query ?? '').trim();
    if (!trimmed) {
      const error = new Error('Query is required');
      error.code = 'INVALID_QUERY';
      error.status = 400;
      throw error;
    }
    if (category !== 'web') {
      const error = new Error('Only the web category is supported');
      error.code = 'INVALID_QUERY';
      error.status = 400;
      throw error;
    }

    const params = new URLSearchParams({ q: trimmed });
    // DuckDuckGo's HTML endpoint paginates with an opaque "s" + "dc" style
    // offset. We use a simple numeric offset encoded as the cursor.
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    if (offset > 0) params.set('s', String(offset));

    let response;
    try {
      response = await fetch(`${ENDPOINT}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (cause) {
      this.failure = true;
      const error = new Error('Could not reach the search source');
      error.code = 'SOURCE_UNAVAILABLE';
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`Search source returned ${response.status}`);
      error.code = 'SOURCE_UNAVAILABLE';
      throw error;
    }

    const html = await response.text();
    const results = parseResults(html);
    const nextOffset = offset + results.length;
    const hasMore = results.length >= 20; // DuckDuckGo returns ~20-30/page when more exist

    return {
      results,
      cursor: hasMore ? String(nextOffset) : null,
    };
  }

  close() {
    // No persistent process/connection to tear down.
  }
}
