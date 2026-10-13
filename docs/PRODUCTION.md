# Production handoff

The codebase provides a local product and workflow demonstration with a shared mobile/browser client and a Node.js/SQLite API. It includes native configuration; it does not include provisioned hosting, business-owned distribution accounts, signed store releases, or evidence of device acceptance. Treat the following as release work, with a named accountable business or engineering owner for each item.

## Architecture to operate

| Area | Local demonstration | Production decision and implementation |
| --- | --- | --- |
| Client | Expo / React Native for iOS, Android, and browser | Confirm supported OS versions, accessibility targets, release cadence, and error monitoring |
| API | Node.js API on the development computer | Deploy behind HTTPS with restricted origins, appropriate request limits, monitoring, health checks, and a rollback procedure |
| Records | Local SQLite database | Choose and operate durable storage; SQLite needs a persistent volume and disciplined single-writer/backup operation, or migrate to managed PostgreSQL for broader concurrency |
| Attachments | Demonstration attachment flow | Private object storage, scoped downloads, safe content types, size limits, malware processing where appropriate, deletion and retention |
| Identity | Local demo credentials, one-use manual invitations, assignment editing, deactivation and server sessions | Business-approved identity/delivery setup, password recovery/rotation, staff MFA, rate limits, audit and access review |
| Notifications | In-app records and preference controls | Configure transactional delivery and push, register/remove device tokens, delivery/error handling, and human escalation |
| Offline work | Device-held draft/pending mutation workflow | Test restart recovery, expired sessions, authorization changes, retries, conflicts, attachment synchronization, and duplicate protection on real devices |
| Business systems | No configured integrations | Decide whether CRM, scheduling, invoicing/accounting or storage providers are needed; scope each integration separately |

API authorization must derive the acting user from a validated session and verify vessel/role access on every record, mutation, export, and attachment route. Do not trust a role or vessel ID supplied by the client. Verify that staff can only see their assigned vessels and that owners never receive drafts or internal notes. Separate client and staff sessions/caches during account switches.

The local API records estimate scope, currency, amount, and version with the decision and preserves approver and timestamp. A changed scope needs a new version and new decision. Published reports are preserved when staff create editable correction drafts. The client retains a limited offline mutation queue; server idempotency handles safe retries, and draft editing supports conflict detection against the recorded timestamp. Validate these protections under production concurrency, revocation, interrupted synchronization, and native-device storage conditions rather than treating a local demonstration as operational acceptance.

Management's **Workspace → People & vessel access** provides one-use manual demo invitations, role/vessel selection, assignment changes, and account deactivation. Recipients accept through **Use an invitation** on the sign-in screen. Invitation delivery is manual; no email provider is configured. Confirm the business's real onboarding authority, identity verification, delivery, recovery, and access-review procedures before enabling live clients.

## Business approval before real clients

- Approve the seven service-category checklist templates, reading units, inspection outcomes, review rules, and required evidence. Determine who may complete work, who may publish, and who may approve estimates for each vessel.
- Define the workflow from owner request to reviewed scope, estimate where needed, scheduling, completed work, review, and publication. Decide which steps require an explicit coordinator or supervisor.
- Confirm invitations, owner/captain/representative access, vessel assignments, staff roles, offboarding, and periodic permission reviews.
- Supply an actual support contact, operating hours, response expectations, and an urgent-matter escalation process. The portal cannot promise emergency monitoring without an operational service.
- Approve document categories, expiry handling, retention periods, record corrections, exports, account removal, and legal/privacy language matching actual service providers.
- Replace demo records, provisional icon, and placeholder identifiers using approved assets and anonymized acceptance data. Confirm business branding and intellectual-property permissions.

## Hosting and operational readiness

