// Tests for the page checks. Run: npm test (uses Node's built-in test runner, no extra packages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, summary, readingEase, score } from '../src/checks.js';

// Small helpers to build ADF documents.
const doc = (...content) => ({ type: 'doc', version: 1, content });
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const link = (href) => ({ type: 'link', attrs: { href } });
const strong = { type: 'strong' };
const img = (alt) => ({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm1', type: 'file', collection: 'c', ...(alt !== undefined ? { alt } : {}) } }] });
const cell = (type, text) => ({ type, content: [p(t(text))] });
const table = (header) => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: [cell(header ? 'tableHeader' : 'tableCell', 'Name'), cell(header ? 'tableHeader' : 'tableCell', 'Days')] },
    { type: 'tableRow', content: [cell('tableCell', 'Annual leave'), cell('tableCell', '25')] },
  ],
});
const rules = (r) => r.barriers.map((b) => b.rule);

test('a clean page has no barriers and scores 100', () => {
  const r = checkPage(doc(h(2, 'Leave'), p(t('Read the '), t('2026 leave policy', link('https://x/policy')), t('.')), img('Team at the 2026 offsite'), table(true)));
  assert.deepEqual(r.barriers, []);
  assert.equal(r.score, 100);
  assert.equal(r.stats.images, 1);
  assert.equal(r.stats.links, 1);
  assert.match(summary(r), /^No accessibility barriers/);
});

test('images: missing alt and file-name alt are barriers', () => {
  const r = checkPage(doc(img(), img(''), img('IMG_2041.jpg'), img('screenshot 3'), img('Org chart for the HR team')));
  assert.deepEqual(rules(r), ['image-alt', 'image-alt', 'image-alt-filename', 'image-alt-filename']);
  assert.equal(r.barriers[0].wcag, '1.1.1 Non-text Content');
});

test('links: vague text and long bare URLs are barriers, good text is not', () => {
  const r = checkPage(doc(
    p(t('For the form, '), t('click here', link('https://x/form')), t('.')),
    p(t('Read more!', link('https://x/a'))),
    p(t('https://intranet.example.com/hr/policies/2026/leave', link('https://intranet.example.com/hr/policies/2026/leave'))),
    p(t('Short ', link('https://x/s')), t('link', link('https://x/s'))),
    p(t('Download the leave form (PDF)', link('https://x/f'))),
  ));
  assert.deepEqual(rules(r), ['vague-link', 'vague-link', 'bare-url']);
  assert.equal(r.barriers[0].href, 'https://x/form');
  assert.match(r.barriers[0].context, /For the form/);
  // Neighbouring text nodes with the same link count as one link: "Short link".
  assert.equal(r.stats.links, 5);
});

test('headings: skipped levels and empty headings, with location', () => {
  const r = checkPage(doc(h(2, 'Benefits'), h(4, 'Dental'), { type: 'heading', attrs: { level: 3 }, content: [] }));
  assert.deepEqual(rules(r), ['heading-skip', 'empty-heading']);
  assert.equal(r.barriers[0].where, 'Benefits');
  assert.match(r.barriers[0].fix, /level 2 to level 4/);
});

test('an h1 in the body is advice, not a barrier', () => {
  const r = checkPage(doc(h(1, 'Policy'), h(2, 'Scope')));
  assert.deepEqual(rules(r), []);
  assert.equal(r.advice[0].rule, 'extra-h1');
});

test('bold short line used as a heading is a barrier; bold sentence is not', () => {
  const r = checkPage(doc(p(t('How to apply', strong)), p(t('Send the form.')), p(t('Note: this is important.', strong))));
  assert.deepEqual(rules(r), ['fake-heading']);
});

test('hand-typed lists are found when two or more lines run together', () => {
  const r = checkPage(doc(p(t('- Passport')), p(t('- Visa letter')), p(t('- Photo')), p(t('Bring these on day one.')), p(t('1. Only one'))));
  assert.deepEqual(rules(r), ['fake-list']);
  assert.match(r.barriers[0].fix, /3 items/);
});

test('tables without a header row or column are barriers', () => {
  const withColumnHeader = { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableCell', 'Ann')] }] };
  const r = checkPage(doc(table(false), table(true), withColumnHeader));
  assert.deepEqual(rules(r), ['table-no-header']);
});

test('long sentences, all caps and underline-not-link are advice', () => {
  const long = Array.from({ length: 35 }, (_, i) => `word${i}`).join(' ') + '.';
  const r = checkPage(doc(p(t(long)), p(t('PLEASE READ THIS WHOLE POLICY CAREFULLY NOW')), p(t('important', { type: 'underline' }))));
  assert.deepEqual(rules(r), []);
  assert.deepEqual(r.advice.map((a) => a.rule).sort(), ['all-caps', 'long-sentence', 'underline-not-link']);
});

test('summary groups barriers in plain words', () => {
  const r = checkPage(doc(img(), img(), p(t('here', link('https://x')))));
  assert.equal(summary(r), `This page has 3 accessibility barriers: 2 images with no description and 1 link that does not say where it goes. Score ${r.score}/100. Reading level: not enough text to score.`);
});

test('score drops with severity and never goes below 0', () => {
  assert.equal(score([{ severity: 'serious' }, { severity: 'moderate' }], [{ severity: 'minor' }]), 81);
  assert.equal(score(Array(20).fill({ severity: 'serious' })), 0);
});

test('reading ease: simple text scores higher than dense text', () => {
  const easy = 'We pay you on the last day of each month. You can see your pay slip online. Ask HR if you have a question. '.repeat(3);
  const hard = 'Remuneration disbursement is effectuated contemporaneously with the termination of each calendar month, notwithstanding organisational administrative considerations. '.repeat(4);
  assert.ok(readingEase(easy) > 60, `easy was ${readingEase(easy)}`);
  assert.ok(readingEase(hard) < 30, `hard was ${readingEase(hard)}`);
  assert.equal(readingEase('Too short.'), null);
});

test('the sample pages show the barriers the walkthrough promises', async () => {
  const { SAMPLE_PAGES } = await import('../src/samples.js');
  const [guide, faq] = SAMPLE_PAGES.map((s) => checkPage(s.doc));
  assert.deepEqual(rules(guide).sort(), ['bare-url', 'fake-heading', 'fake-list', 'heading-skip', 'table-no-header', 'vague-link', 'vague-link']);
  assert.equal(guide.score, 38);
  assert.deepEqual(rules(faq).sort(), ['fake-heading', 'fake-list', 'heading-skip', 'table-no-header', 'vague-link']);
  assert.equal(faq.score, 58);
});
