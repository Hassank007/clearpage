/**
 * Clearpage accessibility checks for Confluence pages.
 *
 * Every check here is a plain, deterministic rule over the page body in
 * Atlassian Document Format (ADF), the JSON tree Confluence stores pages in.
 * No AI is used here: the same page always gives the same result, so the
 * score can be trusted and tested. Rovo (the AI) only writes suggested fixes
 * on top of these findings.
 *
 * ADF reference: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */

// Link texts that do not say where the link goes (WCAG 2.4.4 Link Purpose).
export const VAGUE_LINKS = new Set([
  'click here', 'here', 'click', 'read more', 'more', 'link', 'this', 'this link',
  'learn more', 'details', 'more details', 'go', 'info', 'more info', 'see more',
  'see here', 'click this', 'download', 'page', 'website', 'continue',
]);

// Image alt text that is really a file name, e.g. "IMG_2041.jpg".
const FILE_NAME = /\.(png|jpe?g|gif|svg|webp|bmp|tiff?)$/i;

// Paragraphs that are pretending to be list items: "- item", "• item", "1. item", "a) item".
export const FAKE_LIST_ITEM = /^\s*([-*•▪◦]|\d{1,2}[.)]|[a-z][.)])\s+\S/i;

// A sentence longer than this many words is hard to follow (WCAG 3.1.5 advice).
const LONG_SENTENCE_WORDS = 30;

/** Joins the text of a node and all its children. */
export function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  if (node.type === 'mention') return node.attrs?.text ?? '';
  if (node.type === 'emoji') return node.attrs?.text ?? '';
  if (node.type === 'inlineCard') return node.attrs?.url ?? '';
  return (node.content ?? []).map(textOf).join('');
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean);
const clip = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const normalise = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Walks the ADF tree in reading order and calls visit(node, ancestors) for each node.
 * ancestors[0] is the document, the last item is the direct parent.
 */
function walk(node, visit, ancestors = []) {
  visit(node, ancestors);
  for (const child of node.content ?? []) walk(child, visit, [...ancestors, node]);
}

/** Groups neighbouring text nodes that share one link into a single link. */
function linksIn(block) {
  const links = [];
  let current = null;
  for (const child of block.content ?? []) {
    const href = child.type === 'text' ? child.marks?.find((m) => m.type === 'link')?.attrs?.href : null;
    if (href && current && current.href === href) {
      current.text += child.text;
    } else if (href) {
      current = { href, text: child.text };
      links.push(current);
    } else {
      current = null;
    }
  }
  return links;
}

/** Number of syllables in an English word (a close-enough estimate for readability scores). */
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * Flesch reading ease (0 to 100, higher is easier). 60+ is plain English.
 * Returns null for pages with too little text to score fairly.
 */
