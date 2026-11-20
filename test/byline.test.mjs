// Tests for the score badge text and the panel report (pure parts only; the Forge APIs are stubbed).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('@forge/api', { defaultExport: {}, namedExports: { route: () => '' } });
mock.module('@forge/resolver', { defaultExport: class { define() {} getDefinitions() { return () => {}; } } });
const { badge, report } = await import('../src/byline.js');
const { checkPage } = await import('../src/checks.js');

const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const doc = (...content) => ({ type: 'doc', version: 1, content });

test('badge: clean page says Accessible, otherwise shows the score', () => {
  assert.equal(badge(checkPage(doc(h(2, 'A'), p(t('Hi.'))))).title, 'Accessible ✓');
  const r = checkPage(doc(h(2, 'A'), h(4, 'B'), p(t('here', { type: 'link', attrs: { href: 'x' } }))));
  const b = badge(r);
  assert.equal(b.title, `Accessibility ${r.score}/100`);
  assert.match(b.tooltip, /2 accessibility barriers.*Click for details/);
});

test('report groups by section and counts what one click can fix', () => {
  const r = report('Guide', checkPage(doc(
    h(2, 'Leave'), p(t('click here', { type: 'link', attrs: { href: 'x' } })), h(4, 'Holidays'),
    p(t('- a')), p(t('- b')),
  )));
  assert.equal(r.title, 'Guide');
  assert.deepEqual(r.sections.map((s) => s.where), ['Leave', 'Holidays']);
  assert.equal(r.structuralCount, 2, 'heading skip + typed list');
  assert.equal(r.needsWordsCount, 1, 'the link needs new words');
});
