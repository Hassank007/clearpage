/**
 * Space accessibility report and Jira issues.
 *
 * The report checks every current page in a space (up to MAX_PAGES), worst score first,
 * so a space owner can see where to start. For any page, one click creates a Jira issue
 * for the page owner with the barriers and fixes listed. Each issue gets the label
 * `clearpage-page-<pageId>`, so the report knows which pages already have an issue and
 * never creates duplicates.
 *
 * Everything runs as the current user (asUser): people only see pages they can see,
 * and only create issues in projects where they are allowed to.
 */
import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { checkPage, summary } from './checks.js';

const MAX_PAGES = 100;
const PAGE_LABEL = (id) => `clearpage-page-${id}`;

// [one, many] so counts read naturally: "1 unclear link", "2 unclear links".
const RULE_NAMES = {
  'image-alt': ['image with no description', 'images with no description'],
  'image-alt-filename': ['image described by file name', 'images described by file name'],
  'vague-link': ['unclear link', 'unclear links'],
  'bare-url': ['web address as a link', 'web addresses as links'],
  'heading-skip': ['skipped heading level', 'skipped heading levels'],
  'empty-heading': ['empty heading', 'empty headings'],
  'fake-heading': ['bold line as a heading', 'bold lines as headings'],
  'fake-list': ['typed list', 'typed lists'],
  'table-no-header': ['table without headers', 'tables without headers'],
};

/** Short "main problems" text for one page, most common first. */
export function mainProblems(barriers) {
  const counts = {};
  for (const b of barriers) counts[b.rule] = (counts[b.rule] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rule, n]) => `${n} ${(RULE_NAMES[rule] ?? [rule, rule])[n === 1 ? 0 : 1]}`)
    .join(', ');
}

/**
 * Picks the Jira project that best matches the space (same key, or shared words in the
 * name, e.g. space "Human Resources" -> project "HR Operations"), else the first one.
 */
export function bestProject(projects, space) {
  if (!projects?.length) return null;
  const key = (space?.key ?? '').toUpperCase();
  const words = new Set((space?.name ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const initials = (space?.name ?? '').split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase();
  const score = (p) => (p.key === key ? 100 : 0) + (initials.length > 1 && p.key.startsWith(initials) ? 50 : 0)
    + p.name.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length * 10;
  return [...projects].sort((a, b) => score(b) - score(a))[0].key;
}

/** Totals for the top of the report. */
export function summarizeSpace(pages) {
  const checked = pages.length;
  const barriers = pages.reduce((n, p) => n + p.barrierCount, 0);
  const average = checked ? Math.round(pages.reduce((n, p) => n + p.score, 0) / checked) : 100;
  const needWork = pages.filter((p) => p.barrierCount > 0).length;
  return { checked, barriers, average, needWork, clean: checked - needWork };
}

/** Maps page ID -> Jira issue key from issues labelled clearpage-page-<id>. */
export function issueKeysByPage(issues) {
  const map = {};
  for (const issue of issues ?? []) {
    for (const label of issue.fields?.labels ?? []) {
      const m = label.match(/^clearpage-page-(\d+)$/);
      if (m && !map[m[1]]) map[m[1]] = { key: issue.key, status: issue.fields?.status?.name ?? '' };
    }
  }
  return map;
}

/** The Jira issue description (ADF): what is wrong, where, and how to fix it. */
export function issueDescription({ title, url }, result) {
  const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
  return {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [t('Clearpage found accessibility barriers on '), t(title, [{ type: 'link', attrs: { href: url } }]), t('.')] },
      { type: 'paragraph', content: [t(summary(result))] },
      {
        type: 'bulletList',
        content: result.barriers.slice(0, 30).map((b) => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [t(`In "${b.where}": `, [{ type: 'strong' }]), t(`${b.text}. ${b.fix} (WCAG ${b.wcag.split(' ')[0]})`)],
          }],
        })),
      },
      { type: 'paragraph', content: [t('Tip: open the page and click the Accessibility badge under the title. "Fix headings, lists and tables" fixes the structural ones in one click; the Clearpage agent in Rovo can suggest link text.')] },
    ],
  };
}

