# 🐑 herd

**Herd your tabs. Never lose context again.**

An open-source tab organizer that automatically groups your browser tabs by activity. Install the extension and forget about it — or connect it to your AI agent for context-aware organization.

## The Problem

You open tabs for a meeting, a code review, a doc, a Jira ticket, Stack Overflow... and suddenly you have 47 tabs and no idea which ones belong together or why you opened them.

## The Solution

**herd** groups your tabs automatically — by Code Review, Documentation, Incidents, Design, etc. Tell your AI agent "focus on auth migration" and related tabs get highlighted.

```
📂 Tab Groups:

  [yellow] 🎯 Current Focus (5 tabs)
       • PR #4421 - Migrate auth to MSAL
       • Auth migration design doc
       • Sprint Review Notes

  [green] Code Review (3 tabs)
  [red] Incidents (6 tabs)
  [purple] Documentation (2 tabs)
  [cyan] Dev Tools (2 tabs)
```

## Quick Start

### 1. Install the extension

1. Open `edge://extensions` or `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Done. Your tabs are now grouped automatically every hour.

### 2. Configure (optional)

- **Click the herd icon** → tweak focus topics, trigger organize
- **Right-click any tab** → "Herd: Add tab to category" → pick a group
- **Extension settings** → manage all rules, colors, schedule

### 3. Connect to AI agent (optional, for power users)

```bash
cd ~/source/herd && npm install
node service/index.js  # Starts MCP + HTTP server
```

Add to your MCP config (Copilot CLI, Claude, etc.):
```json
{
  "mcpServers": {
    "herd": {
      "command": "node",
      "args": ["/path/to/herd/service/index.js"]
    }
  }
}
```

Now say: *"organize my tabs, focus on the auth migration"*

## Features

| Feature | How |
|---------|-----|
| Auto-group tabs by activity | Extension runs on timer (15m–2h) |
| Right-click → assign to category | Context menu on any tab |
| Custom rules (URL patterns) | Extension settings page |
| AI-powered focus | MCP tool: `herd_set_focus` |
| Natural language control | Via any MCP-compatible AI agent |
| Export/import rules | Share your config with teammates |
| Per-window grouping | Never moves tabs across windows |

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ Browser Extension │◄────│  Local Service       │◄────│ AI Agent         │
│ (groups tabs)     │poll │  (Node.js)           │MCP  │ (Copilot/Claude) │
│                   │────►│  HTTP :9922 + stdio  │────►│                  │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
```

- **Extension** — standalone, works without the service. Handles all tab manipulation.
- **Service** — bridges AI agents to the extension. Exposes MCP tools + HTTP API.
- **AI Agent** — interprets natural language, queries work context, calls MCP tools.

## MCP Tools

| Tool | Description |
|------|-------------|
| `herd_organize` | Organize tabs into groups (optional: set focus topics) |
| `herd_list_tabs` | List all tabs with classification |
| `herd_set_focus` | Set focus keywords (matching tabs → "Current Focus") |
| `herd_add_rule` | Add URL pattern to a category |
| `herd_remove_rule` | Remove a pattern or whole category |
| `herd_get_rules` | Get current classification rules |
| `herd_status` | Extension status, last run, schedule |

## Default Categories

| Category | Matches | Color |
|----------|---------|-------|
| Code Review | GitHub PRs, ADO PRs, GitLab MRs | 🟢 green |
| Work Items | ADO boards, Jira, Linear | 🔵 blue |
| Incidents | ICM, PagerDuty, ServiceNow | 🔴 red |
| Design | Figma, Canva, Miro | 🩷 pink |
| Documentation | wikis, docs.*, Notion, Loop | 🟣 purple |
| AI & Copilot | M365 Copilot, ChatGPT, Claude | 🟠 orange |
| Email | Outlook, Gmail | 🟡 yellow |
| Meetings & Chat | Teams, Zoom, Slack | 🔴 red |
| Dev Tools | localhost, Codespaces, vscode.dev | 🔵 cyan |

## Configuration

All configuration happens through the extension UI:
- **Popup** → quick organize, set focus, toggle auto
- **Options page** → full rule management (add/edit/delete, colors, schedule)
- **Right-click menu** → instantly assign any tab to a category

Rules are stored in the browser and sync with your profile.

## Contributing

PRs welcome! Ideas:

- [ ] Firefox support
- [ ] Publish to Edge/Chrome extension stores
- [ ] Native messaging (replace HTTP polling with direct pipe)
- [ ] Tab activity tracking (time-based staleness detection)
- [ ] WorkIQ integration module (auto-fetch focus from M365)
- [ ] Team-shared rule sets

## License

MIT
