/**
 * Two sample pages full of everyday accessibility barriers, so anyone (including
 * hackathon judges on a fresh site) can try Clearpage in a minute. Confluence's editor
 * auto-corrects some of these (typing "- " makes a real list), so the samples are
 * created through the API instead.
 */
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const link = (href) => ({ type: 'link', attrs: { href } });
const bold = { type: 'strong' };
const cell = (type, text) => ({ type, content: [p(t(text))] });
const table = (rows) => ({
  type: 'table',
  content: rows.map((r) => ({ type: 'tableRow', content: r.map((c) => cell('tableCell', c)) })),
});

export const SAMPLE_PAGES = [
  {
    title: 'New starter guide (Clearpage sample)',
    doc: {
      type: 'doc',
      version: 1,
      content: [
        p(t('Welcome to the team! This page explains your leave, benefits and first-week checklist.')),
        h(2, 'Annual leave'),
        p(t('All full-time employees are entitled to 25 days of paid annual leave per calendar year, which accrues monthly from the first day of employment, and requests must be submitted through the HR portal at least two weeks before the intended start date unless the absence is due to an emergency situation as defined in section 4.')),
        p(t('To request leave, '), t('click here', link('https://example.com/hr/leave-form')), t('.')),
        h(4, 'Public holidays'),
        p(t('The office is closed on public holidays. The full list is at '), t('https://intranet.example.com/hr/policies/2026/public-holidays', link('https://intranet.example.com/hr/policies/2026/public-holidays')), t('.')),
        p(t('Benefits', bold)),
        p(t('Your benefits start on day one.')),
        table([['Benefit', 'Who pays'], ['Health insurance', 'Company'], ['Dental', 'Shared']]),
        h(2, 'First week checklist'),
        p(t('- Sign your contract')), p(t('- Set up your laptop')), p(t('- Meet your buddy')),
        p(t('For questions, '), t('read more', link('https://example.com/hr/faq')), t(' or contact HR.')),
        p(t('PLEASE KEEP YOUR BADGE WITH YOU AT ALL TIMES')),
      ],
    },
  },
  {
    title: 'Benefits FAQ (Clearpage sample)',
    doc: {
      type: 'doc',
      version: 1,
      content: [
        p(t('Answers to the questions new starters ask most about benefits.')),
        h(2, 'Health insurance'),
        p(t('Cover starts on your first day. Your partner and children can join the plan.')),
        h(4, 'How to add a family member'),
        p(t('1. Open the benefits portal')), p(t('2. Choose Add dependant')), p(t('3. Upload a birth or marriage certificate')),
        p(t('Pension', bold)),
        p(t('The company adds 5% of your salary. You can add more.')),
        table([['Your contribution', 'Company adds'], ['3%', '5%'], ['5%', '7%']]),
        p(t('Full details: '), t('here', link('https://example.com/hr/pension'))),
      ],
    },
  },
];
