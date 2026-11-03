/**
 * Read the newest incident status from the DeepSeek status RSS feed.
 *
 * The feed is served without any CORS header, so the browser cannot read it
 * directly. The Host half registers {@link FEED_PATH} and this module turns the
 * feed XML into the single status word the sidebar glyph needs.
 */

/** Public RSS feed of status updates. */
export const FEED_URL = 'https://status.deepseek.com/feed.rss';

/** Exact Host fetch route, served inside Connection's authentication fence. */
export const FEED_PATH = '/api/status-sidebar.feed';

/** Browser-relative form of {@link FEED_PATH}; the document base is the app root. */
export const FEED_ROUTE = FEED_PATH.slice(1);

/** First `<item>` of the channel: the feed is newest-first. */
const FIRST_ITEM = /<item\b[^>]*>([\s\S]*?)<\/item>/i;

/** The item's escaped HTML description. */
const DESCRIPTION = /<description>([\s\S]*?)<\/description>/i;

/**
 * `<p><strong>Status:</strong> resolved</p>`, after entity decoding. The space
 * after `</strong>` is part of the feed text, so the capture starts after it.
 */
const STATUS = /<p[^>]*>\s*<strong[^>]*>\s*Status:\s*<\/strong>\s+([A-Za-z][A-Za-z-]*)/i;

/**
 * Decode the XML character references an RSS description may use.
 * `&amp;` is decoded last so escaped markup is not decoded twice.
 * @param {string} text - description text with XML references.
 * @returns {string} decoded markup.
 */
export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Render one numeric reference, or nothing when it is out of range.
 * @param {number} codePoint - decoded code point.
 * @returns {string} the character.
 */
function fromCodePoint(codePoint) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : '';
}

/**
 * Extract the newest incident's `Status:` value.
 * @param {string} xml - complete RSS document.
 * @returns {string | null} lowercase status, or null when no item or no status is readable.
 */
export function latestStatus(xml) {
  const item = FIRST_ITEM.exec(xml)?.[1];
  if (item === undefined) return null;
  const description = DESCRIPTION.exec(item)?.[1];
  if (description === undefined) return null;
  const status = STATUS.exec(decodeEntities(description))?.[1];
  return status === undefined ? null : status.toLowerCase();
}
