# Clearpage

**Accessibility checks and fixes for Confluence pages, inside Confluence, Rovo and Jira.**

Companies keep their policies, HR guides, onboarding and how-tos in Confluence. Most of those
pages were never checked for accessibility, so blind and low-vision colleagues who use screen
readers hear "link, click here", "image", or a wall of text with no headings to jump between.
In the EU (European Accessibility Act) and the US (ADA Title II) this content increasingly has
to be accessible, but nobody has time to audit hundreds of pages.

Clearpage gives every page a score, explains each barrier in plain words, and fixes what it
safely can with one click, always after the author confirms.

Built for **Codegeist 2026** (Apps for Business Teams) on Atlassian Forge.

---

## What it does

| Where | What you get |
|---|---|
| **Under every page title** | A badge such as **Accessibility 58/100** (or **Accessible ✓**). Click it for the report: barriers grouped by section, each with its severity, the fix and the WCAG criterion. One button, **Fix headings, lists and tables**, repairs the page structure without touching the author's words. |
| **Rovo chat: the Clearpage agent** | "Check this page", "Fix the click here link", "Which pages in this space need the most work?". The agent explains barriers in plain language, suggests specific link text, and edits only after Rovo's own **Confirm** card. |
| **Space sidebar: Accessibility report** | Every page in the space with its score, worst first. One click creates a **Jira issue** for the page owner listing every barrier and fix, or create issues for all pages under 70. Never creates duplicates. |
| **Any MCP client** (Claude, Kiro, Rovo Studio…) | A Rovo MCP server with four tools: `check-page`, `check-space`, `fix-page` and `create-accessibility-issue`, plus a [skill guide](skills/clearpage-accessibility/SKILL.md) so outside agents use them safely. |

Every fix is saved as a new page version called "Clearpage accessibility fix", so **Page
history** can undo it.

## What it checks

The checks are fixed rules written by a DHS Section 508 Trusted Tester, not AI guesses. The
same page always gets the same score. AI (Rovo) only writes suggestions on top of the
findings, such as new link text.

| Barrier | WCAG 2.2 | Severity | Fixed by |
|---|---|---|---|
| Image with no alt text, or a file name as alt text | 1.1.1 | Serious | Author (Rovo suggests) |
| Link text that does not say where it goes ("click here", "read more") | 2.4.4 | Serious | Author (Rovo suggests) |
| Table with no header row or column | 1.3.1 | Serious | **One click** |
| Long web address used as link text | 2.4.4 | Moderate | Author (Rovo suggests) |
| Heading that skips a level (h2 → h4) | 1.3.1 | Moderate | **One click** |
| Bold line used instead of a heading | 1.3.1 | Moderate | **One click** |
| List typed by hand ("- item", "1. item") | 1.3.1 | Moderate | **One click** |
| Empty heading | 2.4.6 | Moderate | Author |
| Long sentences, ALL CAPS, underlined non-links, extra H1 | advice | Minor | Author |

It also gives a reading-level score (Flesch reading ease, shown as "plain English", "hard to
read" and so on).

## How it works

```
Confluence page (ADF JSON)
        │  read as the current user (asUser)
        ▼
 src/checks.js ── deterministic rules ──► barriers + score + plain summary
        │
        ├── byline badge + report panel (UI Kit)   src/byline.js, src/frontend/byline.jsx
        ├── Rovo agent actions                     src/index.js
        ├── space report + Jira issues             src/space.js, src/frontend/space.jsx
        └── Rovo MCP tools                         manifest.yml (rovo:mcp)
        ▲
 src/fixes.js ── exact edits (new page version) ◄── only after the user confirms
```

* **Runs on Atlassian** (Forge): no external servers, no data leaves Atlassian.
* **Reads and writes as the user** (`asUser`), so Clearpage can only see and change what that
  person already can. Viewers without edit rights see the score but cannot change the page.
* **No Forge LLM calls**: the AI is Rovo, so there are no extra AI costs.
* **Fixes never change the author's words** unless the author types or approves the new words.

**Forge modules:** `rovo:agent`, `action` (×4), `rovo:mcp`, `confluence:contentBylineItem`
(with dynamic properties), `confluence:spacePage`. Compatible with Confluence (required) and
Jira (optional).

**Scopes:** `read:page:confluence`, `write:page:confluence`, `read:blogpost:confluence`,
`write:blogpost:confluence`, `read:space:confluence`, `read:jira-work`, `write:jira-work`.

## Accessibility of Clearpage itself

An accessibility tool has to be accessible. The panels use only Atlassian UI Kit components:
real headings, buttons, lists and a captioned table. Severity is written as a word ("Serious")
as well as a colour, and every fix says what it changed.

## Try it (for judges)

See **[JUDGES.md](JUDGES.md)** for the install link and a 5-minute walkthrough with sample
pages.

## Develop

```bash
npm install
npm test                  # 30 tests, Node's built-in test runner
forge deploy -e development
forge install --site <your-site>.atlassian.net --product confluence -e development
forge install --site <your-site>.atlassian.net --product jira -e development   # optional, for Jira issues
```

Requires Node 22.23+ and the Forge CLI. Rovo must be on for the site to use the agent and
the MCP tools.

**Code map**

| File | What |
|---|---|
| `src/checks.js` | All accessibility rules, the score, the reading level and the summary |
| `src/fixes.js` | Exact page edits: link text, alt text, headings, lists, table headers |
| `src/pages.js` | Read and save pages as the user (new version on save) |
| `src/index.js` | Rovo and MCP action handlers |
| `src/byline.js`, `src/frontend/byline.jsx` | Score badge and report panel |
| `src/space.js`, `src/frontend/space.jsx` | Space report and Jira issues |
| `skills/clearpage-accessibility/SKILL.md` | How outside agents should use the MCP tools |

## What's next

* Check pages automatically when they are published, and nudge the author.
* Alt-text suggestions from the image itself.
* Forms and macros (expand, tabs, status).
* Marketplace listing.

---

Built by Hassan Ahmed, DHS Section 508 Trusted Tester. Built with Claude Code as a coding assistant.
