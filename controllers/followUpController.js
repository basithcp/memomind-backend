// controllers/followUpController.js
import { CohereClient } from "cohere-ai";
import 'dotenv/config';
import { addPrevEntry, getChat } from "./chat-utils/chat.js";
import parseToJson from './llm-utils/parseToJSON.js';
import { postToFCs, postToMCQs, postToNotes } from './llm-utils/postToParseDB.js';
import randomiseOptions from "./llm-utils/randomiseOptions.js";
import repairJSONWithLLM from './llm-utils/repairJSON.js';

const COHERE_KEY = (process.env.COHERE_API_KEY || process.env.CO_API_KEY || "").trim();
if (!COHERE_KEY) {
  console.error("Missing Cohere API key.\nSet COHERE_API_KEY or CO_API_KEY in your environment.");
  throw new Error("Missing Cohere API key.\nSet COHERE_API_KEY or CO_API_KEY.");
}
const client = new CohereClient({ apiKey: COHERE_KEY });
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "command-a-03-2025";
const MARKERS = { start: '<<JSON_START>>', end: '<<JSON_END>>' };

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

async function tryParseWithRepairLocal(text, clientRef, model, schemaHint = '') {
  // reuse same logic as in llmController to sanitize and then ask model to repair
  try { return parseToJson(text); } catch (err) { /* continue */ }

  let s = String(text).replace(/[\u2018\u2019\u201C\u201D]/g, '"').replace(/```(?:json)?/gi, '').replace(/```/g, '');

  const start = s.indexOf(MARKERS.start), end = s.indexOf(MARKERS.end);
  if (start >= 0 && end > start) s = s.slice(start + MARKERS.start.length, end);
  else {
    const first = s.indexOf('{'), last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }

  s = s.replace(/,\s*([}\]])/g, '$1').replace(/'([^']*)'/g, '"$1"').replace(/([{,]\s*)([A-Za-z0-9_+-]+)\s*:/g, '$1"$2":');

  try { return parseToJson(s); } catch (err) { console.warn('local repair failed, model-assisted next'); }

  // model-assisted repair
  return repairJSONWithLLM(clientRef, model, text, schemaHint, { temperature: 0, max_tokens: Number(process.env.MAX_TOKENS || 2048) });
}

const generateContent = async (req, res) => {
  try {
    const { userId, itemId, task } = req.query;
    const { prompt } = req.body;

    // fetch previous chat history from DB
    const chatResponse = await getChat(userId, itemId, task, true);
    const prevMessages = chatResponse.prev.map(entry => {
      const roleLower = (entry.role || "").toLowerCase();
      const role = (roleLower.includes("bot") || roleLower.includes("assistant")) ? "assistant" : "user";
      return { role, content: entry.content };
    });

    const systemInstruction = {
      role: "system",
      content:
        "You are a helpful study assistant. ALWAYS return ONLY valid JSON matching the previously used JSON structure. " +
        "Do not add any commentary, explanations, or markdown. Do not add backticks or quotes around the JSON. " +
        "If asked to modify previous JSON, return a full JSON object with the same top-level schema. Wrap the JSON between <<JSON_START>> and <<JSON_END>> markers."
    };

    const followUpPrompt = `Please ${prompt}`;

    const messages = [systemInstruction, ...prevMessages, { role: "user", content: followUpPrompt }];

    const cohereReq = {
      model: DEFAULT_MODEL,
      messages,
      temperature: Number(process.env.TEMPERATURE || 0),
      max_tokens: Number(process.env.MAX_TOKENS || 2048)
    };

    let response;
    try {
      response = await client.chat(cohereReq);
    } catch (err) {
      // fallback to message+chat_history
      const prevHistory = chatResponse.prev.map(entry => {
        const roleUpper = (entry.role || "").toLowerCase().includes("bot") ? "CHATBOT" : "USER";
        return { role: roleUpper, text: entry.content };
      });
      const chatReq = {
        model: DEFAULT_MODEL,
        message: followUpPrompt,
        chat_history: [{ role: "SYSTEM", text: systemInstruction.content }, ...prevHistory],
        temperature: Number(process.env.TEMPERATURE || 0),
        max_tokens: Number(process.env.MAX_TOKENS || 2048),
      };
      response = await client.chat(chatReq);
    }

    const result = extractCohereText(response);

    // Save raw inputs/outputs for debugging
    await addPrevEntry(userId, itemId, task, "user", prompt);
    await addPrevEntry(userId, itemId, task, "chatbot", result);

    // determine schemaHint for repair
    const schemaHintMap = {
      notes: 'notes: {title, meta, sections: []}',
      mcqs: 'mcqs: {questions: [{question, options[4], answer}] }',
      flashcards: 'flashcards: {questions:[{question, answer}]}'
    };
    const schemaHint = schemaHintMap[task] || '';

    const ret = await tryParseWithRepairLocal(result, client, DEFAULT_MODEL, schemaHint);

    // DB save unchanged
    if (task === "notes") {
      const responsePost = await postToNotes(userId, itemId, ret);
      if (responsePost.success) return res.status(200).json(ret);
      else return res.status(responsePost.status).json({ error: responsePost.error });
    } else if (task === "mcqs") {
      const updatedResult = await randomiseOptions(ret);
      const responsePost = await postToMCQs(userId, itemId, updatedResult);
      if (responsePost.success) return res.status(200).json(updatedResult);
      else return res.status(responsePost.status).json({ error: responsePost.error });
    } else if (task === "flashcards") {
      const responsePost = await postToFCs(userId, itemId, ret);
      if (responsePost.success) return res.status(200).json(ret);
      else return res.status(responsePost.status).json({ error: responsePost.error });
    }

    return res.status(404).json({ error: "invalid task selected" });
  } catch (err) {
    console.error("Follow up controller error:", err);
    return res.status(500).json({ error: "Failed to generate content", details: err?.message ?? String(err) });
  }
};

export default generateContent;
