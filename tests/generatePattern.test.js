/**
 * Tests for the generatePattern function from the extension background.js.
 * We extract and eval it here since background.js is designed for a service worker context.
 */

const fs = require('fs');
const path = require('path');

// Extract generatePattern from background.js
const bgCode = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf-8');
const fnMatch = bgCode.match(/function generatePattern\(url\) \{[\s\S]*?^\}/m);
eval(fnMatch[0]);

describe('generatePattern', () => {
  test('extracts _backlogs from ADO URL', () => {
    const url = 'https://dev.azure.com/office/OC/_backlogs/backlog/FTL/Features?showParents=false';
    expect(generatePattern(url)).toBe('*dev.azure.com/*/_backlogs*');
  });

  test('extracts pull from GitHub URL', () => {
    const url = 'https://github.com/myorg/repo/pull/42';
    expect(generatePattern(url)).toBe('*github.com/*/pull*');
  });

  test('extracts incidents from ICM URL', () => {
    const url = 'https://portal.microsofticm.com/imp/v5/incidents/details/804809033/summary';
    expect(generatePattern(url)).toBe('*portal.microsofticm.com/*/incidents*');
  });

  test('extracts design from Figma URL', () => {
    const url = 'https://www.figma.com/design/abc123/MyDesign';
    expect(generatePattern(url)).toBe('*figma.com/*/design*');
  });

  test('extracts mail from Outlook URL', () => {
    const url = 'https://outlook.office.com/mail/inbox';
    expect(generatePattern(url)).toBe('*outlook.office.com/*/mail*');
  });

  test('extracts meeting from Teams URL', () => {
    const url = 'https://teams.microsoft.com/v2/meeting/123';
    expect(generatePattern(url)).toBe('*teams.microsoft.com/*/meeting*');
  });

  test('uses first 2 path segments for generic URLs', () => {
    const url = 'https://learn.microsoft.com/en-us/graph/overview';
    expect(generatePattern(url)).toBe('*learn.microsoft.com/en-us/graph*');
  });

  test('uses first path segment for short paths', () => {
    const url = 'https://example.com/dashboard';
    expect(generatePattern(url)).toBe('*example.com/dashboard*');
  });

  test('falls back to domain for root URL', () => {
    const url = 'https://example.com/';
    expect(generatePattern(url)).toBe('*example.com*');
  });

  test('strips www prefix', () => {
    const url = 'https://www.figma.com/file/xyz';
    expect(generatePattern(url)).toBe('*figma.com/*/file*');
  });

  test('handles pullrequest in ADO', () => {
    const url = 'https://office.visualstudio.com/Office/_git/1JS/pullrequest/5303194';
    // pullrequest is not in our identifiers list but _git starts with _
    const pattern = generatePattern(url);
    expect(pattern).toContain('visualstudio.com');
    expect(pattern).not.toBe('*office.visualstudio.com*');
  });

  test('handles wiki paths', () => {
    const url = 'https://dev.azure.com/org/project/_wiki/wikis/team-wiki/123/My-Page';
    expect(generatePattern(url)).toBe('*dev.azure.com/*/_wiki*');
  });
});
