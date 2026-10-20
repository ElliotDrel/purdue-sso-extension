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

Start sign-in from the service you want to use, rather than the bare `sso.purdue.edu` address. Use **Retry on this tab** after resolving a rejected credential or interrupted form. Pause automation before deliberately choosing a different account.

## Credential storage

The extension stores your password and authenticator enrollment in `chrome.storage.local` on this Chrome profile. Chrome does not encrypt extension storage. Use it only on a device and Chrome profile you control; do not share a profile or an extension settings export containing your credentials. This project does not send credentials to a separate server.

## Controls

Use the extension popup to pause sign-in for 15 minutes, 30 minutes, one hour, or until you resume it. The popup also offers a retry action for the active tab. Account checks and single-submit guards are intended to avoid acting on a different Microsoft account or resubmitting a rejected credential.

## Outlook account selection

If Microsoft has already started password or security-key sign-in for a different account on a Purdue sign-in page, the extension uses the page’s Back control once to return to account selection. It then selects the saved career account.

Enter the full email address of the account you want to use during setup. On Microsoft’s account picker, including generic Outlook sign-in pages, the extension selects only an exact match for that saved address. On a Purdue-branded picker where it is missing, the extension chooses **Use another account** and continues with your configured account. It does not choose a different saved account merely because it appears first.

### Mail deep links from ChatGPT and other apps

Starting with v1.1.1 for compose links and v1.1.2 for message-reading links, top-level `https://outlook.office.com/mail/deeplink/compose` and `https://outlook.office.com/mail/deeplink/read/<message-id>` links automatically redirect to the same path on `outlook.cloud.microsoft`, including links embedded in an app's UI. Chrome performs the redirect before the old hostname loads. Only the hostname changes: message IDs, recipients, subject, body, account hints, and other URL contents stay intact. Other Outlook pages and embedded frame requests are untouched. The rule requires access only to `https://outlook.office.com/*`; it does not inspect ChatGPT pages or use a background worker.

Use account-switching bookmarks on that same destination hostname, for example `https://outlook.cloud.microsoft/mail/?login_hint=you%40purdue.edu`. In live testing with two signed-in Purdue accounts, compose on this hostname followed the account most recently selected through those bookmarks, including a compose link opened in a new tab. Merely focusing an older Outlook tab is not an account switch. This extension does not maintain its own account history or guarantee Outlook's selection after a session expires. Explicit account hints are preserved rather than replaced.

The redirect works independently of the popup's automatic sign-in pause. If a Microsoft sign-in page appears, the existing automation still selects the configured career account; pause it when deliberately authenticating as another account. This supersedes the pre-v1.1.1 behavior where compose links on `outlook.office.com` could use a different remembered mailbox from the account-switching bookmarks.

After updating, open `chrome://extensions`, find **Purdue automatic sign-in**, and select **Reload**. Confirm the card shows **1.1.2** and that its loaded folder is this repository (or the updated extracted release folder). If Chrome asks for the new Outlook site access, approve it for the redirect to work. Keep site access enabled for `outlook.office.com`; an on-click-only grant cannot redirect a fresh navigation automatically. Click the desired account bookmark once, then try the original compose link again. ChatGPT does not need to be refreshed, and saved account/authenticator setup does not need to be repeated.

Superseded in v1.1.2: message-reading links were previously excluded from the redirect. They now use the same hostname as compose links. A message ID still belongs to a particular mailbox: select its owning account with the bookmark before opening it; this extension cannot open that message in another mailbox or infer its owner from the opaque ID. When Microsoft displays an account picker, the saved career account remains the sign-in default.

This project is not affiliated with or endorsed by Purdue University or Microsoft. Login pages and university policies may change.

## Development and distribution

Requires Node.js 20 or newer, with no package dependencies to install. Edit `content.js` directly. Run `npm test` for synthetic authentication, settings, popup, campus, and account-selection coverage, then `npm run check` for syntax and version consistency. Keep `package.json` and `manifest.json` versions aligned.

The guided setup and popup share validation and authenticator helpers in `setup-core.js`; all screens share `ui.css`. Automated onboarding tests cover full-email validation, enrollment confirmation, code rollover and copying, incomplete setup, and storage failures. Changing or disabling saved configuration stops any active content script; reload an open sign-in page to use the updated settings.

Run `npm run package` to create an extension-only folder and ZIP in `dist/`. The ZIP contains only runtime files, this README, and attribution. The [Verify extension workflow](https://github.com/ElliotDrel/purdue-sso-extension/actions) also creates a downloadable ZIP artifact on each successful run. Extract it and load the folder containing `manifest.json`.

See `NOTICE.md` for attribution. The original userscript is a reference, not a build dependency.