export function readingEase(text) {
  const sentences = text.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const all = words(text).filter((w) => /[a-z]/i.test(w));
  if (all.length < 40 || sentences.length === 0) return null;
  const syl = all.reduce((n, w) => n + syllables(w), 0);
  const score = 206.835 - 1.015 * (all.length / sentences.length) - 84.6 * (syl / all.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Plain-words label for a reading ease score. */
export function readingLabel(score) {
  if (score === null) return 'not enough text to score';
  if (score >= 70) return 'easy to read';
  if (score >= 60) return 'plain English';
  if (score >= 50) return 'fairly hard to read';
  if (score >= 30) return 'hard to read';
  return 'very hard to read';
}

/**
 * Checks one page body (an ADF document) and returns every barrier found.
 *
 * Each barrier says: which rule, which WCAG success criterion, how serious it is,
 * where it is (the nearest heading above it), what the text is, and how to fix it.
 * "advice" items are worth fixing but are not WCAG AA failures.
 */
export function checkPage(doc) {
  const barriers = [];
  const advice = [];
  const stats = { images: 0, links: 0, headings: 0, tables: 0, words: 0 };
  const prose = [];

  let section = 'top of the page'; // nearest heading above the current node
  let lastLevel = 1; // the page title is the h1, so body headings should start at h2
  let fakeListRun = [];

  const add = (list, item) => list.push({ where: section, ...item });

  const flushFakeList = () => {
    if (fakeListRun.length >= 2) {
      add(barriers, {
        rule: 'fake-list',
        wcag: '1.3.1 Info and Relationships',
        severity: 'moderate',
        text: clip(fakeListRun.map((t) => t.trim()).join(' / ')),
        fix: `Turn these ${fakeListRun.length} lines into a real bulleted or numbered list, so screen readers announce "list, ${fakeListRun.length} items".`,
      });
    }
    fakeListRun = [];
  };

  walk(doc, (node, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    // Fake-list runs only count consecutive top-level paragraphs.
    if (parent?.type === 'doc' && !(node.type === 'paragraph' && FAKE_LIST_ITEM.test(textOf(node)))) flushFakeList();

    switch (node.type) {
      case 'heading': {
        const level = node.attrs?.level ?? 2;
        const text = textOf(node).trim();
        stats.headings += 1;
        if (!text) {
          add(barriers, {
            rule: 'empty-heading', wcag: '2.4.6 Headings and Labels', severity: 'moderate', text: `(empty heading ${level})`,
            fix: 'Delete the empty heading, or type a heading that describes the section below it.',
          });
        } else if (level > lastLevel + 1) {
          add(barriers, {
            rule: 'heading-skip', wcag: '1.3.1 Info and Relationships', severity: 'moderate', text: clip(text),
            fix: `This heading jumps from level ${lastLevel} to level ${level}. Change it to Heading ${lastLevel + 1} so the page outline has no gaps.`,
          });
        }
        if (level === 1) {
          add(advice, {
            rule: 'extra-h1', wcag: '1.3.1 Info and Relationships', severity: 'minor', text: clip(text),
            fix: 'The page title is already the main heading. Use Heading 2 for sections inside the page.',
          });
        }
        if (text) section = clip(text, 60);
        lastLevel = level;
        break;
      }

      case 'paragraph': {
        const text = textOf(node);
        prose.push(text);
        // Bold-only short paragraph followed by more content = a heading in disguise.
        const parts = (node.content ?? []).filter((c) => !(c.type === 'text' && !c.text.trim()));
        const allBold = parts.length > 0 && parts.every((c) => c.type === 'text' && c.marks?.some((m) => m.type === 'strong'));
        const n = words(text).length;
        if (allBold && n > 0 && n <= 8 && !/[.!?:,;]$/.test(text.trim()) && parent?.type === 'doc') {
          add(barriers, {
            rule: 'fake-heading', wcag: '1.3.1 Info and Relationships', severity: 'moderate', text: clip(text.trim()),
            fix: 'This bold line looks like a heading but is plain text, so screen reader users cannot jump to it. Make it a real heading.',
          });
        }
        if (parent?.type === 'doc' && FAKE_LIST_ITEM.test(text)) {
          // Bullets and numbers are separate lists, so a change of kind starts a new run.
          const numbered = (s) => /^\s*(\d{1,2}|[a-z])[.)]/i.test(s);
          if (fakeListRun.length && numbered(fakeListRun[0]) !== numbered(text)) flushFakeList();
          fakeListRun.push(text);
        }

        for (const link of linksIn(node)) {
          stats.links += 1;
          const label = normalise(link.text);
          if (VAGUE_LINKS.has(label)) {
            add(barriers, {
              rule: 'vague-link', wcag: '2.4.4 Link Purpose (In Context)', severity: 'serious', text: link.text.trim(), href: link.href,
              context: clip(text.trim(), 200),
              fix: 'Change the link text to say where it goes, for example "Download the 2026 leave policy (PDF)".',
            });
          } else if (/^(https?:\/\/|www\.)\S+$/i.test(link.text.trim()) && link.text.trim().length > 30) {
            add(barriers, {
              rule: 'bare-url', wcag: '2.4.4 Link Purpose (In Context)', severity: 'moderate', text: clip(link.text.trim()), href: link.href,
              context: clip(text.trim(), 200),
              fix: 'A screen reader reads this whole web address out loud. Replace it with words that say what the page is.',
            });
          }
        }

        // Underlined text that is not a link looks clickable.
        for (const c of node.content ?? []) {
          const marks = c.marks ?? [];
          if (c.type === 'text' && marks.some((m) => m.type === 'underline') && !marks.some((m) => m.type === 'link') && words(c.text).length > 0) {
            add(advice, {
              rule: 'underline-not-link', wcag: '3.2.4 Consistent Identification', severity: 'minor', text: clip(c.text.trim()),
              fix: 'Underlined text looks like a link. Use bold for emphasis instead.',
            });
          }
        }

        // Long runs of capital letters are harder to read and some screen readers spell them out.
        const caps = text.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,}){4,}\b/);
        if (caps) {
          add(advice, {
            rule: 'all-caps', wcag: '3.1.5 Reading Level (advice)', severity: 'minor', text: clip(caps[0]),
            fix: 'Write this in normal sentence case. Use bold if it needs to stand out.',
          });
        }
        break;
      }

      case 'media': {
        // External images and files (not images) are skipped: only images need alt text.
        if (node.attrs?.type === 'link' && !node.attrs?.alt) break;
        stats.images += 1;
        const alt = (node.attrs?.alt ?? '').trim();
        if (!alt) {
          add(barriers, {
            rule: 'image-alt', wcag: '1.1.1 Non-text Content', severity: 'serious', text: '(image with no alt text)',
            mediaId: node.attrs?.id,
            fix: 'Add alt text that says what the image shows or why it is there. If it is only decoration, say so in the alt text: "Decorative".',
          });
        } else if (FILE_NAME.test(alt) || /^(image|img|photo|picture|screenshot)[\s_-]*\d*$/i.test(alt)) {
          add(barriers, {
            rule: 'image-alt-filename', wcag: '1.1.1 Non-text Content', severity: 'serious', text: alt,
            mediaId: node.attrs?.id,
            fix: 'The alt text is a file name, so a screen reader reads out something like "IMG underscore 2041 dot jpg". Describe the image instead.',
          });
        }
        break;
      }

      case 'table': {
        stats.tables += 1;
        const firstRow = node.content?.[0];
        const hasHeader = firstRow?.content?.some((cell) => cell.type === 'tableHeader')
          || node.content?.some((row) => row.content?.[0]?.type === 'tableHeader');
        if (!hasHeader) {
          add(barriers, {
            rule: 'table-no-header', wcag: '1.3.1 Info and Relationships', severity: 'serious',
            text: clip(textOf(firstRow ?? {}).trim() || '(table)'),
            fix: 'Turn on "Header row" for this table, so a screen reader says the column name with each cell.',
          });
        }
        break;
      }

      default:
        break;
    }
  });
  flushFakeList();

  // Readability over the page's paragraphs.
  const text = prose.join(' ');
  stats.words = words(text).length;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const n = words(sentence).length;
    if (n > LONG_SENTENCE_WORDS) {
      advice.push({
        where: 'page text', rule: 'long-sentence', wcag: '3.1.5 Reading Level (advice)', severity: 'minor', text: clip(sentence.trim(), 120),
        fix: `This sentence has ${n} words. Split it into two or three shorter sentences.`,
      });
    }
  }
  const ease = readingEase(text);

  return { barriers, advice, stats, reading: { ease, label: readingLabel(ease) }, score: score(barriers, advice) };
}

