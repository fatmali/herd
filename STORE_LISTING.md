# Chrome / Edge Web Store Listing

## Extension Name
Herd - Tab Organizer

## Short Description (132 chars max)
Organize tabs into herds. Search across all tabs, recover context after interruptions, and never lose where you were.

## Detailed Description
Herd helps you wrangle browser tab chaos. It groups your tabs into named
collections ("herds") based on rules you define — like grouping all GitHub PRs,
all docs, or all design tools together.

**Key features:**

🔍 **Instant Search** — Find any open tab by title or URL. Fuzzy matching means
you don't need to remember the exact name.

🧠 **Context Recovery** — Come back after an interruption and instantly see what
you were doing. Visual thumbnails and a timeline show your recent activity.

📋 **Rule-based Organization** — Define URL patterns and Herd auto-groups
matching tabs. Ships with sensible defaults for dev tools, docs, and design apps.

⌨️ **Keyboard-first** — Ctrl+Shift+H to search, Ctrl+Shift+L to recover
context. Remap to whatever works for you.

🔒 **Private by design** — No data leaves your device. No accounts. No analytics.
Everything is stored locally in your browser.

## Category
Productivity

## Language
English

## Assets Checklist

- [ ] Icon 128×128 (PNG, store tile)
- [ ] Icon 48×48 (PNG, extensions page)
- [ ] Icon 16×16 (PNG, toolbar)
- [ ] Screenshot 1: Popup showing herds (1280×800)
- [ ] Screenshot 2: Search overlay in action (1280×800)
- [ ] Screenshot 3: Context recovery screen (1280×800)
- [ ] Promotional tile 440×280 (optional but recommended)

## Permission Justifications (required by store review)

| Permission | Justification |
|-----------|--------------|
| `tabs` | Core functionality: reads tab title and URL to classify tabs into groups and power the search feature. |
| `tabGroups` | Core functionality: creates and updates Chrome tab groups to visually organize tabs. |
| `storage` | Stores user-defined rules, herd notes, thumbnails, and preferences locally. No remote sync. |
| `scripting` | Injects the search overlay UI into the active tab when the user triggers the search shortcut. |
| `activeTab` | Captures a thumbnail of the current tab (via captureVisibleTab) for the context recovery feature. |
| `alarms` | Schedules periodic auto-organization at a user-configurable interval. |
| `contextMenus` | Adds a right-click menu item to move tabs into specific herds. |
| `nativeMessaging` | Connects to an optional local AI bridge (localhost only) for programmatic tab organization. Not required for core functionality. |

## Privacy Policy URL
Link to PRIVACY.md hosted on GitHub Pages or similar.

## Developer Notes

- Remove `nativeMessaging` permission if you want to simplify store review (it
  raises questions). The bridge is a power-user feature.
- The `key` field was removed from manifest.json — the store assigns its own
  stable extension ID on publish.
- For local development with a stable ID, add back the key field (see git history
  commit `86b5200` for the value).
