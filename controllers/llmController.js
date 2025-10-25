// controllers/llmController.js
import { CohereClient } from "cohere-ai";
import 'dotenv/config';
import JSON5 from 'json5';
import { addPrevEntry, createChat, isExisting } from "./chat-utils/chat.js";
import fetchContent from "./llm-utils/fetchContent.js";
import parseToJson from './llm-utils/parseToJSON.js';
import { fetchFromFCs, fetchFromMCQs, fetchFromNotes, postToFCs, postToMCQs, postToNotes } from './llm-utils/postToParseDB.js';
import randomiseOptions from "./llm-utils/randomiseOptions.js";
import repairJSONWithLLM from './llm-utils/repairJSON.js'; // new helper

const COHERE_KEY = (process.env.COHERE_API_KEY || process.env.CO_API_KEY || "").trim();
if (!COHERE_KEY) {
  console.error("Missing Cohere API key.\nSet COHERE_API_KEY or CO_API_KEY in your environment.");
  throw new Error("Missing Cohere API key.\nSet COHERE_API_KEY or CO_API_KEY.");
}
const client = new CohereClient({ apiKey: COHERE_KEY });
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "command-a-03-2025";

const MARKERS = { start: '<<JSON_START>>', end: '<<JSON_END>>' };

const NOTES_PROMPT = `${MARKERS.start}
Generate structured study notes as strict JSON using this schema:
{
  "title": string,
  "meta": { "author": string, "topic": string, "date": "YYYY-MM-DD" },
  "sections": [
    { "heading": string, "paragraphs": [string,...], "bulletlist": { "description": string, "bullets": [string,...] }(optional), "subsections": [ ...same structure... ] (optional) }
  ],
  "TRUNCATED_IF_NEEDED": boolean (set to true if you had to truncate due to length)
}
Guidelines:
- RETURN ONLY valid JSON, and NOTHING else (no markdown, no backticks, no commentary).
- Include arrays for repeating elements.
- If the text is too long, set TRUNCATED_IF_NEEDED:true and include as much as you can while keeping JSON valid.
${MARKERS.end}

Now summarize the following text into that JSON format:
\n\n`;

const MCQS_PROMPT = `${MARKERS.start}
Generate structured study MCQ questions as strict JSON using this schema:
{ "questions": [ { "question": string, "options": [string,...], "answer": number } ] , "TRUNCATED_IF_NEEDED": boolean }
Guidelines:
- RETURN ONLY valid JSON between the markers.
- Exactly 4 options per question.
- 'answer' is a 0-based index.
- If forced to truncate, set TRUNCATED_IF_NEEDED:true and keep the JSON valid.
${MARKERS.end}

Now convert the following text into that JSON format:
\n\n`;

const FCS_PROMPT = `${MARKERS.start}
Generate structured study Flash cards as strict JSON using this schema:
{ "questions": [ { "question": string, "answer": string } ], "TRUNCATED_IF_NEEDED": boolean }
Guidelines:
- RETURN ONLY valid JSON between the markers.
- Question detailed; answer ~4 words max.
- If forced to truncate, set TRUNCATED_IF_NEEDED:true and keep JSON valid.
${MARKERS.end}

Now convert the following text into that JSON format:
\n\n`;

// existing extractCohereText unchanged
function extractCohereText(resp) {
  try {
    if (resp?.message?.content && Array.isArray(resp.message.content)) {
      const first = resp.message.content[0];
      if (typeof first?.text === "string") return first.text;
      if (typeof first?.plain_text === "string") return first.plain_text;
      if (Array.isArray(first?.text)) return first.text.join("");
    }
    if (typeof resp?.text === "string") return resp.text;
    if (resp?.output && Array.isArray(resp.output) && resp.output[0]?.content) {
      const c = resp.output[0].content;
      if (Array.isArray(c) && typeof c[0]?.text === "string") return c[0].text;
      if (typeof c === "string") return c;
    }
    if (resp?.generations && Array.isArray(resp.generations) && resp.generations[0]?.text) {
      return resp.generations[0].text;
    }
    return JSON.stringify(resp);
  } catch (e) {
    return String(resp);
  }
}

