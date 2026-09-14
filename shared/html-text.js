// Event and blog bodies are stored as sanitized HTML. Emails and calendar
// feeds are plain text, so both need the same flattening — keep it here so
// the two never drift apart.
const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
};

// One pass over a tag leaves the brackets of an enclosing one behind
// ("<scr<b>ipt>" becomes "<script>"), so keep going until nothing changes.
function stripTags(value) {
  let current = value;
  let previous;
  do {
    previous = current;
    current = current.replace(/<[^>]+>/g, '');
  } while (current !== previous);
  return current;
}

export function htmlToPlainText(html) {
  if (!html) return '';
  const withLineBreaks = String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*(li|h[1-3])\s*>/gi, '\n')
    // A body clipped to a length limit can end mid-tag; drop that remnant
    // before stripping the complete tags.
    .replace(/<[^>]*$/, '');

  return stripTags(withLineBreaks)
    // Decode every entity in a single pass. Decoding &amp; first and &lt;
    // after turned "&amp;lt;" — an author writing the literal text "&lt;" —
    // into "<", unescaping it a second time.
    .replace(/&(nbsp|amp|lt|gt);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Shorten flattened text to a teaser without cutting a word in half.
export function truncatePlainText(text, maxLength) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;

  const clipped = value.slice(0, maxLength);
  const lastBreak = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf('\n'));
  const cut = lastBreak > maxLength * 0.6 ? clipped.slice(0, lastBreak) : clipped;
  return `${cut.trimEnd()}…`;
}
