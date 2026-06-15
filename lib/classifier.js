/**
 * herd — tab classifier
 * Classifies tabs into categories based on URL patterns and work context.
 */

/**
 * Match a URL against a glob-like pattern.
 * Supports: * (any chars, greedy), literal match.
 */
function matchPattern(url, pattern) {
  // Normalize: strip protocol for matching
  const normalizedUrl = url.replace(/^https?:\/\//, '').toLowerCase();
  const normalizedPattern = pattern.replace(/^https?:\/\//, '').toLowerCase();

  // Convert glob pattern to regex
  // Each * matches any number of characters (including / for path traversal)
  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex chars except *
    .replace(/\*/g, '.*');                   // * → .*

  try {
    const regex = new RegExp(regexStr);
    return regex.test(normalizedUrl);
  } catch {
    return normalizedUrl.includes(normalizedPattern);
  }
}

/**
 * Classify a single tab based on category patterns.
 * Returns the category name or the ungrouped category.
 */
function classifyTab(tab, categories, ungroupedCategory = 'Other') {
  for (const [categoryName, categoryConfig] of Object.entries(categories)) {
    const patterns = categoryConfig.patterns || [];
    for (const pattern of patterns) {
      if (matchPattern(tab.url, pattern)) {
        return categoryName;
      }
    }
  }
  return ungroupedCategory;
}

/**
 * Classify all tabs, returning a map of category → tabs[].
 */
function classifyAll(tabs, categories, ungroupedCategory = 'Other') {
  const groups = {};

  for (const tab of tabs) {
    // Skip internal browser pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url === 'about:blank') {
      continue;
    }

    const category = classifyTab(tab, categories, ungroupedCategory);
    if (!groups[category]) groups[category] = [];
    groups[category].push(tab);
  }

  return groups;
}

/**
 * Enhanced classification using work context.
 * Tabs related to the current meeting/project get promoted to "Current Focus".
 */
function classifyWithContext(tabs, categories, workContext, ungroupedCategory = 'Other') {
  const groups = classifyAll(tabs, categories, ungroupedCategory);

  if (!workContext || !workContext.focusTopics) return groups;

  // Promote tabs matching current focus topics
  const focusGroup = [];
  const focusKeywords = workContext.focusTopics.map(t => t.toLowerCase());

  for (const [category, categoryTabs] of Object.entries(groups)) {
    const remaining = [];
    for (const tab of categoryTabs) {
      const titleLower = (tab.title || '').toLowerCase();
      const urlLower = (tab.url || '').toLowerCase();
      const isRelevant = focusKeywords.some(kw =>
        titleLower.includes(kw) || urlLower.includes(kw)
      );

      if (isRelevant) {
        focusGroup.push(tab);
      } else {
        remaining.push(tab);
      }
    }
    if (remaining.length > 0) {
      groups[category] = remaining;
    } else {
      delete groups[category];
    }
  }

  if (focusGroup.length > 0) {
    groups['🎯 Current Focus'] = focusGroup;
  }

  return groups;
}

module.exports = { matchPattern, classifyTab, classifyAll, classifyWithContext };
