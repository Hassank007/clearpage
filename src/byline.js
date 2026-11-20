/**
 * Backend for the score badge under each page title (confluence:contentBylineItem).
 *
 * - bylineProps runs when a page opens and sets the badge text, e.g. "Accessibility 80/100".
 * - The resolver serves the panel that opens when the badge is clicked: the full report,
 *   and a one-click structural fix (clicking the button is the user's confirmation).
 *
 * Pages are read and saved as the current user, so the badge never shows anything the
 * viewer could not already see, and only people who can edit the page can fix it.
 */
import Resolver from '@forge/resolver';
import { checkPage, summary } from './checks.js';
import { fixStructure } from './fixes.js';
import { fetchPage, savePage } from './pages.js';

// Barriers the one-click structural fix can remove without any new words.
const STRUCTURAL = new Set(['heading-skip', 'fake-heading', 'fake-list', 'table-no-header']);

const targetOf = (content) => (content?.id ? { kind: content.type === 'blogpost' ? 'blogposts' : 'pages', id: String(content.id) } : null);

/** Badge text from a check result. Kept short: it sits next to the author's name. */
export function badge(result) {
  const n = result.barriers.length;
  return {
    title: n === 0 ? 'Accessible ✓' : `Accessibility ${result.score}/100`,
    tooltip: n === 0 ? 'Clearpage found no accessibility barriers on this page.' : `${summary(result)} Click for details and fixes.`,
  };
}

/** The panel's report: summary, score, and barriers in plain words, grouped by section. */
export function report(title, result) {
  const sections = [];
  for (const b of result.barriers) {
    let s = sections.find((x) => x.where === b.where);
    if (!s) sections.push((s = { where: b.where, items: [] }));
    s.items.push({ rule: b.rule, severity: b.severity, wcag: b.wcag, text: b.text, fix: b.fix });
  }
  return {
    title,
    score: result.score,
    summary: summary(result),
    reading: result.reading,
    sections,
    advice: result.advice.slice(0, 6).map((a) => ({ text: a.text, fix: a.fix })),
    structuralCount: result.barriers.filter((b) => STRUCTURAL.has(b.rule)).length,
    needsWordsCount: result.barriers.filter((b) => !STRUCTURAL.has(b.rule)).length,
  };
}

/** dynamicProperties handler: sets the badge title and tooltip when the page opens. */
export async function bylineProps(payload) {
  try {
    const target = targetOf(payload?.extension?.content);
    if (!target) return { title: 'Accessibility check' };
    const page = await fetchPage(target);
    if (page.error) return { title: 'Accessibility check' };
    return badge(checkPage(page.doc));
  } catch (e) {
    console.error('byline props failed', e);
    return { title: 'Accessibility check' };
  }
}

const resolver = new Resolver();

resolver.define('getReport', async ({ context }) => {
  const target = targetOf(context?.extension?.content);
  if (!target) return { error: 'Open a page to check it.' };
  const page = await fetchPage(target);
  if (page.error) return { error: page.error };
  return report(page.title, checkPage(page.doc));
});

resolver.define('fixStructure', async ({ context }) => {
  const target = targetOf(context?.extension?.content);
  if (!target) return { error: 'Open a page to fix it.' };
  const page = await fetchPage(target);
  if (page.error) return { error: page.error };
  const before = checkPage(page.doc);
  const { doc, changes } = fixStructure(page.doc);
  if (changes.length === 0) return { changes: [], message: 'Nothing to fix: the headings, lists and tables are already fine.' };
  const saved = await savePage(target, page, doc);
  if (saved.error) return { error: saved.error };
  const after = checkPage(doc);
  return { changes, scoreBefore: before.score, ...report(page.title, after) };
});

export const bylineResolver = resolver.getDefinitions();