/** 0 to 100. Serious barriers cost the most; advice costs a little. */
export function score(barriers, advice = []) {
  const cost = { serious: 12, moderate: 6, minor: 2 };
  const lost = barriers.reduce((n, b) => n + (cost[b.severity] ?? 6), 0) + advice.reduce((n, a) => n + (a.severity === 'minor' ? 1 : 2), 0);
  return Math.max(0, 100 - lost);
}

const RULE_WORDS = {
  'image-alt': ['image with no description', 'images with no description'],
  'image-alt-filename': ['image described only by its file name', 'images described only by their file names'],
  'vague-link': ['link that does not say where it goes', 'links that do not say where they go'],
  'bare-url': ['link that is a long web address', 'links that are long web addresses'],
  'heading-skip': ['heading that skips a level', 'headings that skip a level'],
  'empty-heading': ['empty heading', 'empty headings'],
  'fake-heading': ['bold line that should be a heading', 'bold lines that should be headings'],
  'fake-list': ['list typed by hand instead of a real list', 'lists typed by hand instead of real lists'],
  'table-no-header': ['table with no header row', 'tables with no header row'],
};

/** One or two plain sentences a non-expert can act on. */
export function summary(result) {
  const { barriers, reading } = result;
  if (barriers.length === 0) {
    return `No accessibility barriers found on this page. Score ${result.score}/100. Reading level: ${reading.label}.`;
  }
  const counts = {};
  for (const b of barriers) counts[b.rule] = (counts[b.rule] ?? 0) + 1;
  const parts = Object.entries(counts).map(([rule, n]) => {
    const [one, many] = RULE_WORDS[rule] ?? [rule, rule];
    return `${n} ${n === 1 ? one : many}`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const n = barriers.length;
  return `This page has ${n} accessibility ${n === 1 ? 'barrier' : 'barriers'}: ${list}. Score ${result.score}/100. Reading level: ${reading.label}.`;
}
