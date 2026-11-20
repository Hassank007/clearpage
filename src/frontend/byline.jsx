/**
 * The panel that opens when someone clicks the "Accessibility 80/100" badge under a page title.
 *
 * Built only with Atlassian UI Kit components, which are accessible by default
 * (real headings, buttons and lists that screen readers understand).
 * Plain words first; the WCAG reference sits after each fix for people who need it.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, Heading, List, ListItem, Lozenge, SectionMessage, SectionMessageAction, Spinner, Stack, Strong, Text, Inline,
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

const SEVERITY = {
  serious: { label: 'Serious', appearance: 'removed' },
  moderate: { label: 'Moderate', appearance: 'moved' },
  minor: { label: 'Minor', appearance: 'default' },
};

function scoreAppearance(score) {
  if (score >= 90) return 'success';
  if (score >= 60) return 'moved';
  return 'removed';
}

const App = () => {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    invoke('getReport').then((r) => (r.error ? setError(r.error) : setReport(r))).catch(() => setError('Clearpage could not check this page.'));
  }, []);

  const fix = async () => {
    setFixing(true);
    try {
      const r = await invoke('fixStructure');
      if (r.error) setError(r.error);
      else {
        setResult(r);
        if (r.sections) setReport(r);
      }
    } finally {
      setFixing(false);
    }
  };

  if (error) return <SectionMessage appearance="error" title="Something went wrong"><Text>{error}</Text></SectionMessage>;
  if (!report) return <Inline space="space.100" alignBlock="center"><Spinner label="Checking this page" /><Text>Checking this page…</Text></Inline>;

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Heading as="h2">Accessibility check</Heading>
        <Lozenge appearance={scoreAppearance(report.score)} isBold>{`${report.score}/100`}</Lozenge>
      </Inline>
      <Text>{report.summary}</Text>

      {result && result.changes?.length > 0 && (
        <SectionMessage
          appearance="success"
          title={`Fixed: score ${result.scoreBefore} → ${report.score}`}
          actions={[<SectionMessageAction key="reload" onClick={() => router.reload()}>Refresh page to see the changes</SectionMessageAction>]}
        >
          <Stack space="space.050">
            {result.changes.map((c) => <Text key={c}>{`• ${c}`}</Text>)}
            <Text>Saved as a new page version. Page history can undo it.</Text>
          </Stack>
        </SectionMessage>
      )}
      {result && result.changes?.length === 0 && <SectionMessage appearance="information"><Text>{result.message}</Text></SectionMessage>}

      {report.structuralCount > 0 && (
        <Box>
          <Button appearance="primary" onClick={fix} isDisabled={fixing}>
            {fixing ? 'Fixing…' : `Fix headings, lists and tables (${report.structuralCount})`}
          </Button>
          <Text size="small">Only changes page structure, never your words. Saved as a new version you can undo.</Text>
        </Box>
      )}
      {report.needsWordsCount > 0 && (
        <Text>
          <Strong>{report.needsWordsCount} need new words</Strong> (link text or image descriptions). Ask the Clearpage agent in Rovo to suggest them.
        </Text>
      )}

      {report.sections.map((section) => (
        <Stack space="space.100" key={section.where}>
          <Heading as="h3">{`In “${section.where}”`}</Heading>
          <List type="unordered">
            {section.items.map((item, i) => (
              <ListItem key={`${item.rule}-${i}`}>
                <Stack space="space.050">
                  {/* Label on its own line so it never gets squeezed and cut off next to long text. */}
                  <Box>
                    <Lozenge appearance={SEVERITY[item.severity]?.appearance ?? 'default'} maxWidth={120}>{SEVERITY[item.severity]?.label ?? item.severity}</Lozenge>
                  </Box>
                  <Text><Strong>{item.text}</Strong></Text>
                  <Text>{`${item.fix} (WCAG ${item.wcag.split(' ')[0]})`}</Text>
                </Stack>
              </ListItem>
            ))}
          </List>
        </Stack>
      ))}

      {report.advice.length > 0 && (
        <Stack space="space.100">
          <Heading as="h3">Also worth fixing</Heading>
          <List type="unordered">{report.advice.map((a, i) => <ListItem key={i}>{`${a.text}: ${a.fix}`}</ListItem>)}</List>
        </Stack>
      )}
      <Text size="small">{`Reading level: ${report.reading.label}.`}</Text>
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
