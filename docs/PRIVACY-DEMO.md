# Demo privacy and data handling

This notice covers both the local demonstration and the public browser feedback preview. It is not the business's final privacy policy.

## Public browser feedback preview

The public preview is a static GitHub Pages build with fictional sample records. Its role choices and account data simulate the portal; it does not connect to the local Node/SQLite API, create real client accounts, or provide shared service for a yacht operation. Preview edits are stored in the current browser's local storage and are shared by the demo roles used in that browser. They are not sent to other browsers or devices. Clear this site's browser storage to reset the preview. Do not enter real names, contact details, vessel information, payment data, confidential service records, or personal photos.

GitHub Pages serves static HTML, CSS, and JavaScript and does not run the project's Node/SQLite API. GitHub states that Pages visitor IP addresses are logged for security. Review [GitHub's Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) for hosting details. The public host and its infrastructure logging are separate from the application's browser-local sample data.

## Use fictional information

The seeded people, vessel records, schedules, requests, estimates, documents, and notifications are demonstration material. Do not enter real client names, contact details, vessel registration/insurance information, payment information, confidential service records, or personal photos while evaluating this build.

In the local demonstration, information entered into the app is sent to the configured API. By default, that API runs on the development computer and uses local SQLite storage; local attachments may also persist there. A browser or device can retain a session and cached application information, and unsent work can remain on that device until synchronized or cleared. Signing out should be checked during local API QA for both session removal and private cache separation. These local API storage statements do not describe the static public preview, which has no API connection.

Management can create manual demo invitations containing a fictional name, email, role, and vessel assignments. A one-use token is shown to the administrator; the server stores its hash and expiry, and no email is sent. Acceptance creates a local account with the chosen password. Management can update vessel assignments or deactivate the account. The real business must define identity verification, authorized invitation delivery, recovery, and data retention before using this flow with clients.

Photo access is requested only when choosing an attachment; camera access is available for documentation where the app invokes it. Microphone access is not requested. Permission dialogs and actual photo behavior must be tested on both platforms. See [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/).

## Services and notifications

The demo uses the configured API; it does not provide live vessel tracking or telemetry. Its in-app notification list and preferences do not imply that email, SMS, or device push delivery is configured. An urgent request in the portal is not an emergency dispatch mechanism. The business must supply the real support contact and urgent follow-up process before client use.

The application does not collect payment when an estimate is approved. No card processor, invoicing integration, or automatic payment authorization is configured.

## Before production

Name the legal operator and support/privacy contact, storage and delivery providers, data locations, retention periods, deletion/export procedure, account revocation procedure, and security/support responsibilities. Publish a policy reflecting actual implemented data collection and sharing. Complete Apple privacy disclosures and Google Play Data safety using the final application and third-party SDK inventory. Define how a client asks for access removal or correction and how published record history is retained.

The developer must validate that private records and attachments require authorization on every API path, backups can be restored, and revoked sessions stop working. Device notification permissions, push token storage and removal, diagnostics, analytics, and any additional integrations need a new privacy review when added.