// improved parser attempt + repair via LLM if needed
async function tryParseWithRepair(text, clientRef, model, schemaHint = '') {
  // Local hopeful parse + sanitizations (existing logic)
  try {
    return parseToJson(text);
  } catch (err) {
    console.warn('parseToJson failed, attempting local sanitization:', err.message);
  }

  let s = String(text);
  s = s.replace(/[\u2018\u2019\u201C\u201D]/g, '"');
  s = s.replace(/```(?:json)?/gi, '').replace(/```/g, '');
  // try pull between markers if present (stronger)
  const startIdx = s.indexOf(MARKERS.start);
  const endIdx = s.indexOf(MARKERS.end);
  if (startIdx >= 0 && endIdx > startIdx) {
    s = s.slice(startIdx + MARKERS.start.length, endIdx).trim();
  } else {
    // fallback: trim to first {...}
    const first = s.indexOf('{'), last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }

  // mild fixes
  s = s.replace(/,\s*([}\]])/g, '$1'); // trailing commas
  s = s.replace(/'([^']*)'/g, '"$1"'); // single -> double quotes
  s = s.replace(/([{,]\s*)([A-Za-z0-9_+-]+)\s*:/g, '$1"$2":'); // quote keys

  try {
    return parseToJson(s);
  } catch (err) {
    console.warn('Local repair failed, will attempt model-assisted repair:', err.message);
  }

  // LAST RESORT: call LLM to repair
  try {
    const repaired = await repairJSONWithLLM(clientRef, model, text, schemaHint, {
      temperature: 0,
      max_tokens: Number(process.env.MAX_TOKENS || 2048)
    });
    return repaired;
  } catch (err) {
    console.error('Model-assisted repair failed:', err);
    // try JSON5 as last last attempt
    try {
      return JSON5.parse(s);
    } catch (err2) {
      const e = new Error('Unable to parse returned JSON. Last errors: ' + err.message + ' / ' + (err2?.message || 'JSON5 failed'));
      throw e;
    }
  }
}

const generateContent = async (req, res) => {
  try {
    const { userId, itemId, task } = req.query;
    const existing = await isExisting(userId, itemId, task);

    if (existing.value) {
      let fetchResult;
      if (task === "notes") {
        fetchResult = await fetchFromNotes(userId, itemId);
      } else if (task === "mcqs") {
        fetchResult = await fetchFromMCQs(userId, itemId);
      } else if (task === "flashcards") {
        fetchResult = await fetchFromFCs(userId, itemId);
      } else {
        return res.status(400).json({ error: "Invalid task selected." });
      }
      if (fetchResult.success) {
        return res.status(200).json(fetchResult.data);
      } else {
        return res.status(fetchResult.status).json({ error: fetchResult.error });
      }
    }

    const fetchResponse = await fetchContent(userId, itemId);
    if (fetchResponse.error) return res.status(fetchResponse.status).json({ error: fetchResponse.error });

    const { text } = fetchResponse;
    let userPrompt;
    let schemaHint = '';
    if (task === "notes") {
      userPrompt = `${NOTES_PROMPT}${text}`;
      schemaHint = 'notes: {title, meta, sections: [] }';
    } else if (task === "mcqs") {
      userPrompt = `${MCQS_PROMPT}${text}`;
      schemaHint = 'mcqs: {questions: [{question, options[4], answer}] }';
    } else if (task === "flashcards") {
      userPrompt = `${FCS_PROMPT}${text}`;
      schemaHint = 'flashcards: {questions:[{question, answer}]}';
    } else {
      return res.status(400).json({ error: "Invalid task selected." });
    }

    // build messages
    const cohereRequest = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: "You are a helpful study assistant. Produce valid JSON between markers." },
        { role: "user", content: userPrompt }
      ],
      temperature: Number(process.env.TEMPERATURE || 0),
      max_tokens: Number(process.env.MAX_TOKENS || 2048)
    };

    let response;
    try {
      response = await client.chat(cohereRequest);
    } catch (err) {
      // attempt alternate request shape
      console.log("chat messages-shape failed, trying message+chat_history fallback");
      const cohereRequest2 = {
        model: DEFAULT_MODEL,
        message: userPrompt,
        chat_history: [{ role: "SYSTEM", text: "You are a helpful study assistant. Produce valid JSON between markers." }],
        temperature: Number(process.env.TEMPERATURE || 0),
        max_tokens: Number(process.env.MAX_TOKENS || 2048)
      };
      response = await client.chat(cohereRequest2);
    }

    const result = extractCohereText(response);
    // save to chat history
    const createResponse = await createChat(userId, itemId, task);
    if (createResponse.value) return res.status(409).json({ error: "item already generated" });
    await addPrevEntry(userId, itemId, task, "chatbot", result);

    // resilient parse (now uses model-assisted repair if needed)
    const ret = await tryParseWithRepair(result, client, DEFAULT_MODEL, schemaHint);

    if (task === "notes") {
      const responseDB = await postToNotes(userId, itemId, ret);
      if (responseDB.success) return res.status(200).json(ret);
      else return res.status(responseDB.status).json({ error: responseDB.error });
    } else if (task === "mcqs") {
      const updatedResult = await randomiseOptions(ret);
      const responseDB = await postToMCQs(userId, itemId, updatedResult);
      if (responseDB.success) return res.status(200).json(updatedResult);
      else return res.status(responseDB.status).json({ error: responseDB.error });
    } else if (task === "flashcards") {
      const responseDB = await postToFCs(userId, itemId, ret);
      if (responseDB.success) return res.status(200).json(ret);
      else return res.status(responseDB.status).json({ error: responseDB.error });
    }

    return res.status(404).json({ error: "invalid task selected" });

  } catch (err) {
    console.error("LLM controller error:", err);
    // provide a bit more debug info for development (don't leak sensitive info in production)
    return res.status(500).json({ error: "Failed to generate content", details: err?.message ?? String(err) });
  }
};

export default generateContent;
