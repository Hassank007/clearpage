// Tests for the page fixes: each fix must remove its barrier, change nothing else, and never modify the input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage } from '../src/checks.js';
import { applyFix, fixLinkText, fixImageAlt, fixStructure } from '../src/fixes.js';

const doc = (...content) => ({ type: 'doc', version: 1, content });
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const link = (href) => ({ type: 'link', attrs: { href } });
const B = { type: 'strong' };
const cell = (type, text) => ({ type, content: [p(t(text))] });
const rules = (d) => checkPage(d).barriers.map((b) => b.rule);

// The same page used for the live demo.
const demo = () => doc(
  h(2, 'Annual leave'),
  p(t('To request leave, '), t('click here', link('https://x/leave')), t('.')),
  h(4, 'Public holidays'),
  p(t('Benefits', B)),
  { type: 'table', content: [{ type: 'tableRow', content: [cell('tableCell', 'Benefit'), cell('tableCell', 'Who pays')] }, { type: 'tableRow', content: [cell('tableCell', 'Dental'), cell('tableCell', 'Shared')] }] },
  h(2, 'First week'),
  p(t('- Sign your contract')), p(t('- Set up your laptop')),
  p(t('1. Only one numbered line')),
);

test('link text: replaces the words, keeps the address and other text', () => {
  const before = demo();
  const { doc: after, changes } = fixLinkText(before, { oldText: 'Click here!', newText: 'Request leave in the HR portal' });
  assert.equal(changes.length, 1);
  const para = after.content[1];
  assert.deepEqual(para.content.map((n) => n.text), ['To request leave, ', 'Request leave in the HR portal', '.']);
  assert.equal(para.content[1].marks[0].attrs.href, 'https://x/leave');
  assert.ok(!rules(after).includes('vague-link'));
  assert.equal(before.content[1].content[1].text, 'click here', 'input must not change');
});

test('link text: a link split over bold and plain parts is replaced as one', () => {
  const d = doc(p(t('read ', link('https://x/f')), t('more', link('https://x/f'), B)));
  const { doc: after, changes } = fixLinkText(d, { oldText: 'read more', newText: 'HR questions and answers' });
  assert.equal(changes.length, 1);
  assert.equal(after.content[0].content.length, 1);
  assert.equal(after.content[0].content[0].text, 'HR questions and answers');
});

test('link text: href filter and no-match leave the page alone', () => {
  const d = doc(p(t('here', link('https://a'))), p(t('here', link('https://b'))));
  const r = fixLinkText(d, { oldText: 'here', newText: 'Form B', href: 'https://b' });
  assert.deepEqual(r.doc.content.map((x) => x.content[0].text), ['here', 'Form B']);
  assert.equal(fixLinkText(d, { oldText: 'nowhere', newText: 'X' }).changes.length, 0);
  assert.equal(fixLinkText(d, { oldText: 'here', newText: '  ' }).changes.length, 0);
});

test('image alt: by ID and for all missing', () => {
  const img = (id, alt) => ({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id, type: 'file', collection: 'c', ...(alt ? { alt } : {}) } }] });
  const d = doc(img('a'), img('b', 'Existing'), img('c'));
  assert.equal(fixImageAlt(d, { mediaId: 'a', alt: 'Office map' }).doc.content[0].content[0].attrs.alt, 'Office map');
  const all = fixImageAlt(d, { mediaId: 'all-missing', alt: 'Decorative' });
  assert.equal(all.changes.length, 2);
  assert.equal(all.doc.content[1].content[0].attrs.alt, 'Existing');
});

test('structure: fixes headings, bold headings, lists and tables in one go', () => {
  const before = demo();
  assert.deepEqual(rules(before).sort(), ['fake-heading', 'fake-list', 'heading-skip', 'table-no-header', 'vague-link']);
  const { doc: after, changes } = fixStructure(before);
  assert.deepEqual(rules(after), ['vague-link'], 'only the link (which needs words) is left');
  assert.equal(changes.length, 4);
  assert.equal(after.content[2].attrs.level, 3, 'Public holidays 4 -> 3');
  assert.deepEqual(after.content[3], { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Benefits' }] });
  assert.equal(after.content[4].content[0].content[0].type, 'tableHeader');
  const list = after.content[6];
  assert.equal(list.type, 'bulletList');
  assert.deepEqual(list.content.map((li) => li.content[0].content[0].text), ['Sign your contract', 'Set up your laptop']);
  assert.equal(after.content[7].type, 'paragraph', 'a single numbered line is left alone');
});

test('structure: numbered lists become ordered lists; clean pages are untouched', () => {
  const d = doc(p(t('1. First')), p(t('2) Second')));
  const r = fixStructure(d);
  assert.equal(r.doc.content[0].type, 'orderedList');
  const clean = doc(h(2, 'A'), h(3, 'B'), p(t('Text.')));
  assert.equal(fixStructure(clean).changes.length, 0);
});

test('heading fix cascades: 2, 5, 5, 3 becomes 2, 3, 3, 3', () => {
  const d = doc(h(2, 'a'), h(5, 'b'), h(5, 'c'), h(3, 'd'));
  const r = applyFix(d, { fixType: 'headings' });
  assert.deepEqual(r.doc.content.map((x) => x.attrs.level), [2, 3, 3, 3]);
});

test('unknown fix type changes nothing', () => {
  assert.equal(applyFix(demo(), { fixType: 'delete-everything' }).changes.length, 0);
});
