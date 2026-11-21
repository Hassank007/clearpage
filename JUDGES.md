# Trying Clearpage (judges' guide)

About 5 minutes. You need a Confluence Cloud site where you are an admin. Jira is optional, and
Rovo is needed only for steps 4 and 6.

## 1. Install

1. Open the **installation link in the Devpost submission** (Testing instructions). It is
   Atlassian's standard Forge install link for the production version.
2. Choose your site and install it for **Confluence**.
3. Optional, for Jira issues: open the same link again and install it for **Jira** on the same site.

No setup or keys are needed. Clearpage runs on Atlassian (Forge) and sends no data anywhere else.

## 2. Add the sample pages (10 seconds)

1. Open any space.
2. In the left sidebar, under **Space apps**, click **Accessibility report**.
3. Click **Add 2 sample pages to try Clearpage**.

This adds two realistic HR pages full of everyday barriers: "New starter guide" (38/100)
and "Benefits FAQ" (58/100). They are created through the API because Confluence's editor
auto-corrects some barriers, such as typed lists.

The report itself is the first thing to look at: every page in the space, worst score first,
with plain-words problems.

## 3. The score badge and one-click fix

1. Open **Benefits FAQ (Clearpage sample)**.
2. Under the title, next to the author, click **Accessibility 58/100**.
3. Read the report: barriers grouped by section, each with severity, the fix and the WCAG number.
4. Click **Fix headings, lists and tables (4)**. You'll see "Fixed: score 58 → 88" and a list of exactly what changed.
5. Click **Refresh page to see the changes**. The bold "Pension" line is now a real heading, the typed lines are a real numbered list, and the table has a header row.
6. Optional: open **Page history**. The fix is one version called "Clearpage accessibility fix" and can be restored.

## 4. The Rovo agent (needs Rovo)

1. Open **New starter guide (Clearpage sample)**.
2. Click **Ask Rovo**, open the agent picker, and choose **Clearpage**.
3. Click **Check this page for accessibility barriers**.
4. Say **"Fix the click here link"**. Clearpage suggests specific text, such as "Request leave in the HR portal", and waits for you to agree.
5. Say **"Yes"**. Rovo shows a **Please review → Confirm** card with the old text, the new text and the link address. Confirm it.
6. Also try: **"Which pages in this space need the most accessibility work?"**

## 5. Jira issues (needs the Jira install from step 1)

1. Go back to **Accessibility report**.
2. Pick a Jira project. Clearpage pre-selects the one that matches the space.
3. Click **Create issue for New starter guide (Clearpage sample)**. A Task is created for the page owner, listing every barrier with its fix and WCAG number. The row now links to the issue.
4. Reload the report. The page keeps its issue, and Clearpage never creates a duplicate.

## 6. MCP tools for outside agents (optional)

1. In **admin.atlassian.com**, go to Apps → Sites → your site → Connected apps → Clearpage → **Enable tools**.
2. Add `https://mcp.atlassian.com/forge/7edf5ee1-9ade-4fcd-a77a-1b961293c253` as a remote MCP server in any MCP client. In Claude Code:
   `claude mcp add --transport http clearpage https://mcp.atlassian.com/forge/7edf5ee1-9ade-4fcd-a77a-1b961293c253`, then sign in with `/mcp`.
3. Ask the client: *"Use clearpage check-space on space key XYZ and list the worst pages."*

The tools are `check-page`, `check-space`, `fix-page` and `create-accessibility-issue`. See
[skills/clearpage-accessibility/SKILL.md](skills/clearpage-accessibility/SKILL.md) for how
agents should use them.
