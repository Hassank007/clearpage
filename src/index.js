/**
 * Clearpage Rovo actions.
 *
 * Rovo (the AI agent) calls these functions as tools. Each one gets a payload with the
 * inputs Rovo filled in, plus a `context` object that says which Confluence page the
 * user has open. We read the page as the user (asUser), so Clearpage can only see pages
 * the user is allowed to see.
 */
import { fetchPage, savePage } from './pages.js';
import { checkPage, summary } from './checks.js';
import { applyFix } from './fixes.js';

// How many findings to hand back to Rovo, so the reply stays readable.
const MAX_BARRIERS = 25;
const MAX_ADVICE = 8;

/**
 * Works out which page to check: an explicit page ID or URL from the chat first,
 * otherwise the page the user is looking at.
 */
export function resolveTarget(payload) {
  const raw = String(payload?.page ?? '').trim();
  const fromUrl = raw.match(/\/(pages|blogposts)\/(\d+)/);
  if (fromUrl) return { kind: fromUrl[1] === 'blogposts' ? 'blogposts' : 'pages', id: fromUrl[2] };
  // Blog post links look like /wiki/spaces/KEY/blog/2026/11/20/555/Title
  const blog = raw.match(/\/blog\/\d{4}\/\d{1,2}\/\d{1,2}\/(\d+)/);
  if (blog) return { kind: 'blogposts', id: blog[1] };
  if (/^\d+$/.test(raw)) return { kind: 'pages', id: raw };

  const confluence = payload?.context?.confluence;
  if (confluence?.contentId) {
    return { kind: confluence.resourceType === 'blogpost' ? 'blogposts' : 'pages', id: String(confluence.contentId) };
  }
  return null;
}

/**
 * Action: check-page.
 * Returns the plain summary, the score and every barrier with its WCAG reference,
 * location and fix, as JSON for Rovo to explain in its own words.
 */
export async function checkPageAction(payload) {
  const target = resolveTarget(payload);
  if (!target) {
    return JSON.stringify({ error: 'No page to check. Open a Confluence page first, or paste a page link.' });
  }
  const page = await fetchPage(target);
  if (page.error) return JSON.stringify({ error: page.error });

  const result = checkPage(page.doc);
  console.log(`checked ${target.kind}/${target.id}: ${result.barriers.length} barriers, score ${result.score}`);
  return JSON.stringify({
    page: page.title,
    summary: summary(result),
    score: result.score,
    reading: result.reading,
    stats: result.stats,
    barriers: result.barriers.slice(0, MAX_BARRIERS),
    moreBarriers: Math.max(0, result.barriers.length - MAX_BARRIERS),
    advice: result.advice.slice(0, MAX_ADVICE),
  });
}

/**
 * Action: fix-page.
 * Makes one exact, confirmed edit and saves it as a new page version.
 * Rovo asks the user to confirm before this runs, because it changes the page.
 * Returns what changed and the score before and after.
 */
export async function fixPageAction(payload) {
  const target = resolveTarget(payload);
  if (!target) return JSON.stringify({ error: 'No page to fix. Open a Confluence page first, or paste a page link.' });

  const page = await fetchPage(target);
  if (page.error) return JSON.stringify({ error: page.error });

  const before = checkPage(page.doc);
  const fixType = String(payload?.fixType ?? '').trim();
  const isImage = fixType === 'image-alt';
  const { doc, changes } = applyFix(page.doc, {
    fixType,
    target: isImage ? payload?.imageId : payload?.oldLinkText,
    value: isImage ? payload?.altText : payload?.newLinkText,
    href: payload?.href || undefined,
  });
  if (changes.length === 0) {
    // A common model slip is swapping the old and new link text. Say so plainly, change nothing.
    const swapped = fixType === 'link-text'
      && applyFix(page.doc, { fixType, target: payload?.newLinkText, value: payload?.oldLinkText }).changes.length > 0;
    return JSON.stringify({
      changed: false,
      message: swapped
        ? 'Nothing changed: the old and new link text look swapped. oldLinkText must be the words on the page now.'
        : 'Nothing on the page matched that fix, so I did not change anything.',
    });
  }

  const saved = await savePage(target, page, doc);
  if (saved.error) return JSON.stringify({ changed: false, error: saved.error });

  const after = checkPage(doc);
  console.log(`fixed ${target.kind}/${target.id}: ${changes.length} changes, score ${before.score} -> ${after.score}`);
  return JSON.stringify({
    changed: true,
    changes,
    scoreBefore: before.score,
    scoreAfter: after.score,
    summaryAfter: summary(after),
    undo: 'Every fix is saved as a new page version. To undo it, open Page history and restore the previous version.',
  });
}

// Score badge under each page title.
export { bylineProps, bylineResolver } from './byline.js';

// Space accessibility report and Jira issues.
export { spaceResolver } from './space.js';
