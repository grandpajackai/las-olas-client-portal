# Dependency audit and release review

Audit reviewed on **October 10, 2026**. The application currently uses Expo SDK 57 (`expo@57.0.27`) and React Native `0.86.3`. The initial npm audit reported 23 affected dependency nodes: 15 high and eight moderate. These were propagated findings from three distinct advisories, not 23 independent vulnerabilities.

A targeted override now pins `xcode`'s transitive `uuid` to `11.1.1`. This removes the eight moderate findings without changing Expo SDK or React Native. The remaining result is **15 high, zero moderate**, propagated from the following two advisories.

| Advisory root | Installed version and path | Published fix status |
| --- | --- | --- |
| `braces` | `3.0.3`, through `expo` → `@expo/metro` → `metro-file-map` → `micromatch` | All published versions through `3.0.3` are affected; no patched version was listed when checked |
| `node-forge` | `1.4.0`, through `expo` → `@expo/cli`, directly and through `@expo/code-signing-certificates` | All published versions through `1.4.0` are affected; no patched version was listed when checked |

The `braces` advisory concerns call-stack exhaustion from deeply nested brace patterns. The `node-forge` advisory concerns acceptance of malformed nested digest data during RSA PKCS#1 v1.5 signature verification. npm registry checks confirmed `3.0.3` and `1.4.0`, respectively, were the latest published versions at review time. The advisories explicitly list no patched version. See [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

## Targeted uuid fix

The prior moderate root was `uuid@7.0.3` under `xcode@3.0.1` → `@expo/config-plugins`. Its advisory affects buffer-bound checks in UUID v3/v5/v6 and is fixed in `11.1.1`. Inspection of the installed `xcode` code found its use of `uuid.v4()` without a caller-supplied buffer. The override selects the fixed release while retaining the CommonJS entry point required by `xcode`. See [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Do not replace it indiscriminately with the newest major: [uuid's documentation](https://github.com/uuidjs/uuid) says CommonJS support ends starting with version 12.

The override must remain covered by Expo config/plugin validation and native prebuild/build QA. It is a deliberate transitive change beyond `xcode`'s declared UUID major range, rather than an upstream `xcode` upgrade. Reassess it when Expo or `xcode` publishes a supported dependency update.

## Scope and remaining release gate

The observed dependency paths belong to Metro's bundling/file-pattern machinery and Expo CLI/config/signing tooling. The local API uses Node.js built-ins, including `node:crypto`, and does not import these packages. This identifies the current paths; it is not a claim that development environments, shipped bundles, or native artifacts are immune. npm classifies much of this toolchain under production dependencies because Expo is a direct dependency, so an `--omit=dev` audit alone does not establish runtime exposure.

Keep Metro and development tools confined to the intended trusted development environment. Review whether build/signing workflows consume untrusted patterns, certificates, or signatures, and assess actual exploitability under the final release architecture. Inspect the exported JavaScript and native dependency inventory as part of native release review. Track upstream fixes; apply them and rerun the relevant build/config tests when available.

Do not run `npm audit fix --force` as a release shortcut. In this graph npm proposed Expo `44.0.6`, React Native `0.72.17`, and an older `expo-sharing` as aggregate fixes. Those proposals would change the SDK/runtime compatibility rather than supply a tested fix for the current project. No compatible patched `braces` or `node-forge` release was available at review time.

Before deploying with client data or submitting native releases, rerun the audit, review the remaining advisories with an accountable engineering/security owner, document exposure and any accepted residual risk, verify the final native artifacts, and complete [production](PRODUCTION.md) and [device QA](QA.md) requirements. Passing TypeScript, API tests, or Hermes export does not resolve an advisory or replace that review.

To refresh the concise findings:

```sh
npm audit
npm ls braces node-forge uuid xcode
```

Record the date, lockfile/source commit, remaining advisory IDs, chosen mitigations, and reviewer. Do not include credentials, session tokens, or client data in a shared audit record.
