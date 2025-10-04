// parseToJson.js
// ES module - import with: import { parseToJson } from './parseToJson.js';

export default function parseToJson(input) {
  // If it's already an object, return it.
  if (input && typeof input === 'object') return input;

  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string or object');
  }

  let s = input.trim();

  // 1) Fast path: try direct JSON.parse
  try {
    return JSON.parse(s);
  } catch (_) {}

  // 2) If it's a quoted JSON string (e.g. "\"{\\n ... }\""), unescape it once and try again.
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const unescapedOnce = JSON.parse(s); // turns "\"{...}\"" -> "{...}"
      if (typeof unescapedOnce === 'string') {
        try {
          return JSON.parse(unescapedOnce);
        } catch (_) {
          // maybe unescapedOnce is already an object from parse (rare) - return it
          if (typeof unescapedOnce === 'object') return unescapedOnce;
        }
      } else if (typeof unescapedOnce === 'object') {
        return unescapedOnce;
      }
    } catch (_) {
      // fall through
    }
  }

  // 3) Strip common Markdown/code-fence wrappers around JSON
  s = s.replace(/^\s*```json\s*/i, '').replace(/^\s*```/, '').replace(/```\s*$/, '').trim();

  // 4) Attempt to locate the first {...} substring and parse it.
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = s.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // 5) Try to unescape typical escaped sequences inside the candidate (\" and \n etc.)
      const unescaped = candidate
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');

      try {
        return JSON.parse(unescaped);
      } catch (err) {
        // can't parse candidate
        throw new Error(
          'Unable to parse JSON: the input appears to contain an object-like substring but parsing failed. ' +
          `JSON.parse error: ${err.message}`
        );
      }
    }
  }

  // If nothing worked, give a helpful error.
  throw new Error('Could not parse input as JSON. Input does not contain a valid JSON object.');
}
