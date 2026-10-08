# Purdue SSO Extension

- Treat this repository as the sole maintained source for Elliot's Chrome extension.
- Edit `content.js` directly; it is not generated from a userscript.
- Keep `manifest.json` and `package.json` versions aligned.
- Run `npm test` and `npm run check` before committing behavior changes.
- Run `npm run package` to create an installable extension-only ZIP in ignored `dist/`.
- Install the repository root in Chrome for development; install the extracted release folder for distribution.
- Keep credentials and authenticator enrollment out of Git, logs, screenshots, and issue reports.
- Preserve manual pause, exact account matching, account guards, and single-submit protection.
- Accept only full `@purdue.edu` email addresses during setup; do not add username-only compatibility or migration logic.
- Keep automation disabled until the user confirms Microsoft completed authenticator enrollment.
- Use synthetic credentials for automated tests; report live browser verification separately.
- Do not recreate or use the retired `Purdue-SSO/purdue-sso/chrome-extension` checkout as a development source.
- Preserve upstream attribution in `NOTICE.md`; upstream is a reference, not a build dependency.

## File map

| Path | Purpose |
| --- | --- |
| `content.js` | Automatic sign-in behavior |
| `setup-core.js` | Shared full-email validation, enrollment parsing, and authenticator helpers |
| `ui.css` | Shared settings and popup design |
| `manifest.json` | Extension version and browser permissions |
| `options.*` | Local account and authenticator setup |
| `popup.*` | Manual pause, resume, retry, and settings |
| `tests/` | Synthetic authentication and extension regression tests |
| `scripts/` | Checks and release packaging |
| `.planning/extension-setup.md` | Local migration status and historical findings |
