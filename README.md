# Purdue automatic sign-in for Chrome

An unofficial, unpacked Chrome extension that helps with Purdue sign-in on Brightspace and other supported Purdue login pages.

## Install

1. Download this repository as a ZIP and extract it, or clone it with Git.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open the extension's **Options** page, enter your Purdue career account, password, and authenticator setup key or `otpauth://totp/` URI, enable automatic sign-in, and save.
5. Start sign-in from a Purdue service. The extension runs only on the Purdue and Microsoft HTTPS pages listed in its manifest.

Keep the folder in place while the unpacked extension is installed. After updating the files, select **Reload** on the extension's card in `chrome://extensions`.

## Credential storage

The extension stores your password and authenticator enrollment in `chrome.storage.local` on this Chrome profile. Chrome does not encrypt extension storage. Use it only on a device and Chrome profile you control; do not share a profile or an extension settings export containing your credentials. This project does not send credentials to a separate server.

## Controls

Use the extension popup to pause sign-in for 15 minutes, 30 minutes, one hour, or until you resume it. The popup also offers a retry action for the active tab. Account checks and single-submit guards are intended to avoid acting on a different Microsoft account or resubmitting a rejected credential.

This project is not affiliated with or endorsed by Purdue University or Microsoft. Login pages and university policies may change.
