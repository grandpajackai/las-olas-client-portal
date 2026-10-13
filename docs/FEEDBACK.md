# Browser feedback preview

**Live preview:** [https://grandpajackai.github.io/las-olas-client-portal/](https://grandpajackai.github.io/las-olas-client-portal/). The site was deployed from commit [`7472330`](https://github.com/grandpajackai/las-olas-client-portal/commit/747233034b8900cc23e5446040fe65a12d89e2d2); [GitHub Actions run 38421081963](https://github.com/grandpajackai/las-olas-client-portal/actions/runs/38421081963) passed build, tests, export, public scan, deployment, and checks for all 14 deployed asset checksums.

This preview is for reviewing the Las Olas owner, staff, and management experience. It uses fictional vessels and records. The public version is a static browser demonstration: changes stay in that browser's local storage, including when you switch between demo roles in the same browser. They are not shared with another browser, device, or visitor. Clear the site's browser storage to reset the walkthrough. It is separate from the local Node/SQLite API and does not provide a hosted shared yacht-management service, real client accounts, or iPhone/Android store distribution.

## Choose a role

Choose a demo role on the sign-in screen; no sign-up is required. If entering credentials manually, every supplied account uses `DemoHarbor!26`:

| Role | Demo email | Useful perspective |
| --- | --- | --- |
| Owner | `owner@demo.lasolas.test` | Understand the vessel's care and next action |
| Second owner | `second-owner@demo.lasolas.test` | Compare another assigned-vessel experience |
| Staff | `staff@demo.lasolas.test` | Capture work and submit a clear report |
| Management | `admin@demo.lasolas.test` | Coordinate work, review reports, and manage access |

Use fictional information only. Approval buttons change the sample record; they do not authorize real work or collect payment. Messages, requests, and invitations do not send email, push notifications, or instructions to the business.

## Owner walkthrough · about five minutes

1. Identify the selected yacht, the next planned visit, the latest published care, and anything awaiting your decision. Describe any information you expected to see immediately but had to hunt for.
2. Open a service report. Check who recorded it, when the work happened, the checklist outcomes, and what was completed. Confirm that “not checked” communicates that no condition assessment was recorded.
3. Submit a fictional request, such as preparing the yacht for a weekend visit, then add a conversation message. Find its status and coordinator.
4. Open an estimate, read its scope, currency/amount, and version, and make a sample decision. Determine whether you can distinguish the current version from a replaced version.
5. Find Schedule, Documents, and Account from the phone navigation. Switch vessels and confirm you still know which yacht each record belongs to.

## Staff and management walkthrough · about five minutes each

For staff, record a draft service report, mark a few checks with different outcomes, add an internal note, save, reopen/edit, and submit for review. Try supported text capture in offline field mode and inspect the pending state before synchronizing. Photo/file behavior and native-device offline behavior should only be treated as verified where listed in the final review evidence.

For management, review a submitted report, return it with a clear correction reason or publish it, and inspect the owner-facing result. From a request, prepare an estimate and schedule related work. Try rescheduling/completing/cancelling a sample visit. In **People & vessel access**, review assignments and the fictional invitation/vessel onboarding forms. The public demonstration simulates these roles; it is not a test of production identity or server authorization.

## Useful feedback

Please report the role and screen, what you were trying to do, what happened, what you expected, and your phone/browser if relevant. A screenshot helps, but do not include real client information.

The most useful questions are: Could you confidently choose your next action? Which status or instruction was unclear? Was something difficult to read, tap, find, or correct on a phone? For management, what would slow down the daily review of work across vessels? Share observations in the chat accompanying this preview; no separate feedback delivery service is implied.

## What this preview cannot establish

This feedback preview has passed its browser review. That review does not establish Safari behavior on a physical iPhone, Android device behavior, native keyboard/permissions/file sharing, full VoiceOver/TalkBack or zoom behavior, browser download completion, push delivery, live monitoring, emergency response, production onboarding, shared cross-device persistence, backups, signed binaries, or store approval. These remain native/production acceptance items, not blockers to using this preview for fictional-data feedback. The [review record](REVIEW.md) distinguishes tested behavior from what remains outstanding; [production requirements](PRODUCTION.md) describe the operational release work.

GitHub Pages hosts static HTML/CSS/JavaScript; it does not run the Node/SQLite API. GitHub states that Pages visitor IP addresses are logged for security. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). A fresh public browser confirmed that a sample request remained after reload, switching roles in the same browser shared the sample data, and Account → Reset demo restored the role chooser and default sample state. The preview was also checked at 390 px; a separate 320 px owner/admin QA and basic desktop Workspace/Access inspection passed. Browser download completion was not observed, and the walkthrough does not establish native device behavior or production API authorization.

A read-only monitor checks the public preview every six hours and reports status; it does not edit or redeploy the site.
