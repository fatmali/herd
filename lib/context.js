/**
 * herd — work context provider
 * Fetches current work context from WorkIQ or accepts piped input.
 * Returns focus topics, current meetings, and active projects.
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Query WorkIQ for current work context.
 * Returns { focusTopics: string[], currentMeeting: string|null, summary: string }
 */
async function getWorkContext() {
  try {
    // Try WorkIQ MCP tool (available in Copilot CLI context)
    const question = "What am I currently working on? List my current meeting (if any), " +
      "top 3 active projects or topics from today's emails and chats. " +
      "Return as a brief list of keywords/topic names only.";

    // Try the workiq CLI directly
    const result = execSync(`workiq ask "${question}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseWorkContext(result);
  } catch (err) {
    // WorkIQ not available — return empty context
    return { focusTopics: [], currentMeeting: null, summary: null, error: err.message };
  }
}

/**
 * Parse WorkIQ response into structured context.
 */
function parseWorkContext(rawResponse) {
  if (!rawResponse || !rawResponse.trim()) {
    return { focusTopics: [], currentMeeting: null, summary: null };
  }

  const lines = rawResponse.trim().split('\n').filter(l => l.trim());

  // Extract keywords — take words/phrases that look like project names or topics
  const focusTopics = [];
  for (const line of lines) {
    // Strip bullet points, numbers, etc.
    const cleaned = line.replace(/^[\s\-*•\d.]+/, '').trim();
    if (cleaned.length > 2 && cleaned.length < 100) {
      focusTopics.push(cleaned);
    }
  }

  return {
    focusTopics: focusTopics.slice(0, 10), // cap at 10 topics
    currentMeeting: null, // TODO: parse meeting specifically
    summary: rawResponse.trim(),
  };
}

/**
 * Accept context from stdin (for piping from other tools).
 */
function getContextFromStdin() {
  try {
    const input = require('fs').readFileSync(0, 'utf-8'); // fd 0 = stdin
    if (input.trim()) {
      return parseWorkContext(input);
    }
  } catch {
    // No stdin available
  }
  return null;
}

module.exports = { getWorkContext, parseWorkContext, getContextFromStdin };
