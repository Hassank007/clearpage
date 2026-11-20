// Tests for choosing which page the check-page action reads.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The real @forge/api only works inside Forge, so replace it with a stub for these tests.
mock.module('@forge/api', { defaultExport: {}, namedExports: { route: () => '' } });
mock.module('@forge/resolver', { defaultExport: class { define() {} getDefinitions() { return () => {}; } } });
const { resolveTarget } = await import('../src/index.js');

test('uses the page the user has open', () => {
  assert.deepEqual(resolveTarget({ context: { confluence: { contentId: '123', resourceType: 'page' } } }), { kind: 'pages', id: '123' });
  assert.deepEqual(resolveTarget({ context: { confluence: { contentId: 9, resourceType: 'blogpost' } } }), { kind: 'blogposts', id: '9' });
});

test('a link or ID typed in chat wins over the open page', () => {
  const context = { confluence: { contentId: '1' } };
  assert.deepEqual(resolveTarget({ page: 'https://x.atlassian.net/wiki/spaces/HR/pages/98765/Leave+policy', context }), { kind: 'pages', id: '98765' });
  assert.deepEqual(resolveTarget({ page: 'https://x.atlassian.net/wiki/spaces/HR/blog/2026/11/20/555', context }), { kind: 'blogposts', id: '555' });
  assert.deepEqual(resolveTarget({ page: '/wiki/spaces/HR/blogposts/555', context }), { kind: 'blogposts', id: '555' });
  assert.deepEqual(resolveTarget({ page: ' 42 ' }), { kind: 'pages', id: '42' });
});

test('nothing to check returns null', () => {
  assert.equal(resolveTarget({}), null);
  assert.equal(resolveTarget({ page: 'the leave policy' }), null);
});
