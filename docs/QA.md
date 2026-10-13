# Acceptance and device QA

Use fictional records. Completed implementation evidence is summarized below. The remaining checklist is an acceptance plan: check a box only after executing the full scenario on the target environment and recording the result.

For each run, record the source commit, API environment, database seed/version, app build/profile, device model, OS/browser version, tester, date, and failures. Run the native scenarios on at least one physical iPhone and one physical Android phone, then cover the agreed minimum OS versions, tablet behavior where supported, and the browser management dashboard.

## Verification recorded during implementation

Verification on **October 10, 2026**:

| Check | Recorded result |
| --- | --- |
| Combined `npm test` | **28 passed**: 16 API tests and 12 client hook/state tests |
| TypeScript | Clean `npm run typecheck` |
| Expo public configuration | Valid iOS, Android, and web configuration; SecureStore and ImagePicker plugins resolved |
| Dependency compatibility | Offline check reported dependencies up to date; this check is limited to locally available compatibility information |
| UUID override smoke check | `xcode.generateUuid()` produced a 24-character project identifier with the `uuid@11.1.1` override |
| Final all-platform export | `npx expo export --platform all --output-dir dist` passed; approximately 563 KB web JavaScript and a 1.7 MB Hermes bundle for each mobile platform |

The API tests cover identity/logout, owner/staff isolation and files, estimate decisions/versions, retry persistence, report publication/corrections, attachment visibility, notification preferences, invitations/revocation, request-linked work, and vessel onboarding. The client suite exercises state/session/queue behavior. Test results describe these scenarios, not a full independent security or operational acceptance assessment.

## October 13 public-preview review

The browser feedback preview is a static app using fictional sample data held in per-browser local storage. Its demo roles share that browser's sample data; the preview is not connected to the local Node/SQLite API. See [FEEDBACK.md](FEEDBACK.md) and [PRIVACY-DEMO.md](PRIVACY-DEMO.md) for reviewer instructions and data boundaries.

Current implementation checks after the preview changes: `npm test` passed **50/50** (20 server, 26 client/demo, 4 public-preview guard tests), and `npm run typecheck` passed. `npm run build:preview` produced a 619 KB static export with 14 files; the public build guard passed. October 10's all-platform export above is historical and does not verify the current source.

