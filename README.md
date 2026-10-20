# Purdue automatic sign-in for Chrome

An unofficial, unpacked Chrome extension that helps with Purdue sign-in on Brightspace and other supported Purdue login pages. This repository is the maintained source for the extension; no userscript or separate Purdue SSO checkout is required.

## Install

1. Download the extension ZIP from the [latest release](https://github.com/ElliotDrel/purdue-sso-extension/releases/latest) and extract it, or clone this repository with Git.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open the extension popup and choose **Start setup**. Enter your full Purdue email address, such as `you@purdue.edu`, your password, and your campus. A username without `@purdue.edu` is not accepted.
5. Follow the authenticator instructions, paste the setup key, and choose **Save key and show code**. Enter the displayed code on Microsoft's setup page; it refreshes automatically and can be copied with **Copy code**.
6. After Microsoft accepts the code and finishes adding the authenticator, confirm that in the extension and choose **Enable automatic sign-in**. Automation remains off until this step is complete.
7. Choose **Try Purdue Brightspace**, or start sign-in from another supported Purdue service.

Keep the folder in place while the unpacked extension is installed. After updating the files, select **Reload** on the extension's card in `chrome://extensions`.

## Authenticator setup and troubleshooting

Use an existing `otpauth://totp/` enrollment URI or authenticator setup key, rather than a six-digit code. Add an authenticator method through Microsoft Security info using your existing MFA method, choose the different-authenticator option and **Can't scan QR Code?**, and enter that setup key locally in Options. Use the current code displayed in Options to finish enrollment. Keep your existing method until the new method works.

Start sign-in from the service you want to use, rather than the bare `sso.purdue.edu` address. Use **Retry on this tab** after resolving a rejected credential or interrupted form. Pause automation when you want to handle sign-in yourself. Outlook account routing is described below.

## Credential storage

The extension stores your password and authenticator enrollment in `chrome.storage.local` on this Chrome profile. Chrome does not encrypt extension storage. Use it only on a device and Chrome profile you control; do not share a profile or an extension settings export containing your credentials. This project does not send credentials to a separate server.

## Controls

Use the extension popup to pause sign-in for 15 minutes, 30 minutes, one hour, or until you resume it. The popup also offers a retry action for the active tab. Account checks and single-submit guards are intended to avoid acting on a different Microsoft account or resubmitting a rejected credential.

## Outlook account selection

If Microsoft has already started password or security-key sign-in for a different account on a Purdue sign-in page, the extension uses the page’s Back control once to return to account selection. It then selects the saved career account.

Enter the full email address of the account you want to use during setup. Outside an Outlook navigation flow, Microsoft account selection uses only an exact match for that saved address. On a Purdue-branded picker where it is missing, the extension chooses **Use another account** and continues with your configured account. It does not choose a different saved account merely because it appears first. Within Outlook flows, the resolver described below takes precedence.

### Outlook account choice (v1.2.0)

The popup has one setting: **Open Outlook links using**. The default is **Last account selected**; alternatives are **Always ask** and **A preferred account**. Routing works independently of Purdue credential enrollment and the automatic-sign-in pause. Account identifiers can use any email domain; Purdue credential setup still accepts only full Purdue addresses.

The shared resolver applies an explicit account hint or mailbox destination first, then the selected preference. In Last account selected mode, the last confirmed mailbox is used, with the configured sign-in account as the initial fallback. If no account can be resolved, a small local chooser asks for an email address. It never asks for a password: Microsoft handles authentication. Explicit/indexed mailbox destinations are preserved even in Always ask mode. A new choice in the chooser or Microsoft's account picker takes precedence over earlier hints for that navigation.

Links from ChatGPT and other apps are intercepted automatically. The existing Chrome rule keeps top-level Outlook Mail, Calendar, People, and homepage navigation on `outlook.cloud.microsoft`. A small set of Chrome request rules adds the resolved `login_hint` before the request reaches Outlook, including cold HTTP sign-in redirects. An early content script supplies the local chooser when needed and confirms the loaded mailbox. Existing query encoding, message IDs, and fragments are preserved. No source-link edits are needed. Legacy `/owa` handlers, authentication callbacks, APIs, frames, and consumer Outlook hosts are not rewritten.

After an intentional navigation, the Mail sidebar's primary mailbox root must confirm the selected address before it is remembered. Recipients and message bodies are never used as identity evidence. Background reloads, focusing old tabs, failed sign-ins, and delayed confirmations from older selections cannot change the remembered account. If the current page does not expose a verified mailbox root (for example a standalone item or calendar view), the last confirmed account is retained. If Outlook visibly opens a different mailbox, a notice offers the account chooser rather than silently remembering it or retrying accounts.

The same per-tab choice accompanies an Outlook sign-in through Microsoft/Purdue authentication pages. Existing sessions for the selected account can be chosen automatically when sign-in automation is enabled. Saved password/TOTP automation is used only if that selected address exactly matches the enrolled Purdue account. Other accounts stay with Microsoft's manual sign-in flow; they are never replaced by the saved career account. Manual pause and disabled automation still prevent automatic clicks and credential submission. Unrelated services keep the existing Purdue sign-in behavior.

Only the last confirmed email and the selected preference are persisted locally in the Chrome profile. Temporary per-tab account intent expires after ten minutes and is cleared when leaving the Outlook authentication chain or closing the tab; it survives service-worker restarts but not browser restarts. Expired Outlook sign-in intent yields to manual selection. No account history, extra credential store, cookie synchronization, or stored message URL is added. The extension is disabled in private browsing so profile account hints cannot leak into an incognito session. Chrome 106 or newer is required.

After updating, open `chrome://extensions/?id=nlaffmbabjcfoojdhndncdlmggadejgk`, reload **Purdue automatic sign-in**, and confirm version **1.2.0**. Chrome may ask for the additional Outlook site access and navigation permission. Select each account through your existing bookmark and allow its Mail sidebar to load to seed the remembered account. Existing Purdue credentials and authenticator setup are retained. UI and routing behavior in the installed extension still require live verification after reload; automated tests use synthetic identities.

The earlier hostname-only v1.1.x routing is superseded by this resolver. Mailbox ownership still matters: routing cannot make one mailbox's message ID accessible in another, and the extension does not try accounts to discover a message's owner.

This project is not affiliated with or endorsed by Purdue University or Microsoft. Login pages and university policies may change.

## Development and distribution

Requires Node.js 20 or newer, with no package dependencies to install. Edit `content.js` directly. Run `npm test` for synthetic authentication, settings, popup, campus, and account-selection coverage, then `npm run check` for syntax and version consistency. Keep `package.json` and `manifest.json` versions aligned.

The guided setup and popup share validation and authenticator helpers in `setup-core.js`; all screens share `ui.css`. Automated onboarding tests cover full-email validation, enrollment confirmation, code rollover and copying, incomplete setup, and storage failures. Changing or disabling saved configuration stops any active content script; reload an open sign-in page to use the updated settings.

Run `npm run package` to create an extension-only folder and ZIP in `dist/`. The ZIP contains only runtime files, this README, and attribution. The [Verify extension workflow](https://github.com/ElliotDrel/purdue-sso-extension/actions) also creates a downloadable ZIP artifact on each successful run. Extract it and load the folder containing `manifest.json`.

See `NOTICE.md` for attribution. The original userscript is a reference, not a build dependency.
