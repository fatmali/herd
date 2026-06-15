/**
 * herd — CDP (Chrome DevTools Protocol) client
 * Connects to Chromium browsers, lists tabs, and manages tab groups.
 */

const CDP = require('chrome-remote-interface');

/**
 * Try connecting to a browser on the given port.
 * Returns { client, targets } or null if connection fails.
 */
async function connect(port = 9222) {
  try {
    const targets = await CDP.List({ port });
    return { port, targets: targets.filter(t => t.type === 'page') };
  } catch (err) {
    return null;
  }
}

/**
 * Connect to all configured browsers, return combined tab list.
 * Each tab: { id, title, url, browserPort, browserName }
 */
async function listTabs(browsers) {
  const allTabs = [];

  for (const browser of browsers) {
    const result = await connect(browser.port);
    if (!result || result.targets.length === 0) continue;

    // Try the richer Target domain first, fall back to HTTP list
    let client;
    try {
      client = await CDP({ port: browser.port });
      const { targetInfos } = await client.Target.getTargets();
      const pages = targetInfos.filter(t => t.type === 'page');

      if (pages.length > 0) {
        for (const target of pages) {
          allTabs.push({
            id: target.targetId,
            title: target.title,
            url: target.url,
            browserPort: browser.port,
            browserName: browser.name,
          });
        }
        continue; // Got tabs from Target domain, skip HTTP fallback
      }
    } catch {
      // Target domain unavailable, use HTTP list
    } finally {
      if (client) await client.close().catch(() => {});
    }

    // Fallback: use the HTTP /json/list response
    for (const target of result.targets) {
      allTabs.push({
        id: target.id,
        title: target.title,
        url: target.url,
        browserPort: browser.port,
        browserName: browser.name,
      });
    }
  }

  return allTabs;
}

/**
 * Execute a script in a specific tab's context (for tab group management).
 * Chrome Tab Groups API is only accessible from the chrome.tabGroups extension API,
 * but we can use CDP's Runtime.evaluate on a chrome:// page or use the
 * Chrome DevTools Protocol's direct tab management.
 *
 * For tab grouping, we use the Chrome-specific CDP commands available in newer versions.
 */
async function executeInBrowser(port, expression) {
  let client;
  try {
    client = await CDP({ port });
    await client.Runtime.enable();
    const result = await client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result.value;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Get window ID for each tab. This lets us group tabs within their current window
 * rather than moving them across windows.
 * Returns tabs enriched with windowId.
 */
async function getTabsWithWindows(port) {
  let client;
  try {
    client = await CDP({ port });
    const { targetInfos } = await client.Target.getTargets();
    const pages = targetInfos.filter(t => t.type === 'page');

    const enriched = [];
    for (const page of pages) {
      let windowId = null;
      try {
        const result = await client.Browser.getWindowForTarget({ targetId: page.targetId });
        windowId = result.windowId;
      } catch {
        // Some targets (devtools, extensions) don't have a window
      }
      enriched.push({
        id: page.targetId,
        title: page.title,
        url: page.url,
        windowId,
        browserPort: port,
      });
    }

    return enriched;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Get all unique window IDs from a list of tabs.
 */
function getWindowIds(tabs) {
  return [...new Set(tabs.map(t => t.windowId).filter(Boolean))];
}

module.exports = { connect, listTabs, getTabsWithWindows, getWindowIds, executeInBrowser };
