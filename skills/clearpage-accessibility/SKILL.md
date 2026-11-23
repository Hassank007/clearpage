---
name: clearpage-accessibility
description: Check and fix accessibility barriers on Confluence pages with the Clearpage MCP tools (check-page, check-space, fix-page, create-accessibility-issue). Use when someone asks whether a Confluence page or space is accessible, wants pages fixed for screen reader users, or wants accessibility work assigned in Jira.
---

# Clearpage: accessible Confluence pages

Clearpage is an Atlassian Forge app. Its MCP server exposes four tools that work on
the Confluence site where it is installed, with the signed-in user's own permissions.

Server URL: `https://mcp.atlassian.com/forge/7edf5ee1-9ade-4fcd-a77a-1b961293c253`
(a site admin must first turn the tools on in Atlassian Administration → Apps →
Sites → your site → Connected apps → Clearpage).

## Tools

Tool names appear in clients with a prefix and, for test builds, an environment
suffix, e.g. `mcp__clearpage__check-page_development` in Claude Code. The
production build should have no suffix (not checked yet).

| Tool | What it does | Changes anything? |
|---|---|---|
| `check-page` | Scores one page (0–100) and lists every barrier: rule, WCAG criterion, nearest heading, the text involved, and the fix. | No |
| `check-space` | Scores every page in a space; returns totals and the 10 pages that need the most work. | No |
| `fix-page` | Makes one exact fix and saves it as a new page version (undo from Page history). | **Yes**, ask first |
| `create-accessibility-issue` | Creates a Jira issue for a page, assigned to the page owner, listing barriers and fixes. Skips pages that already have a labelled issue. | **Yes**, ask first |

The checks are fixed rules, not AI guesses: the same page always gets the same score.

## How to work

1. **Check before you talk.** Call `check-page` (with `page` = the page URL or ID) or
   `check-space` (with `spaceKey`). Never say a page is accessible without checking.
2. **Explain in plain words.** Start with the `summary` sentence. Then go section by
   section: what the problem is, who it affects, and the fix, with the WCAG number in
   brackets, e.g. "(WCAG 1.1.1)".
3. **Offer the safe fix first.** `fix-page` with `fixType: "structure"` fixes skipped
   heading levels, bold lines used as headings, typed lists and missing table headers in
   one call. It never changes the author's words. Ask: "Want me to fix the headings,
   lists and tables?"
4. **Words need a human yes.** For a vague link or a long web address, suggest new link
   text from the `context` and `href`, wait for the user to agree, then call `fix-page`
   with `fixType: "link-text"`, `oldLinkText` (the words on the page now), `newLinkText`
   (the agreed words) and `href`. For images, you cannot see them: only use
   `fixType: "image-alt"` with `imageId` and `altText` the user wrote or approved.
5. **One link or image per call.** After each fix, report `scoreBefore` → `scoreAfter`.
6. **Hand off to Jira** when the user is not the page owner: ask for the project key,
   then call `create-accessibility-issue` with `page` and `projectKey`.

## What Clearpage checks

| Rule | WCAG | Severity |
|---|---|---|
| Image with no alt text, or a file name as alt text | 1.1.1 | Serious |
| Link text like "click here", "read more" | 2.4.4 | Serious |
| Long web address used as link text | 2.4.4 | Moderate |
| Heading that skips a level, or an empty heading | 1.3.1, 2.4.6 | Moderate |
| Bold line used instead of a heading | 1.3.1 | Moderate |
| List typed by hand ("- item", "1. item") | 1.3.1 | Moderate |
| Table with no header row or column | 1.3.1 | Serious |
| Long sentences, ALL CAPS, underlined non-links, extra H1 | 3.1.5 / advice | Minor |

## Example

> **User:** Is our leave policy page accessible? https://acme.atlassian.net/wiki/spaces/HR/pages/3899393
>
> **Agent:** *(calls check-page)* "This page has 7 accessibility barriers … Score 38/100."
> In "Annual leave", the link "click here" does not say where it goes, so screen reader
> users hear only "click here" (WCAG 2.4.4). I suggest "Request leave in the HR portal".
> I can also fix the headings, lists and tables in one go. Want me to?