/** Reads every current page in a space with its body, following pagination. */
async function spacePages(spaceId) {
  const pages = [];
  let cursor = null;
  let base = '';
  do {
    const path = cursor
      ? route`/wiki/api/v2/spaces/${spaceId}/pages?body-format=atlas_doc_format&status=current&limit=50&cursor=${cursor}`
      : route`/wiki/api/v2/spaces/${spaceId}/pages?body-format=atlas_doc_format&status=current&limit=50`;
    const res = await api.asUser().requestConfluence(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Could not list pages in this space (${res.status}).`);
    const data = await res.json();
    base = data._links?.base ?? base;
    for (const p of data.results ?? []) pages.push({ ...p, base });
    // The next page of results is given as a link like /wiki/api/v2/spaces/1/pages?cursor=abc
    const next = data._links?.next;
    cursor = next ? new URLSearchParams(next.split('?')[1] ?? '').get('cursor') : null;
  } while (cursor && pages.length < MAX_PAGES);
  return pages.slice(0, MAX_PAGES);
}

function checkOne(p) {
  const body = p.body?.atlas_doc_format?.value;
  const result = checkPage(body ? JSON.parse(body) : { type: 'doc', content: [] });
  return {
    id: String(p.id),
    title: p.title,
    url: `${p.base}${p._links?.webui ?? ''}`,
    ownerId: p.ownerId ?? p.authorId ?? null,
    score: result.score,
    barrierCount: result.barriers.length,
    problems: mainProblems(result.barriers),
    result,
  };
}

/** Jira issues Clearpage already created (any space), keyed by page ID. Empty if Jira is not available. */
async function existingIssues() {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: 'labels = clearpage ORDER BY created DESC', fields: ['labels', 'status'], maxResults: 200 }),
    });
    if (!res.ok) return {};
    return issueKeysByPage((await res.json()).issues);
  } catch {
    return {};
  }
}

/** Builds the space report. */
export async function buildReport(spaceId) {
  const [pages, issues] = await Promise.all([spacePages(spaceId), existingIssues()]);
  const rows = pages.map(checkOne).sort((a, b) => a.score - b.score || b.barrierCount - a.barrierCount);
  return {
    totals: summarizeSpace(rows),
    limited: pages.length >= MAX_PAGES,
    pages: rows.map(({ result, ...row }) => ({ ...row, issue: issues[row.id] ?? null })),
  };
}

async function spaceInfo(spaceId) {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces/${spaceId}`, { headers: { Accept: 'application/json' } });
  return res.ok ? res.json() : null;
}

/** Jira projects the user can create issues in (empty list if Jira is not installed). */
async function jiraProjects() {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/project/search?maxResults=50&action=create&orderBy=name`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    return ((await res.json()).values ?? []).map((p) => ({ key: p.key, name: p.name, id: p.id }));
  } catch {
    return [];
  }
}

/** Picks the "Task" issue type in a project, or the first non-sub-task type. */
async function taskTypeId(projectKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Could not read issue types for ${projectKey} (${res.status}).`);
  const data = await res.json();
  const types = (data.issueTypes ?? data.values ?? []).filter((t) => !t.subtask);
  const task = types.find((t) => t.name === 'Task') ?? types[0];
  if (!task) throw new Error(`Project ${projectKey} has no issue type Clearpage can use.`);
  return task.id;
}

/** Creates one Jira issue for one page. Tries to assign the page owner; falls back to unassigned. */
async function createIssue(projectKey, page, result) {
  const issueTypeId = await taskTypeId(projectKey);
  const fields = {
    project: { key: projectKey },
    issuetype: { id: issueTypeId },
    summary: `Fix ${result.barriers.length} accessibility ${result.barriers.length === 1 ? 'barrier' : 'barriers'} on "${page.title}"`,
    labels: ['clearpage', 'accessibility', PAGE_LABEL(page.id)],
    description: issueDescription(page, result),
  };
  const post = (f) => api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: f }),
  });
  let res = page.ownerId ? await post({ ...fields, assignee: { accountId: page.ownerId } }) : await post(fields);
  if (!res.ok && page.ownerId) res = await post(fields); // owner may not be assignable in this project
  if (!res.ok) throw new Error(`Jira did not create the issue (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const issue = await res.json();
  return { key: issue.key, status: 'To Do' };
}

const resolver = new Resolver();

resolver.define('getSpaceReport', async ({ context }) => {
  const spaceId = context?.extension?.space?.id;
  if (!spaceId) return { error: 'Open a space to see its report.' };
  try {
    const [report, projects, space] = await Promise.all([buildReport(spaceId), jiraProjects(), spaceInfo(spaceId)]);
    return { ...report, projects, defaultProject: bestProject(projects, space) };
  } catch (e) {
    return { error: e.message };
  }
});

resolver.define('createIssues', async ({ payload, context }) => {
  const spaceId = context?.extension?.space?.id;
  const { projectKey, pageIds } = payload ?? {};
  if (!spaceId || !projectKey || !Array.isArray(pageIds) || pageIds.length === 0) return { error: 'Choose a Jira project and at least one page.' };
  const [pages, issues] = await Promise.all([spacePages(spaceId), existingIssues()]);
  const created = {};
  const errors = [];
  for (const id of pageIds.slice(0, 25)) {
    if (issues[id]) { created[id] = issues[id]; continue; } // never duplicate
    const raw = pages.find((p) => String(p.id) === String(id));
    if (!raw) continue;
    const row = checkOne(raw);
    if (row.barrierCount === 0) continue;
    try {
      created[id] = await createIssue(projectKey, row, row.result);
    } catch (e) {
      errors.push(`${row.title}: ${e.message}`);
    }
  }
  return { created, errors };
});

export const spaceResolver = resolver.getDefinitions();
