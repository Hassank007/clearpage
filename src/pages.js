/**
 * Reading and saving Confluence pages as the current user (asUser), so Clearpage
 * can only see and change what that person is already allowed to.
 */
import api, { route } from '@forge/api';

/** Reads a page body in Atlassian Document Format, as the current user. */
export async function fetchPage({ kind, id }) {
  const path = kind === 'blogposts'
    ? route`/wiki/api/v2/blogposts/${id}?body-format=atlas_doc_format`
    : route`/wiki/api/v2/pages/${id}?body-format=atlas_doc_format`;
  const res = await api.asUser().requestConfluence(path, { headers: { Accept: 'application/json' } });
  if (res.status === 404 || res.status === 403) return { error: 'I could not open that page. It may not exist, or you may not have permission to see it.' };
  if (!res.ok) return { error: `Confluence returned an error (${res.status}) when I tried to read the page.` };
  const page = await res.json();
  const body = page.body?.atlas_doc_format?.value;
  return {
    title: page.title,
    version: page.version?.number ?? 1,
    doc: body ? JSON.parse(body) : { type: 'doc', version: 1, content: [] },
  };
}

/**
 * Saves a new page body as the current user, as a new page version, so the
 * change shows in page history and can be restored with one click.
 */
export async function savePage({ kind, id }, { title, version }, doc) {
  const path = kind === 'blogposts' ? route`/wiki/api/v2/blogposts/${id}` : route`/wiki/api/v2/pages/${id}`;
  const res = await api.asUser().requestConfluence(path, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      status: 'current',
      title,
      body: { representation: 'atlas_doc_format', value: JSON.stringify(doc) },
      version: { number: version + 1, message: 'Clearpage accessibility fix' },
    }),
  });
  if (res.status === 409) return { error: 'Someone else changed the page at the same moment. Please ask me again.' };
  if (res.status === 403) return { error: 'You do not have permission to edit this page.' };
  if (!res.ok) return { error: `Confluence returned an error (${res.status}) when I tried to save the page.` };
  return { ok: true };
}
