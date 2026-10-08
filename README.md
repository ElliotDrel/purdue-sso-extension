# Purdue automatic sign-in for Chrome

An unofficial, unpacked Chrome extension that helps with Purdue sign-in on Brightspace and other supported Purdue login pages. This repository is the maintained source for the extension; no userscript or separate Purdue SSO checkout is required.

## Install

1. Download the extension ZIP from the [latest release](https://github.com/ElliotDrel/purdue-sso-extension/releases/latest) and extract it, or clone this repository with Git.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open the extension's **Options** page, enter your Purdue career account, password, and authenticator setup key or `otpauth://totp/` URI, enable automatic sign-in, and save.
5. Start sign-in from a Purdue service. The extension runs only on the Purdue and Microsoft HTTPS pages listed in its manifest.

Keep the folder in place while the unpacked extension is installed. After updating the files, select **Reload** on the extension's card in `chrome://extensions`.

## Migrate from the old installation

Keep the old extension installed until the replacement works, and keep your existing MFA method available. Turn off the old copy, choose **Load unpacked**, and select this repository's root folder containing `manifest.json`. Configure the replacement locally in Options. A new install path can create a new extension ID, so settings may not transfer automatically; never put your password or authenticator setup key in chat or Git.

Confirm version `1.0.14` or newer, pause/resume behavior, and a normal Purdue sign-in before removing the old extension and deleting the old checkout. After reloading an extension, reload open sign-in tabs too. If the version is unexpected, check **Details → Loaded from**.

## Authenticator setup and troubleshooting

Use an existing `otpauth://totp/` enrollment URI or authenticator setup key, rather than a six-digit code. Add an authenticator method through Microsoft Security info using your existing MFA method, choose the different-authenticator option and **Can't scan QR Code?**, and enter that setup key locally in Options. Use the current code displayed in Options to finish enrollment. Keep your existing method until the new method works.

Start sign-in from the service you want to use, rather than the bare `sso.purdue.edu` address. Use **Retry on this tab** after resolving a rejected credential or interrupted form. Pause automation before deliberately choosing a different account.

## Credential storage

The extension stores your password and authenticator enrollment in `chrome.storage.local` on this Chrome profile. Chrome does not encrypt extension storage. Use it only on a device and Chrome profile you control; do not share a profile or an extension settings export containing your credentials. This project does not send credentials to a separate server.

## Controls

Use the extension popup to pause sign-in for 15 minutes, 30 minutes, one hour, or until you resume it. The popup also offers a retry action for the active tab. Account checks and single-submit guards are intended to avoid acting on a different Microsoft account or resubmitting a rejected credential.

## Outlook account selection

If Microsoft has already started password or security-key sign-in for a different account on a Purdue sign-in page, the extension uses the page’s Back control once to return to account selection. It then selects the saved career account.

Set the career account in Options to `edrel` to make `edrel@purdue.edu` the automatic sign-in account. On Microsoft’s account picker, including generic Outlook sign-in pages, the extension selects only an exact match for that saved account. On a Purdue-branded picker where it is missing, the extension chooses **Use another account** and continues with the saved career account. It does not select BuildPurdue merely because that account appears first.

An Outlook message link without a mailbox address does not tell the extension which account owns the message. The saved career account is the default. If Outlook opens an already signed-in mailbox without showing a Microsoft sign-in page, this extension does not run there; switch accounts in Outlook. Pause automatic sign-in from the popup when you want to choose a different account manually.

This project is not affiliated with or endorsed by Purdue University or Microsoft. Login pages and university policies may change.

## Development and distribution

Requires Node.js 20 or newer, with no package dependencies to install. Edit `content.js` directly. Run `npm test` for synthetic authentication, settings, popup, campus, and account-selection coverage, then `npm run check` for syntax and version consistency. Keep `package.json` and `manifest.json` versions aligned.

Run `npm run package` to create an extension-only folder and ZIP in `dist/`. The ZIP contains only runtime files, this README, and attribution. The [Verify extension workflow](https://github.com/ElliotDrel/purdue-sso-extension/actions) also creates a downloadable ZIP artifact on each successful run. Extract it and load the folder containing `manifest.json`.

See `NOTICE.md` for attribution. The original userscript is a reference, not a build dependency.