- Deploy a staging API and a separate production API with valid TLS, business-controlled domain/accounts, environment secrets, credential rotation, and least-privilege database/storage access. Restrict browser origins to the approved dashboard site.
- Remove seeded demo credentials and any demo bypasses from production. Connect approved invitation delivery and recovery, validate existing revocation/audit behavior, and add staff MFA where required, password/rate-limit policy, and access-review procedures.
- Provide automated encrypted backups with retention, off-site separation, restore testing, and a documented recovery time/data-loss target. Establish schema migrations and safe rollback plans before upgrades.
- Add structured application logs without credentials or document contents; monitor failed sign-ins, API errors, storage limits, queue failures, and backup completion. Define incident ownership and support escalation.
- Implement verified document exports/downloads and attachment access. Check URL sharing, MIME types, cross-client guessing, large uploads, failed uploads, and orphaned-file cleanup.
- If push is required, configure [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) or the chosen native provider. Complete device permission, token lifecycle, delivery receipt, and preference tests. In-app notification records alone do not provide push delivery.
- Perform access/security testing, restore rehearsal, and the device checklist in [QA.md](QA.md). Record results against a release commit and signed artifact.
- Resolve or formally assess the remaining dependency advisories before release. The present audit has 15 high findings from `braces` and `node-forge`, with no published fixed versions found; the targeted `uuid` override removed eight moderate findings. Review tooling exposure and final native/runtime dependency contents, rerun the audit at release, and document accepted residual risk with a responsible owner. See [DEPENDENCIES.md](DEPENDENCIES.md).

## iPhone and Android distribution

`app.json` currently uses **`com.lasolas.demoportal`** for both platforms. This is a provisional demo value; it is not a claim of domain, trademark, or store account ownership. Confirm final bundle/package IDs before creating the production app records. Use business-owned Apple Developer, Google Play Console, and Expo organization accounts, with documented administrator access and recovery.

The supplied EAS profiles are intentionally distinct:

| Profile | Android | iOS |
| --- | --- | --- |
| `preview` | Internal APK | Simulator `.app` build |
| `internal-device` | Internal APK | Registered-device internal build |
| `production` | Store App Bundle | Store distribution build |

Configure `EXPO_PUBLIC_API_URL` in the selected EAS environment to the reachable staging/production **HTTPS** endpoint before compiling. It is compiled into the JavaScript bundle and is public. Keep signing and backend credentials out of `EXPO_PUBLIC_*` values. Link the project to the correct Expo organization, configure Apple/Google signing, and protect credentials. A device internal iOS build requires the appropriate Apple signing/provisioning and registered devices; a simulator build cannot be installed on an iPhone. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/), [build profiles](https://docs.expo.dev/build/eas-json/), and [internal distribution](https://docs.expo.dev/build/internal-distribution/).

For submission, prepare approved icon/screenshots, store descriptions, support and privacy URLs, age/content declarations, review/demo access, and accurate Apple privacy / Google Data safety declarations. Review permissions and encryption declarations for the final dependencies and networking. Build, install, and test signed artifacts through TestFlight and a Play internal testing track before public rollout. Store submission, review approval, staged release, rollback, and post-release monitoring are still required.

## Release acceptance evidence

During implementation on October 10, 2026, TypeScript and the final all-platform export passed, along with 28 automated tests (16 API and 12 client-state tests). Expo public config/plugins resolved; the offline compatibility check reported up to date with its offline limitations. Browser checks covered the core owner/staff/administrator workflow, offline request synchronization, request-linked scheduling, and vessel switching; access/onboarding forms rendered. Compact browser checks at actual 319 px and 355 px CSS widths found no horizontal overflow on owner home or the request dialog, which remained scrollable with its close control reachable. Automated browser download completion timed out. Xcode.app and the Android SDK are unavailable here, so signed native binaries, physical-device QA, and native file sharing were not verified. See [the QA record](QA.md). These results do not establish store submission or production readiness.

Maintain a release record containing the source commit, API migration version, deployment environment, final API URL, iOS build number, Android version code, signing/account owner, supported device/OS matrix, QA results, authorization test results, backup restore result, approved privacy/store disclosures, and the business approver. Do not substitute a browser demo or successful JavaScript export for native device acceptance.
