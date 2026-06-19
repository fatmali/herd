# Privacy Policy — Herd Tab Organizer

**Last updated:** June 2025

## Summary

Herd does **not** collect, transmit, or sell any user data. Everything stays on
your device.

## What Herd stores

| Data | Where | Purpose |
|------|-------|---------|
| Tab grouping rules | `chrome.storage.local` | Organize tabs by URL patterns |
| Herd names & notes | `chrome.storage.local` | Let you label your tab groups |
| Tab thumbnails | `chrome.storage.local` | Visual context recovery |
| Extension preferences | `chrome.storage.local` | Remember your settings |

## What Herd does NOT do

- ❌ No analytics or telemetry
- ❌ No data sent to external servers
- ❌ No third-party SDKs or trackers
- ❌ No account or sign-in required
- ❌ No browsing history collected beyond active tab metadata

## Optional AI bridge

If you install the optional local AI bridge (`npx herd-tabs --install`), it runs
a localhost-only server on your machine. No data leaves your device — it
communicates only between the extension and a local process over `127.0.0.1`.

## Permissions explained

| Permission | Why |
|-----------|-----|
| `tabs` | Read tab titles/URLs to organize and search them |
| `tabGroups` | Create and manage Chrome tab groups ("herds") |
| `storage` | Save your rules, notes, and thumbnails locally |
| `scripting` | Inject the search overlay into the active tab |
| `activeTab` | Capture thumbnail of the tab you just left |
| `alarms` | Schedule periodic auto-organization |
| `contextMenus` | Right-click "Move to herd" menu |
| `nativeMessaging` | Connect to optional local AI bridge |

## Contact

Questions? Open an issue on the [GitHub repository](https://github.com/user/herd).
