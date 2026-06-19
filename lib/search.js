/**
 * Herd Search — fuzzy matching utilities
 * Shared between the content script overlay and tests.
 */

function fuzzyScore(query, text) {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match — highest score
  if (t.includes(q)) {
    const idx = t.indexOf(q);
    return 100 + (idx === 0 ? 50 : 0) + (q.length / t.length) * 30;
  }

  // Word-boundary subsequence
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatchIdx = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '/' || t[ti - 1] === '-' || t[ti - 1] === '.') {
        score += 10;
      }
      if (ti === lastMatchIdx + 1) {
        consecutive++;
        score += consecutive * 3;
      } else {
        consecutive = 0;
      }
      score += 3;
      lastMatchIdx = ti;
    }
  }

  if (qi < q.length) return 0;
  return score;
}

function scoreTab(query, tab) {
  const titleScore = fuzzyScore(query, tab.title) * 1.5;
  const urlScore = fuzzyScore(query, tab.url);
  const herdScore = fuzzyScore(query, tab.herdName) * 1.2;
  return Math.max(titleScore, urlScore, herdScore);
}

function searchTabs(query, tabs) {
  if (!query || !query.trim()) {
    return tabs.slice(0, 8);
  }
  return tabs
    .map(tab => ({ ...tab, score: scoreTab(query, tab) }))
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

module.exports = { fuzzyScore, scoreTab, searchTabs };
