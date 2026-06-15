const { parseWorkContext } = require('../lib/context');

describe('parseWorkContext', () => {
  test('parses bullet list into focus topics', () => {
    const input = `- Auth migration
- Sprint review prep
- Homepage redesign`;
    const result = parseWorkContext(input);
    expect(result.focusTopics).toContain('Auth migration');
    expect(result.focusTopics).toContain('Sprint review prep');
    expect(result.focusTopics).toContain('Homepage redesign');
  });

  test('parses numbered list', () => {
    const input = `1. Project Alpha
2. Bug triage
3. Design review`;
    const result = parseWorkContext(input);
    expect(result.focusTopics).toHaveLength(3);
    expect(result.focusTopics[0]).toBe('Project Alpha');
  });

  test('strips leading markers', () => {
    const input = `• First topic
* Second topic
- Third topic`;
    const result = parseWorkContext(input);
    expect(result.focusTopics[0]).toBe('First topic');
    expect(result.focusTopics[1]).toBe('Second topic');
    expect(result.focusTopics[2]).toBe('Third topic');
  });

  test('returns empty for null input', () => {
    const result = parseWorkContext(null);
    expect(result.focusTopics).toHaveLength(0);
    expect(result.summary).toBeNull();
  });

  test('returns empty for empty string', () => {
    const result = parseWorkContext('   ');
    expect(result.focusTopics).toHaveLength(0);
  });

  test('caps at 10 topics', () => {
    const input = Array.from({ length: 15 }, (_, i) => `- Topic ${i + 1}`).join('\n');
    const result = parseWorkContext(input);
    expect(result.focusTopics).toHaveLength(10);
  });

  test('skips very short lines', () => {
    const input = `- OK
- ab
- Valid topic here`;
    const result = parseWorkContext(input);
    expect(result.focusTopics).not.toContain('ab');
    expect(result.focusTopics).toContain('Valid topic here');
  });

  test('preserves raw summary', () => {
    const input = 'Working on auth and billing';
    const result = parseWorkContext(input);
    expect(result.summary).toBe(input);
  });
});
