/**
 * Space accessibility report (confluence:spacePage).
 *
 * Shows every page in the space with its score, worst first, and lets the space owner
 * hand pages to their owners as Jira issues, one at a time or all pages under a score.
 * UI Kit only, so the table, headings and buttons work with screen readers and keyboards.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, Inline, Label, Link, Lozenge, SectionMessage, Select, Spinner, Stack, Strong, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const THRESHOLD = 70;

const scoreLozenge = (score) => (
  <Lozenge appearance={score >= 90 ? 'success' : score >= 60 ? 'moved' : 'removed'} isBold>{`${score}/100`}</Lozenge>
);

const App = () => {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(null); // page id being sent, or 'bulk'
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    invoke('getSpaceReport')
      .then((r) => {
        if (r.error) setError(r.error);
        else {
          setReport(r);
          const pick = r.projects?.find((p) => p.key === r.defaultProject) ?? r.projects?.[0];
          if (pick) setProject({ label: `${pick.name} (${pick.key})`, value: pick.key });
        }
      })
      .catch(() => setError('Clearpage could not build the report.'));
  }, []);

  const send = async (pageIds, who) => {
    if (!project) return;
    setBusy(who);
    setNotice(null);
    try {
      const r = await invoke('createIssues', { projectKey: project.value, pageIds });
      if (r.error) { setNotice({ appearance: 'error', text: r.error }); return; }
      setReport((old) => ({ ...old, pages: old.pages.map((p) => (r.created[p.id] ? { ...p, issue: r.created[p.id] } : p)) }));
      const n = Object.keys(r.created).length;
      setNotice(r.errors.length
        ? { appearance: 'warning', text: `Created or found ${n} issue(s). Problems: ${r.errors.join(' ')}` }
        : { appearance: 'success', text: `${n} Jira ${n === 1 ? 'issue is' : 'issues are'} ready in ${project.value}.` });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <SectionMessage appearance="error" title="Something went wrong"><Text>{error}</Text></SectionMessage>;
  if (!report) return <Inline space="space.100" alignBlock="center"><Spinner label="Checking every page in this space" /><Text>Checking every page in this space…</Text></Inline>;

  const { totals, pages, projects } = report;
  const lowWithoutIssue = pages.filter((p) => p.score < THRESHOLD && p.barrierCount > 0 && !p.issue).map((p) => p.id);

  const head = {
    cells: [
      { key: 'page', content: 'Page', isSortable: true },
      { key: 'score', content: 'Score', isSortable: true },
      { key: 'barriers', content: 'Barriers', isSortable: true },
      { key: 'problems', content: 'Main problems' },
      { key: 'jira', content: 'Jira' },
    ],
  };
  const rows = pages.map((p) => ({
    key: p.id,
    cells: [
      { key: p.title, content: <Link href={p.url} openNewTab>{p.title}</Link> },
      { key: p.score, content: scoreLozenge(p.score) },
      { key: p.barrierCount, content: <Text>{String(p.barrierCount)}</Text> },
      { key: `problems-${p.id}`, content: <Text>{p.problems || 'None'}</Text> },
      {
        key: `jira-${p.id}`,
        content: p.issue
          ? <Link href={`${p.url.split('/wiki')[0]}/browse/${p.issue.key}`} openNewTab>{`${p.issue.key}${p.issue.status ? ` (${p.issue.status})` : ''}`}</Link>
          : p.barrierCount === 0
            ? <Text>Not needed</Text>
            : (
              <Button
                appearance="default"
                onClick={() => send([p.id], p.id)}
                isDisabled={!project || busy !== null}
              >
                {busy === p.id ? 'Creating…' : `Create issue for ${p.title}`}
              </Button>
            ),
      },
    ],
  }));

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Text>
          {`${totals.checked} pages checked. Average score `}<Strong>{`${totals.average}/100`}</Strong>
          {`. ${totals.needWork} ${totals.needWork === 1 ? 'page needs' : 'pages need'} work (${totals.barriers} barriers in total); ${totals.clean} ${totals.clean === 1 ? 'is' : 'are'} clear.`}
        </Text>
        {report.limited && <Text size="small">Only the first 100 pages are shown.</Text>}
      </Stack>

      {notice && <SectionMessage appearance={notice.appearance}><Text>{notice.text}</Text></SectionMessage>}

      <Box>
        {projects?.length ? (
          <Stack space="space.100">
            <Label labelFor="jira-project">Jira project for new issues</Label>
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Box xcss={{ minWidth: '280px' }}>
                <Select
                  inputId="jira-project"
                  value={project}
                  onChange={setProject}
                  options={projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))}
                />
              </Box>
              <Button
                appearance="primary"
                onClick={() => send(lowWithoutIssue, 'bulk')}
                isDisabled={lowWithoutIssue.length === 0 || busy !== null}
              >
                {busy === 'bulk' ? 'Creating issues…' : `Create issues for pages under ${THRESHOLD} (${lowWithoutIssue.length})`}
              </Button>
            </Inline>
            <Text size="small">Each issue lists the barriers and fixes, links to the page, and is assigned to the page owner when possible. Pages that already have an issue are skipped.</Text>
          </Stack>
        ) : (
          <SectionMessage appearance="information"><Text>Install Clearpage in Jira on this site to send pages to Jira as issues.</Text></SectionMessage>
        )}
      </Box>

      <DynamicTable caption="Pages in this space, lowest score first" head={head} rows={rows} rowsPerPage={20} />
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
