# Clearpage privacy policy

Last updated: 21 November 2026

Clearpage is an Atlassian Forge app that "Runs on Atlassian". All of its code runs on
Atlassian's own platform.

**What Clearpage reads.** When you open a page, use the Clearpage agent in Rovo, open the
space Accessibility report, or call a Clearpage MCP tool, Clearpage reads the page (or the
pages in the space) **as you**, using your own Confluence permissions. It reads the Jira
projects you can create issues in and the Jira issues it created itself (label
`clearpage`).

**What Clearpage changes.** Only what you ask for and confirm: a fix to a page (saved as a
new page version you can restore), a sample page you ask it to add, or a Jira issue you ask
it to create.

**What Clearpage stores.** Nothing. It has no database and keeps no copies of your content.
Checks run in memory and the result is shown to you. A Jira issue it creates carries the
label `clearpage-page-<page id>`, so it can avoid duplicates. That label lives in your own
Jira.

**What leaves Atlassian.** Nothing. Clearpage does not call any outside service, use
analytics or tracking, or use Forge LLMs. AI features use Atlassian Rovo under your
Atlassian agreement.

**Contact:** open an issue at https://github.com/Hassank007/clearpage/issues
