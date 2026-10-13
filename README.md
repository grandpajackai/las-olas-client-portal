# Las Olas client portal

A shared Expo / React Native application for iPhone, Android, and the browser. The local demonstration uses a Node.js + SQLite API. A separate public feedback preview is a static browser build with fictional data stored in each browser; it does not connect to that API. Owners have a vessel portal; staff and administrators use the same app for fleet work and report publication. The local browser view supplies the management dashboard.

This is a working local demonstration with fictional records. It is not connected to a live yacht operation, accounting system, telemetry source, email delivery service, or push provider. Native project configuration and EAS build profiles are included; no signed binary or App Store / Google Play release is included. See [production requirements](docs/PRODUCTION.md) before using real client data.

## Run locally

Requirements: Node.js **22.13 or newer** (the API uses built-in `node:sqlite`), npm, and a current browser. Install dependencies and start both servers:

```sh
cd las-olas-client-portal
npm install
npm run dev
```

Open [the local portal](http://localhost:8081). The API runs on port `4000`, bound to `127.0.0.1` by default. The first API launch seeds demonstration data in `server/data/portal.sqlite`; later launches retain local changes. Override the database location with `PORTAL_DB` when running isolated test/demo instances. `Ctrl+C` stops both servers. Start them separately with `npm run api` and `npm run web` if you need separate logs.

Use one of these accounts. Every demo account has the password **`DemoHarbor!26`**.

| Account | Role | Purpose |
| --- | --- | --- |
| `owner@demo.lasolas.test` | Owner | Main owner portal and assigned vessels |
| `second-owner@demo.lasolas.test` | Owner | Separate client for permission checks |
| `staff@demo.lasolas.test` | Staff | Assigned fleet work and report drafting |
| `admin@demo.lasolas.test` | Administrator | Fleet management and publication |

Never reuse the demo password for a real account. The local API includes these known credentials so the product can be reviewed.

## Public browser feedback preview

The public preview is planned for GitHub Pages at `https://<account>.github.io/las-olas-client-portal/`. Deployment and URL verification are pending; do not share that placeholder as a working link. The preview uses only fictional sample accounts and records. It simulates owner, staff, and management roles in the browser and is not backed by the local Node/SQLite API or a hosted shared service.

Preview changes are kept in that browser's local storage and are available when switching demo roles in the same browser. They are not shared with another browser, device, or visitor. Use fictional data only; clear the site's browser storage to reset a walkthrough. No email, push notification, payment, or real-world work instruction is sent. The GitHub Pages host is static HTML/CSS/JavaScript; GitHub documents that visitor IP addresses are logged for security. See [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [the feedback walkthrough](docs/FEEDBACK.md), and [the demo privacy notice](docs/PRIVACY-DEMO.md).

To build the same static preview locally, run `npm run build:preview`. This sets the demo mode and `/las-olas-client-portal` base path, exports the web app into `preview-dist`, and prepares the Pages output. It does not start or require the Node API.

## Try the workflow

1. Sign in as an owner, switch vessels, and open service history, requests, estimates, upcoming visits, and documents.
2. Submit a request with a demonstration photo. Review an estimate's version, scope, and amount before making a decision.
3. Sign out and use the staff account to review assigned work and prepare a service report. Use the administrator account for the review/publication step.
4. Sign in as the owner again and inspect the published result. Use the second owner account to check that the first owner's vessel content is unavailable.

Management can open **Workspace → People & vessel access** to create a manual demonstration invitation, select a role and assigned vessels, update assignments, or deactivate an account. Copy the one-use token shown after creation, sign out, and choose **Use an invitation** on the sign-in screen. Tokens expire after 48 hours; no invitation email is sent. Use fictional names and email addresses, and choose a new password of at least 12 characters when accepting an invitation.

The same workspace includes **Add a vessel** for fictional vessel onboarding. Assign the new vessel to the intended owner or staff account before expecting it to appear in that account's portal. From a request, management can prepare a linked estimate and schedule linked work; staff can record the related service report.

Staff can edit saved draft reports, submit them for review, and create an editable correction draft from a published report while preserving the published original. **Account → Offline field mode** enables text request, message, and draft-report capture; the pending queue retries on reconnection. Photo upload, decisions, publication, and access management require a connection. A saved offline field entry is pending synchronization, not a published record.

The interface labels recorded observations and unchecked items. Its records do not represent live sensors. Report publication and estimate decisions should be reviewed as workflow demonstrations; operational sign-off and production acceptance remain outstanding.

## Run on an iPhone or Android device

Stop the default runner, then start the API listening on the LAN in one terminal. Start Metro with the reachable LAN address in a second terminal. A physical phone cannot reach the computer using `localhost`. Put the phone and computer on the same trusted Wi-Fi network:

```sh
HOST=0.0.0.0 npm run api
```

```sh
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4000 npx expo start
```

Scan the QR code with Expo Go for initial development review, or use a development build after adding/configuring `expo-dev-client`. The Metro tunnel, if used, tunnels Metro only; it does not expose the API. Check firewall access to port `4000` and the actual API bind address. An Android emulator normally reaches the host with `http://10.0.2.2:4000`; an iOS Simulator can normally use `http://localhost:4000`.

Platform network policies can block plain HTTP in a compiled native app. Use a reachable **HTTPS** staging API for native preview/store builds. Do not weaken production transport security to make a local URL work. `EXPO_PUBLIC_API_URL` is public configuration bundled into the client, never a place for secrets. Restart Metro after changing it. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

## Build installable apps

The included identifiers, `com.lasolas.demoportal`, are provisional demo identifiers. Confirm the business-owned Apple/Google/Expo accounts and final identifiers before a release. No Expo project has been linked on behalf of the business.

After setting a reachable staging API URL in the EAS build environment, sign into the intended Expo account and configure the project:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

The `preview` profile produces an Android APK and a separate iOS **Simulator** build. The simulator build cannot be installed on an iPhone. For a physical iPhone, use an Apple Developer account, register the device, and use the device profile:

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile internal-device
```

The `production` profile is a starting point for store builds: Android App Bundle and signed iOS store artifact. Complete business ownership, signing, production API configuration, privacy/store disclosures, and device QA before building/submitting. A successful EAS build is not a store submission or store approval. See official guidance for [build profiles](https://docs.expo.dev/build/eas-json/), [simulators](https://docs.expo.dev/build-reference/simulators/), and [internal distribution](https://docs.expo.dev/build/internal-distribution/).

## Checks and handoff

```sh
npm run typecheck
npm test
npm run build:web
npx expo export --platform all --output-dir dist
```

Verification recorded on **October 10, 2026**: `npm test` passed all **28 tests** (16 API and 12 client-state tests), TypeScript passed, Expo public configuration resolved the iOS/Android/web targets and SecureStore/ImagePicker plugins, and the final all-platform export passed. The export produced approximately 563 KB of web JavaScript and 1.7 MB Hermes bundles for each mobile platform. The offline dependency compatibility check reported up to date; it is limited to the locally available compatibility information.

Current preview-phase checks on **October 13, 2026**: `npm test` passed **50 tests** (20 server, 26 client/demo, and 4 public-preview guard tests), and `npm run typecheck` passed. `npm run build:preview` produced a 619 KB static export with 14 files, and the public build guard passed. The October 10 all-platform export above is historical. The public HTTPS deployment and URL are still pending verification; see the [review record](docs/REVIEW.md).

Browser checks exercised owner requests/messages and versioned approvals, staff draft editing/review, administrator publication, owner-visible published reports without internal notes, offline request capture/synchronization, linked estimate/scheduling, and vessel switching. Access and **Add a vessel** forms rendered successfully. Compact browser visual checks completed at actual **319 px and 355 px CSS widths**: the owner home and request dialog had no horizontal overflow, and the dialog remained scrollable with its close control reachable. The automated browser download-completion event timed out; scoped API downloads were tested, while browser completion and native file sharing remain unverified. See [the QA record and remaining checklist](docs/QA.md).

JavaScript export verifies bundling and is not native compilation or device acceptance. Xcode.app and the Android SDK are unavailable in this environment, so signed native binaries and physical-device tests were not executed. Store submission remains outstanding.

The dependency audit currently reports **15 high findings**, propagated from two unpatched tooling dependencies. The eight moderate findings were resolved by a targeted `xcode` → `uuid@11.1.1` override without downgrading Expo. See [dependency findings and release gating](docs/DEPENDENCIES.md).

- [Demo privacy and storage notice](docs/PRIVACY-DEMO.md)
- [Production architecture and release checklist](docs/PRODUCTION.md)
- [Manual acceptance and device QA](docs/QA.md)
- [Dependency audit and remaining upstream issues](docs/DEPENDENCIES.md)

The assets reuse the Las Olas website's teal, ivory, and muted gold identity. Cormorant Garamond and DM Sans font licenses are retained in `assets/`. The generated monogram is a provisional app icon; the business should approve final release artwork.
