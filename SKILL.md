---
name: tab-organizer
description: "Organize browser tabs by work context. Use when the user asks to organize tabs, clean up browser windows, group tabs by project or activity, or manage browser tab clutter. Also triggers on: 'herd my tabs', 'organize tabs', 'group tabs', 'clean up tabs', 'tab organizer', or any reference to sorting/grouping open browser tabs based on work context."
---

# Tab Organizer (herd)

Organize browser tabs into groups based on work context. The herd extension
groups tabs automatically; the MCP service lets AI agents control it.

## Prerequisites

- Herd extension loaded in browser (Edge or Chrome)
- Herd service running: `node ~/source/herd/service/index.js`

## Quick Usage

### From Copilot CLI (natural language)

Just say things like:
- "Organize my tabs"
- "Focus my tabs on the auth migration"
- "Add a rule for figma tabs in the Design category"
- "What tabs do I have open?"

The agent will call the appropriate MCP tools.

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `herd_organize` | Organize all tabs into groups |
| `herd_list_tabs` | List open tabs with classification |
| `herd_set_focus` | Set focus topics (promotes matching tabs) |
| `herd_add_rule` | Add a URL pattern to a category |
| `herd_remove_rule` | Remove a pattern or category |
| `herd_get_rules` | Show all classification rules |
| `herd_status` | Check extension status and last run |

### HTTP API (localhost:9922)

Same tools available as REST endpoints:
```
GET  /tabs       → list all tabs
GET  /status     → extension status
POST /organize   → { "focus_topics": ["auth", "sprint"] }
POST /focus      → { "topics": ["auth"] }
```

## MCP Configuration

Add to your Copilot CLI or Claude MCP config:

```json
{
  "mcpServers": {
    "herd": {
      "command": "node",
      "args": ["C:/Users/YOU/source/herd/service/index.js"]
    }
  }
}
```

## Scheduling

The extension auto-organizes every hour by default (configurable in extension settings).

To additionally push work context on a schedule from Copilot:
```
manage_schedule create --cron "0 * * * *" --prompt "Query WorkIQ for my current focus topics and push them to herd tab organizer"
```

## How It Works

1. Extension runs on a timer (configurable: 15m / 30m / 1h / 2h)
2. Classifies tabs by URL pattern rules
3. If focus topics are set, promotes matching tabs to "Current Focus"
4. Groups tabs within their current window (never moves across windows)
5. MCP service bridges AI agents ↔ extension via local HTTP polling
