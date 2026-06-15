---
name: herd
description: "Control browser tab organization. Use when the user asks to organize tabs, group tabs, focus on a topic, add tab rules, list open tabs, or manage browser tab clutter. Triggers: 'organize my tabs', 'herd my tabs', 'focus on [topic]', 'what tabs do I have', 'add a tab rule', 'group my tabs'."
---

# Herd — Browser Tab Organizer

Organize, group, and focus browser tabs via a local API. The Herd browser extension manages tab groups; you control it by calling these HTTP endpoints.

## Authentication

All requests require the auth token from `~/.herd/auth.json`:

```
Authorization: Bearer <token from ~/.herd/auth.json>
```

Read the token:
```bash
cat ~/.herd/auth.json | jq -r .token
```

## Endpoints

Base URL: `http://localhost:9922`

### List Tabs
```
GET /tabs
```
Returns all open tabs with their title, URL, and assigned category.

### Organize Tabs
```
POST /organize
Content-Type: application/json

{ "focus_topics": ["auth-migration", "sprint-review"] }
```
Runs the tab organizer. Optionally pass focus topics to promote matching tabs to "Current Focus" group. Omit body to organize with current settings.

### Set Focus Topics
```
POST /focus
Content-Type: application/json

{ "topics": ["auth-migration"] }
```
Set focus topics. Matching tabs (by title or URL substring) get grouped as "Current Focus". Pass empty array to clear focus.

### Get Rules
```
GET /rules
```
Returns all tab classification rules (categories, URL patterns, colors).

### Add Rule
```
POST /rules/add
Content-Type: application/json

{ "category": "My Project", "pattern": "*github.com/myorg*", "color": "blue" }
```
Add a URL pattern to a category. Creates the category if it doesn't exist. Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.

### Remove Rule
```
POST /rules/remove
Content-Type: application/json

{ "category": "My Project", "pattern": "*github.com/myorg*" }
```
Remove a pattern from a category. Omit `pattern` to delete the entire category.

### Status
```
GET /status
```
Returns extension status: enabled, last run time, tab count, focus topics.

### Health Check
```
GET /health
```
Returns `{"status":"ok"}` if the bridge is running. No auth required.

## Example Usage

```bash
TOKEN=$(cat ~/.herd/auth.json | jq -r .token)

# Organize tabs
curl -s http://localhost:9922/organize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"focus_topics": ["auth-migration"]}'

# List tabs
curl -s http://localhost:9922/tabs -H "Authorization: Bearer $TOKEN"

# Add a rule
curl -s http://localhost:9922/rules/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category": "Design", "pattern": "*figma.com*", "color": "pink"}'
```

## Notes

- The bridge runs automatically when the browser is open (via native messaging)
- Focus topics match as case-insensitive substrings against tab title and URL
- Organizing never closes tabs — it only assigns group labels and colors
- Each browser window is organized independently
