/**
 * Clearpage fixes: small, exact edits to a page body (ADF).
 *
 * Every function here takes a document and returns { doc, changes } where
 * `doc` is a NEW document (the input is never modified) and `changes` is a list
 * of plain sentences saying what was changed. If nothing matched, `changes` is
 * empty and the caller should not save the page.
 *
 * Fixes that need human words (link text, alt text) take the new words as input:
 * Rovo suggests them, the user confirms, then this code makes the exact edit.
 * Structural fixes (headings, tables, lists) need no words and can run together.
 */
import { textOf, normalise, FAKE_LIST_ITEM } from './checks.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const words = (s) => s.trim().split(/\s+/).filter(Boolean);

/** Calls fn(node, parent, index) for every node, depth first, in reading order. */
function each(node, fn, parent = null, index = -1) {
  fn(node, parent, index);
  (node.content ?? []).forEach((child, i) => each(child, fn, node, i));
}

/**
 * Changes the visible text of every link whose current text matches `oldText`
 * (ignoring case and punctuation). The link address and formatting stay the same.
 * Optionally only links pointing at `href`.
 */
export function fixLinkText(input, { oldText, newText, href }) {
  const doc = clone(input);
  const changes = [];
  const target = normalise(oldText ?? '');
  const replacement = (newText ?? '').trim();
  if (!target || !replacement) return { doc, changes };

  each(doc, (node) => {
    const content = node.content;
    if (!content) return;
    for (let i = 0; i < content.length; i++) {
      const linkOf = (n) => (n?.type === 'text' ? n.marks?.find((m) => m.type === 'link')?.attrs?.href : undefined);
      const h = linkOf(content[i]);
      if (!h) continue;
      // A link can be split over several text nodes (for example part of it bold). Group them.
      let j = i;
      while (j + 1 < content.length && linkOf(content[j + 1]) === h) j++;
      const text = content.slice(i, j + 1).map((n) => n.text).join('');
      if (normalise(text) === target && (!href || href === h)) {
        content.splice(i, j - i + 1, { ...content[i], text: replacement });
        changes.push(`Changed link text "${text.trim()}" to "${replacement}".`);
      } else {
        i = j;
      }
    }
  });
  return { doc, changes };
}

/** Sets alt text on one image (by media ID), or on every image with no alt text if mediaId is "all-missing". */
export function fixImageAlt(input, { mediaId, alt }) {
  const doc = clone(input);
  const changes = [];
  const text = (alt ?? '').trim();
  if (!text || !mediaId) return { doc, changes };
  each(doc, (node) => {
    if (node.type !== 'media') return;
    if (node.attrs?.id === mediaId || (mediaId === 'all-missing' && !node.attrs?.alt)) {
      node.attrs = { ...node.attrs, alt: text };
      changes.push(`Added alt text "${text}" to an image.`);
    }
  });
  return { doc, changes };
}

/**
 * Makes heading levels go down one step at a time (2, 3, 4…), never skipping,
 * while keeping the outline's shape: headings that were siblings stay siblings.
 * Each heading becomes one level below its parent (the nearest earlier heading
 * with a smaller original level). The page title counts as level 1.
 */
export function fixHeadingLevels(input) {
  const doc = clone(input);
  const changes = [];
  const stack = []; // [{ orig, level }] of open parent headings
  each(doc, (node) => {
    if (node.type !== 'heading') return;
    const orig = node.attrs?.level ?? 2;
    while (stack.length && stack[stack.length - 1].orig >= orig) stack.pop();
    const parentLevel = stack.length ? stack[stack.length - 1].level : 1;
    const level = orig === 1 ? 1 : Math.min(orig, parentLevel + 1);
    if (level !== orig) {
      node.attrs = { ...node.attrs, level };
      changes.push(`Changed heading "${textOf(node).trim()}" from level ${orig} to level ${level}.`);
    }
    stack.push({ orig, level });
  });
  return { doc, changes };
}

/** Turns on the header row for every table that has neither a header row nor a header column. */
export function fixTableHeaders(input) {
  const doc = clone(input);
  const changes = [];
  each(doc, (node) => {
    if (node.type !== 'table') return;
    const rows = node.content ?? [];
    const hasHeader = rows[0]?.content?.some((c) => c.type === 'tableHeader') || rows.some((r) => r.content?.[0]?.type === 'tableHeader');
    if (hasHeader || !rows[0]) return;
    rows[0].content = rows[0].content.map((c) => (c.type === 'tableCell' ? { ...c, type: 'tableHeader' } : c));
    const headings = rows[0].content.map((c) => textOf(c).trim()).filter(Boolean).join(', ');
    changes.push(`Turned on the header row for the table with the columns "${headings.slice(0, 60)}".`);
  });
  return { doc, changes };
}

