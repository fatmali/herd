/**
 * herd - shared default rules
 * Used by both the extension and the service.
 */
module.exports = {
  'Code Review': {
    patterns: ['github.com/*/pull/', 'dev.azure.com/*/pullrequest/', '*.visualstudio.com/*pullrequest*', 'gitlab.com/*/merge_requests/'],
    color: 'green'
  },
  'Work Items': {
    patterns: ['dev.azure.com/*/workitems', 'dev.azure.com/*/_boards', '*.visualstudio.com/*workitem*', 'jira.*.com', 'linear.app'],
    color: 'blue'
  },
  'Incidents': {
    patterns: ['*microsofticm.com*', '*pagerduty.com*', '*opsgenie.com*', '*servicenow.com*'],
    color: 'red'
  },
  'Design': {
    patterns: ['*figma.com*', '*canva.com*', '*miro.com*'],
    color: 'pink'
  },
  'Documentation': {
    patterns: ['*wiki*', 'docs.*', 'notion.so*', 'learn.microsoft.com*', '*confluence*', '*loop.cloud.microsoft*'],
    color: 'purple'
  },
  'AI & Copilot': {
    patterns: ['*m365.cloud.microsoft*chat*', '*m365.cloud.microsoft*agent*', '*copilot*', 'chatgpt.com*', 'claude.ai*'],
    color: 'orange'
  },
  'Email': {
    patterns: ['outlook.office.com*', 'outlook.live.com*', 'mail.google.com*'],
    color: 'yellow'
  },
  'Meetings & Chat': {
    patterns: ['teams.microsoft.com*', 'zoom.us*', 'meet.google.com*', '*slack.com*'],
    color: 'red'
  },
  'Dev Tools': {
    patterns: ['localhost:*', '127.0.0.1:*', '*github.dev*', '*codespaces*', '*vscode.dev*'],
    color: 'cyan'
  },
};
