// controllers/llm-utils/repairJSON.js
import JSON5 from 'json5';

/**
 * repairJSONWithLLM
 * - client: a CohereClient instance (or compatible .chat method)
 * - model: model name
 * - rawOutput: string — the malformed LLM output
 * - schemaHint: string — short hint of expected top-level schema (for the model)
 * - maxTokens/temperature: optional
 *
 * Returns parsed object (throws on failure).
 */
const extractBetweenMarkers = (s) => {
  const start = s.indexOf('<<JSON_START>>');
  const end = s.indexOf('<<JSON_END>>');
  if (start >= 0 && end > start) return s.slice(start + '<<JSON_START>>'.length, end).trim();
  return null;
};

async function repairJSONWithLLM(client, model, rawOutput, schemaHint = '', opts = {}) {
  const temperature = typeof opts.temperature !== 'undefined' ? opts.temperature : 0;
  const max_tokens = opts.max_tokens || 1024;

  // Build a concise repair prompt
  const system = {
    role: 'system',
    content:
      'You are a JSON repair assistant. You will only output valid JSON between the markers <<JSON_START>> and <<JSON_END>>. ' +
      'You must not add any explanation, markdown, or commentary. Return only the JSON — nothing else.'
  };

  const userContent = [
    `Schema hint (for reference): ${schemaHint}`,
    'Below is the raw output that failed to parse as JSON. Repair it to be valid JSON that matches the schema hint. If some fields are missing because of truncation, include a placeholder such as null or an explicit "TRUNCATED": true flag. Do not invent facts — you may omit or leave truncated fields as null.',
    '',
    'RAW_OUTPUT_START',
    rawOutput,
    'RAW_OUTPUT_END',
    '',
    'Return the corrected full JSON between the markers.'
  ].join('\n');

  const messages = [
    system,
    { role: 'user', content: userContent }
  ];

  // call the chat endpoint
  const resp = await client.chat({
    model,
    messages,
    temperature,
    max_tokens
  });

  // extract text
  const text = (() => {
    try {
      if (resp?.message?.content && Array.isArray(resp.message.content)) {
        const first = resp.message.content[0];
        if (typeof first?.text === 'string') return first.text;
        if (typeof first?.plain_text === 'string') return first.plain_text;
        if (Array.isArray(first?.text)) return first.text.join('');
      }
      if (typeof resp?.text === 'string') return resp.text;
      if (resp?.output && Array.isArray(resp.output) && resp.output[0]?.content) {
        const c = resp.output[0].content;
        if (Array.isArray(c) && typeof c[0]?.text === 'string') return c[0].text;
        if (typeof c === 'string') return c;
      }
      if (resp?.generations && Array.isArray(resp.generations) && resp.generations[0]?.text) {
        return resp.generations[0].text;
      }
      return JSON.stringify(resp);
    } catch (e) {
      return String(resp);
    }
  })();

  // Prefer explicit markers
  let candidate = extractBetweenMarkers(text) || text;

  // Try JSON.parse, then JSON5
  try {
    return JSON.parse(candidate);
  } catch (_) {
    try {
      // attempt small sanitizations and JSON5
      const s = candidate.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      return JSON5.parse(s);
    } catch (err) {
      // bubble up a helpful error with both repair attempt and model raw response
      const e = new Error('repairJSONWithLLM: failed to repair JSON');
      e.details = { modelText: text, parseError: err.message };
      throw e;
    }
  }
}

export default repairJSONWithLLM;
