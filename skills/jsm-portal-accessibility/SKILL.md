---
name: jsm-portal-accessibility
description: Check a Jira Service Management customer portal against WCAG 2.2 AA with the read-only tools of the Portal Accessibility Checker Forge app (Atlassian MCP server). Use when someone asks whether their service portal, request forms, field labels or help texts are accessible, or wants a list of accessibility fixes for their JSM portal.
---

# JSM portal accessibility (Portal Accessibility Checker for JSM)

This skill lets an agent that is connected to the Atlassian MCP server use the two
read-only tools exposed by the Forge app **Portal Accessibility Checker for JSM**
(manifest module `rovo:mcp`, key `pac-jsm-mcp`).

## Before you start

- The app must be installed on the Jira site, and the person connecting the MCP client
  must approve the app's tools.
- The tools read the site **with the caller's own permissions** and only for a Jira
  administrator (global "Administer Jira" permission). If the caller is not an
  administrator, the tool returns a refusal: say so plainly, do not retry, and suggest
  asking a Jira administrator.
- The tools write nothing, store nothing and call no external service.

## Tools

1. `scan_accessibility(url)` — runs the WCAG 2.2 AA scan of the customer portal of the
   site where the app is installed and returns the findings.
   - `url` (required): the absolute URL of the customer portal, for example
     `https://your-site.atlassian.net/servicedesk/customer/portals`.
   - The URL is only compared with the site of the installation; it is never fetched.
     A URL of another site is refused.
2. `list_last_findings()` — returns the current findings of the same site as a compact
   list. The app stores nothing, so this re-reads the site at the time of the call.

## How to answer the user

1. Call `scan_accessibility` with the portal URL the user gave (ask for it if missing).
2. Group the findings by request type, then by WCAG criterion. For each one, give the
   location (request type and field), the criterion and level, and the fix the app
   proposes, in the user's words.
3. Keep the findings marked **needs human review** in a separate list and say why:
   contrast, keyboard focus, reading order and touch-target size exist only in the
   rendered page, which the REST API cannot see.
4. Never say the portal "is WCAG 2.2 AA conformant". An automatic check is an alert to
   be checked by a person, never a verdict of conformance.
5. Offer the next step: the administrator fixes the labels and help texts in the JSM
   project settings (Request types), then you run the scan again to compare.

## Example (illustrative, not real output)

User: "Is our IT help portal accessible?"
Agent: calls `scan_accessibility("https://acme.atlassian.net/servicedesk/customer/portals")`,
then answers: "7 things to fix in 3 request types (for example: the field 'cf_hw_tag' in
'Laptop request' shows an internal code instead of a label, WCAG 2.4.6 AA: rename it
'Asset tag'), and 4 points a person must check on screen (contrast, focus)."

## Limits

- Atlassian Cloud only; reads request types, fields, help texts and page titles.
- If Jira Service Management is not licensed, the app checks the Jira equivalent
  (custom fields, field descriptions, issue summaries) and says which mode ran.
- Source code and manifest (MIT licence):
  https://github.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker
