// Tests for the space report helpers (pure parts; Forge APIs stubbed).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('@forge/api', { defaultExport: {}, namedExports: { route: () => '' } });
mock.module('@forge/resolver', { defaultExport: class { define() {} getDefinitions() { return () => {}; } } });
const { mainProblems, summarizeSpace, issueKeysByPage, issueDescription, bestProject } = await import('../src/space.js');
const { checkPage } = await import('../src/checks.js');

test('main problems: most common first, at most three', () => {
  const b = (rule) => ({ rule });
  assert.equal(
    mainProblems([b('vague-link'), b('image-alt'), b('vague-link'), b('fake-list'), b('heading-skip')]),
    '2 unclear links, 1 image with no description, 1 typed list',
  );
  assert.equal(mainProblems([]), '');
});

test('space totals', () => {
  const t = summarizeSpace([{ score: 40, barrierCount: 5 }, { score: 100, barrierCount: 0 }, { score: 70, barrierCount: 2 }]);
  assert.deepEqual(t, { checked: 3, barriers: 7, average: 70, needWork: 2, clean: 1 });
  assert.equal(summarizeSpace([]).average, 100);
});

test('existing issues are found by their page label, newest first wins', () => {
  const map = issueKeysByPage([
    { key: 'HR-9', fields: { labels: ['clearpage', 'clearpage-page-123'], status: { name: 'In Progress' } } },
    { key: 'HR-2', fields: { labels: ['clearpage', 'clearpage-page-123'] } },
    { key: 'HR-3', fields: { labels: ['other'] } },
  ]);
  assert.deepEqual(map, { 123: { key: 'HR-9', status: 'In Progress' } });
});

test('issue description links the page and lists each barrier with its fix and WCAG number', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: 'x' } }] }] }] };
  const d = issueDescription({ title: 'Leave policy', url: 'https://s/wiki/p/1' }, checkPage(doc));
  assert.equal(d.type, 'doc');
  assert.equal(d.content[0].content[1].marks[0].attrs.href, 'https://s/wiki/p/1');
  const item = d.content[2].content[0].content[0].content.map((n) => n.text).join('');
  assert.match(item, /In "top of the page": here\. .*\(WCAG 2\.4\.4\)/);
});

test('best project: matching key, then initials or shared words, else first', () => {
  const projects = [{ key: 'CLSD', name: 'Commercial Legal Service Desk' }, { key: 'HRO', name: 'HR Operations' }, { key: 'PAY', name: 'Payroll' }];
  assert.equal(bestProject(projects, { key: 'HR', name: 'Human Resources' }), 'HRO');
  assert.equal(bestProject(projects, { key: 'PAY', name: 'Money' }), 'PAY');
  assert.equal(bestProject(projects, { key: 'LEGAL', name: 'Legal' }), 'CLSD');
  assert.equal(bestProject(projects, { key: 'X', name: 'Nothing' }), 'CLSD');
  assert.equal(bestProject([], {}), null);
});