/**
 * Turns short, bold-only top-level paragraphs into real headings at the page's
 * main section level (the highest heading level used in the body, usually 2).
 * The author can demote it later; a heading at the wrong level is still far
 * better for screen reader users than no heading at all.
 */
export function fixFakeHeadings(input) {
  const doc = clone(input);
  const changes = [];
  const levels = (doc.content ?? []).filter((n) => n.type === 'heading').map((n) => n.attrs?.level ?? 2);
  const level = Math.max(2, Math.min(6, levels.length ? Math.min(...levels) : 2));
  doc.content = (doc.content ?? []).map((node) => {
    if (node.type !== 'paragraph') return node;
    const parts = (node.content ?? []).filter((c) => !(c.type === 'text' && !c.text.trim()));
    const allBold = parts.length > 0 && parts.every((c) => c.type === 'text' && c.marks?.some((m) => m.type === 'strong'));
    const text = textOf(node).trim();
    const n = words(text).length;
    if (!allBold || n === 0 || n > 8 || /[.!?:,;]$/.test(text)) return node;
    changes.push(`Made "${text}" a level ${level} heading.`);
    return { type: 'heading', attrs: { level }, content: parts.map((c) => ({ ...c, marks: (c.marks ?? []).filter((m) => m.type !== 'strong') })).map((c) => (c.marks.length ? c : { type: 'text', text: c.text })) };
  });
  return { doc, changes };
}

/** Turns runs of two or more hand-typed list lines ("- item", "1. item") into real lists. */
export function fixFakeLists(input) {
  const doc = clone(input);
  const changes = [];
  const out = [];
  const content = doc.content ?? [];
  for (let i = 0; i < content.length; i++) {
    // A run is consecutive typed items of the same kind: all bullets, or all numbered.
    const kind = (n) => (n?.type === 'paragraph' && FAKE_LIST_ITEM.test(textOf(n))
      ? (/^\s*(\d{1,2}|[a-z])[.)]/i.test(textOf(n)) ? 'numbered' : 'bullet') : null);
    const k = kind(content[i]);
    if (!k || kind(content[i + 1]) !== k) { out.push(content[i]); continue; }
    let j = i;
    while (kind(content[j + 1]) === k) j++;
    const run = content.slice(i, j + 1);
    const ordered = k === 'numbered';
    const items = run.map((para) => {
      const inline = clone(para.content ?? []);
      // Remove the typed marker ("- ", "1. ") from the start of the first text node.
      const first = inline.find((c) => c.type === 'text');
      if (first) first.text = first.text.replace(/^\s*([-*•▪◦]|\d{1,2}[.)]|[a-z][.)])\s+/i, '');
      return { type: 'listItem', content: [{ type: 'paragraph', content: inline.filter((c) => c.type !== 'text' || c.text) }] };
    });
    out.push({ type: ordered ? 'orderedList' : 'bulletList', ...(ordered ? { attrs: { order: 1 } } : {}), content: items });
    changes.push(`Turned ${run.length} typed lines into a real ${ordered ? 'numbered' : 'bulleted'} list.`);
    i = j;
  }
  doc.content = out;
  return { doc, changes };
}

/** Runs every structural fix (no words needed): headings, bold headings, lists, table headers. */
export function fixStructure(input) {
  let doc = input;
  const changes = [];
  for (const fix of [fixFakeHeadings, fixHeadingLevels, fixFakeLists, fixTableHeaders]) {
    const r = fix(doc);
    doc = r.doc;
    changes.push(...r.changes);
  }
  return { doc, changes };
}

/** Picks the fix Rovo asked for. Unknown fix types change nothing. */
export function applyFix(doc, { fixType, target, value, href }) {
  switch (fixType) {
    case 'link-text': return fixLinkText(doc, { oldText: target, newText: value, href });
    case 'image-alt': return fixImageAlt(doc, { mediaId: target, alt: value });
    case 'headings': return fixHeadingLevels(doc);
    case 'fake-headings': return fixFakeHeadings(doc);
    case 'lists': return fixFakeLists(doc);
    case 'table-headers': return fixTableHeaders(doc);
    case 'structure': return fixStructure(doc);
    default: return { doc, changes: [] };
  }
}