Final live deployment for commit [`7472330`](https://github.com/grandpajackai/las-olas-client-portal/commit/747233034b8900cc23e5446040fe65a12d89e2d2) passed all-platform JavaScript export (web 619 KB; iOS and Android 1.8 MB each), tests, typecheck, export and public scan in [GitHub Actions run 38421081963](https://github.com/grandpajackai/las-olas-client-portal/actions/runs/38421081963). The deploy step and post-deploy checksums for all 14 published assets passed; local `check-live` passed against the same commit. The live URL is [https://grandpajackai.github.io/las-olas-client-portal/](https://grandpajackai.github.io/las-olas-client-portal/).

An October 13 phone-browser walkthrough at **390 and 320 CSS px** covered owner Home, Requests, More, Approvals, Messages, History search and empty results, Schedule, Documents search/download trigger, and Account offline capture/synchronization. The staff draft edit/submit → administrator return with private feedback → staff resubmission → administrator publish → owner-visible report flow passed, with internal notes absent from the owner view. Request date persistence, linked estimate and visit creation, visit date/time edit/save/completion, and cancel confirmation preserving history passed. Long 57-character vessel names and invitation tokens wrapped at 320 px. Checkbox state exposed `aria-checked` true/false and native accessibility values 1/0. These are browser preview observations and do not establish production server authorization. See screenshots and full results in [REVIEW.md](REVIEW.md).

The live preview was opened in a separate fresh browser. Creating a sample request, reloading with the request retained, switching roles in the same browser, and resetting through Account restored the role chooser and default sample state. Basic desktop Workspace/Access screens were inspected at 1440 px. Screenshots and gate-by-gate results are in [REVIEW.md](REVIEW.md).

In the in-app browser, the photo chooser selected `assets/app-icon.png`, the form showed **Uploaded**, and the request saved successfully. Its saved detail displayed **ATTACHMENTS** and a **Download app-icon.png** button ([screenshot](../qa/live-photo-attachment.png)). The browser download-completion event was not observed; its adapter and API file content were tested separately. Chrome's chooser stalled; this picker test does not verify native device permissions or file sharing.

Native keyboard behavior, physical-device operation, native permissions/sharing, signed builds, and store acceptance remain unverified. The public-preview browser results do not close those native checks or prove production API authorization. A read-only monitor checks the public preview every six hours and reports status; it does not modify or redeploy it.

Browser workflows verified during this run:

- Owner request submission and conversation message; estimate approval tied to the exact version with the approver recorded.
- Staff draft editing with a performed date, submission for review, administrator publication, and owner access to the published report with internal notes absent.
- Offline field request capture, a visible pending queue, and synchronization after returning online.
- Linked request → estimate → scheduled visit, including the default `09:00` start time and request status/coordinator behavior.
- Vessel switching and rendering of the management access and **Add a vessel** onboarding forms. Rendering does not establish full browser acceptance of every invitation/onboarding edge case; the API routes have automated coverage.

Compact visual browser QA completed at actual **319 px and 355 px CSS widths**. The owner home, including the yacht image, and the request dialog were reviewed with no horizontal overflow; the dialog scrolled and its close control remained reachable. A requested 390 px viewport produced an actual 355 px CSS width because of browser scaling, so 390 px is not claimed as tested. The saved browser screenshot is [owner-mobile.png](../qa/owner-mobile.png). This review covers these screens and widths, not every compact layout or native keyboard/safe-area behavior.

The browser download-completion event timed out in automation. Scoped API file downloads and their content were tested; actual browser download completion and native file sharing remain unverified.

**Native verification was not executed:** Xcode.app and the Android SDK are unavailable in this environment. Hermes export compiles JavaScript; it does not produce or validate signed native binaries. Physical iPhone/Android device testing, native permissions/sharing, distribution signing, and store submission remain outstanding. Rerun applicable checks after final edits and attach results to the release commit.

The dependency audit currently retains 15 high findings from two unpatched upstream tooling dependencies; see [DEPENDENCIES.md](DEPENDENCIES.md). A passing application test suite does not resolve those advisories.

## Launch and identity

- [ ] A fresh install opens to a usable sign-in screen; loading fonts does not leave a permanent blank view.
- [ ] Valid credentials open the correct role. Invalid credentials, offline sign-in, and API errors show actionable messages.
- [ ] Session restoration works after a restart. An expired or revoked session prompts sign-in and stops protected mutations.
- [ ] Sign out, then sign in as a different account. The previous user's records, pending work, and private documents are not shown or sent under the new identity.
- [ ] No secret credentials or session tokens appear in user-visible errors, browser URLs, exported reports, or diagnostic logs.

## Owner experience

- [ ] The main owner sees only assigned vessels. Switching vessels updates home, reports, requests, estimates, visits, documents, and notifications together.
- [ ] The second owner cannot read the first owner's records or attachments by navigating or calling the API directly with guessed IDs.
- [ ] Service history is searchable; dates, staff attribution, revision, equipment/readings, work performed, and check outcomes are clear.
- [ ] Passed, monitoring, action, not checked, and not applicable remain distinguishable without relying solely on color.
- [ ] Draft/review reports and staff internal notes never reach the owner response or owner screen.
- [ ] A new request saves its title, category, description, desired date, priority, and selected photo. Retrying a failed submission does not create duplicates.
- [ ] Photo permission denied, limited library access, cancellation, large image, and failed upload paths behave clearly on both platforms.
- [ ] Request acknowledgment/status/coordinator and conversation changes persist across sign-out/reload.
- [ ] An estimate shows scope, version, amount/currency, and decision state. Approve/decline records actor and time; a replay or competing decision cannot silently change the result.
- [ ] A changed estimate requires a new decision. Approval never claims to charge a payment method.
- [ ] Upcoming services and expiry dates are readable in the intended business timezone; past/empty dates do not masquerade as future appointments.
- [ ] Authorized documents download/open, service history exports where supported, and another owner's credentials cannot access the same file/export URL.
- [ ] Notification read state and preferences persist. The interface does not imply configured push/email delivery when only in-app records exist.

## Staff and administrator workflow

- [ ] Assigned staff see appropriate vessels only. An owner cannot call staff/admin endpoints; staff cannot invoke administrator-only publication/assignment actions.
- [ ] Fleet counts match filtered records. Empty, loading, failed, stale, and pending-sync views are understandable.
- [ ] Prepare a report with performed date, author, equipment/readings, each check outcome, work performed, photo evidence, and an internal note.
- [ ] Save a draft, reopen it, submit for review, and publish through the agreed administrator workflow. The owner sees only the published version.
- [ ] A correction preserves report revision history. The previous published content and original recorded date are available for audit rather than silently replaced.
- [ ] Walk one request through reviewed scope, estimate/decision, scheduling, work completion, management review, and owner-visible history. Record any steps the current UI does not yet expose.
- [ ] In **Workspace → People & vessel access**, create a manual demonstration invitation, choose assigned vessels and role, then accept it through **Use an invitation**. Verify minimum password length, one-use behavior, 48-hour expiry, and duplicate-email rejection. No email should be claimed as sent.
- [ ] Change an invited account's vessel assignments, then deactivate it while its device is signed in. Verify authorization changes apply server-side and deactivation revokes its sessions. Repeat with the approved production identity/delivery flow when configured; known demo accounts are insufficient acceptance evidence.

## Offline and data integrity

- [ ] Open assigned data while online, enable airplane mode, and verify cached data clearly indicates staleness and offline state.
- [ ] Capture a supported field draft offline; pending work remains visible after an app restart. A photo is not marked uploaded before successful synchronization.
- [ ] Restore connectivity and synchronize once, then retry. The server stores one work item and one intended decision for each idempotency key.
- [ ] Change the same record on another device before syncing. A conflict is surfaced or safely resolved according to the documented rule.
- [ ] Revoke vessel access while a device is offline. Its queued mutation and download are rejected on reconnect; no confidential data is reassigned to a later signed-in user.
- [ ] Failed synchronization does not cause a draft to be published. Publication is confirmed only after server persistence and the management review step.

## Native quality and release

- [ ] Test a signed preview against a reachable HTTPS API on physical devices. Test Wi-Fi changes, mobile data, app background/foreground, force-quit, and low-connectivity recovery.
- [ ] Check safe areas, keyboard avoidance, scroll reachability, photo picker return, document opening, back navigation, and Android system back.
- [ ] Check large text, VoiceOver/TalkBack labels and focus, contrast, touch target sizes, and reduced-motion preferences.
- [ ] Check compact phones, larger phones, supported tablets, and the wide browser dashboard. No essential controls or content are clipped.
- [ ] Test native permission denial and re-enabling in Settings. For push once configured, verify opt-in/out, token refresh/removal, foreground/background delivery, and a tap opening the intended authorized record.
- [ ] Verify production API settings, package IDs, app icon/name, versions, signing, store metadata, privacy disclosures, support contact, and demo credential removal in the actual release artifacts.
- [ ] Restore a backup into a separate environment and confirm private records, attachments, revisions, and decisions remain consistent.

## Automated checks

```sh
npm run typecheck
npm test
npm run build:web
npx expo export --platform all --output-dir dist
```

`npm test` runs the API and client-state suites together; `npm run test:api` and `npm run test:client` run them separately. Record command results and the tested commit. Inspect backend tests for cross-owner isolation, staff assignment limits, protected attachments, internal-note filtering, immutable decisions, revisions, and idempotent retries. Add coverage when a material authorization or integrity scenario is missing. Automated API checks and a successful web export do not replace the physical-device tests above.
