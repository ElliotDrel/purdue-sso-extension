# Extension setup findings

Updated October 8, 2026 (America/Indianapolis). The October 1 findings below are superseded where noted.

## Current source of truth

- Maintain the extension in this repository, per Elliot's explicit decision.
- Edit `content.js` directly; no userscript generator is required.
- Maintain version `1.1.0` in `manifest.json` and `package.json`.
- Use guided setup: full Purdue email and password, authenticator enrollment, then explicit enrollment confirmation before enabling automation.
- Store a full email address under `email`; derive the career-account portion only for Purdue forms that require it.
- Do not implement username-only compatibility or data migration; Elliot specified there are no users yet.
- Run adapted authentication, settings, popup, campus, and account-selection tests with `npm test`.
- Run syntax/version checks with `npm run check`, and create an extension-only ZIP with `npm run package`.
- Preserve upstream attribution in `NOTICE.md` and historical commits on Elliot's remote fork.
- Keep Chrome migration pending: its last user-confirmed loaded path is the old `Purdue-SSO/purdue-sso/chrome-extension` folder, version `1.0.13`.
- Supersede the prior settings-migration recommendation; compatibility is out of scope per Elliot's fresh-user direction.
- Delete the obsolete checkout only after the replacement installation is configured and verified.
- Keep automatic password/TOTP mode; alternate credential designs are outside this migration.

## Historical October 1 findings (superseded)

- Standalone checkout is clean at commit `46ea373`, version `1.0.13`.
- Root files include the manifest, content script, settings page, popup, and README; no test runner is present.
- Automatic sign-in currently requires username, password, and TOTP enrollment in Chrome local extension storage.
- The content script handles Stay signed in separately but has no remembered-MFA preference.
- The content script header references a generator absent from this standalone repository and needs correction when implementation begins.
- Existing flow tests in the older Purdue-SSO checkout provide reusable regression fixtures. They have been inspected, not run in this checkout.
- Preserve account matching, manual pause, passwordless recovery, and submission guards. Do not modify Brightspace MCP configuration or trigger repeated live sign-ins.
- Superseded design discussion: session-first credentials/manual MFA versus retained automatic password/TOTP mode. No alternate mode is being implemented in this migration.

Browser verification and tenant remember-MFA duration remain unverified.
