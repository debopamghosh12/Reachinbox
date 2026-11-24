// Email bodies come from the rich-text editor as HTML. Bodies scheduled before
// that (and API clients like the load test) send plain text. Both formats live
// in the same `body` column. isHtml() tells them apart, so old plain-text rows
// keep working without a schema change.
import sanitizeHtml from "sanitize-html";

// "Contains at least one tag like <p> or </strong>". Plain text such as
// "a < b" doesn't match, because a tag name has to follow the "<" directly.
export function isHtml(body: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(body);
}

// Allowlist sanitizing: anything not listed here is removed. That covers
// <script>, <iframe>, <img>, styles, on* event handlers and javascript: links.
// The list matches what the editor can produce.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "hr"],
  // target/rel are listed so the transform below can set them (user values are overwritten).
  allowedAttributes: { a: ["href", "target", "rel"], "*": ["style"] },
  // The only style kept is text alignment (the editor's align buttons).
  allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  // Links open in a new tab and can't reach back into the page that opened them.
  transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
};

// Plain text passes through untouched: sanitizing it would turn "a < b" into "a &lt; b".
export function sanitizeBody(body: string): string {
  return isHtml(body) ? sanitizeHtml(body, SANITIZE_OPTIONS) : body;
}

// HTML -> readable plain text. Used for the email's text part, the search
// index and list previews, so none of them ever contain tags.
// No library is needed: the input has already been sanitized to the simple
// tags above.
export function htmlToText(body: string): string {
  if (!isHtml(body)) return body;
  const text = body
    // keep link targets visible in the text version: "docs (https://...)"
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) =>
      label === href ? label : `${label} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    // block elements start and end on their own line; "\n\n" (a blank line
    // between paragraphs) comes from one block's end meeting the next one's start
    .replace(/<(p|h[1-6]|blockquote|ul|ol)(\s[^>]*)?>|<\/(p|h[1-6]|li|blockquote|ul|ol)>|<hr\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""); // drop every remaining tag
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// One line of plain text for list rows.
export function toPreview(body: string, maxChars: number): string {
  const line = htmlToText(body).replace(/\s+/g, " ").trim();
  return line.length > maxChars ? `${line.slice(0, maxChars).trimEnd()}…` : line;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" becomes "&lt;" and not "<"
}
