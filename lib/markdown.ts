// Minimal inline-markdown renderer used by both the send route and the
// preview UI so what the user sees matches what recipients get.
//
// Supports: **bold**, __bold__, *italic*, _italic_, ~~strike~~, `code`,
// auto-linking of bare http(s) URLs, and newlines as <br/>. Raw HTML
// in the input is escaped first, so the patterns operate on a
// XSS-safe baseline.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BOUNDARY_BEFORE = "(^|[\\s({\\[\"'])";
const BOUNDARY_AFTER = "(?=[\\s)\\]}.,!?:;\"']|$)";

export function renderBody(body: string): string {
  let s = escapeHtml(body ?? "");

  // Inline code first so its content is not further processed.
  s = s.replace(/`([^`\n]+?)`/g, '<code style="background:#f4f4f5;padding:1px 4px;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:0.92em">$1</code>');

  // Bold before italic so '**' is consumed before single '*'.
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_\n]+?)__/g, "<strong>$1</strong>");

  // Italic — require a non-word boundary on both sides so things like
  // file_name_with_underscores stay intact.
  s = s.replace(
    new RegExp(`${BOUNDARY_BEFORE}\\*([^*\\n]+?)\\*${BOUNDARY_AFTER}`, "g"),
    "$1<em>$2</em>",
  );
  s = s.replace(
    new RegExp(`${BOUNDARY_BEFORE}_([^_\\n]+?)_${BOUNDARY_AFTER}`, "g"),
    "$1<em>$2</em>",
  );

  // Strikethrough.
  s = s.replace(/~~([^~\n]+?)~~/g, "<s>$1</s>");

  // Auto-link bare URLs (don't double-link those already inside an
  // anchor — we don't emit any anchors before this step, so it's
  // safe).
  s = s.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#06c;text-decoration:underline">$1</a>',
  );

  // Newlines.
  s = s.replace(/\n/g, "<br/>");

  return s;
}
