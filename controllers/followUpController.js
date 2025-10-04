// generateContent-cohere.js
import { CohereClient } from "cohere-ai";
import 'dotenv/config'; // load .env in development
import { addPrevEntry, getChat } from "./chat-utils/chat.js";
import parseToJson from './llm-utils/parseToJSON.js';
import { postToFCs, postToMCQs, postToNotes } from './llm-utils/postToParseDB.js';
import randomiseOptions from "./llm-utils/randomiseOptions.js";
const COHERE_KEY = (process.env.COHERE_API_KEY || process.env.CO_API_KEY || "").trim();

if (!COHERE_KEY) {
  console.error("Missing Cohere API key. Set COHERE_API_KEY or CO_API_KEY in your environment.");
  throw new Error("Missing Cohere API key. Set COHERE_API_KEY or CO_API_KEY.");
}

const client = new CohereClient({ apiKey: COHERE_KEY });

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "command-a-03-2025";

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
// optional: npm i json5
import JSON5 from 'json5';

function tryParseWithRepair(text) {
  // 1) quick try
  try {
    return parseToJson(text);
  } catch (err) {
    console.warn('parseToJson failed, attempting repair:', err.message);
  }

  // 2) mild sanitizations
  let s = String(text);

  // normalize smart quotes -> regular quotes
  s = s.replace(/[\u2018\u2019\u201C\u201D]/g, '"');

  // remove triple-backticks and surrounding markdown
  s = s.replace(/```(?:json)?/gi, '').replace(/```/g, '');

  // remove everything before first { and after last } (your parseToJson already does this,
  // but this is an extra safe-trim)
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);

  // remove trailing commas in objects/arrays
  s = s.replace(/,\s*([}\]])/g, '$1');

  // replace single-quoted strings with double-quoted strings (naive but useful)
  s = s.replace(/'([^']*)'/g, '"$1"');

  // ensure keys are quoted (basic heuristic)
  s = s.replace(/([{,]\s*)([A-Za-z0-9_+-]+)\s*:/g, '$1"$2":');

  try {
    return parseToJson(s);
  } catch (err) {
    console.warn('repair parse failed, trying JSON5 as last resort:', err.message);
  }

  // 3) last resort: attempt JSON5 (more permissive)
  try {
    return JSON5.parse(s);
  } catch (err) {
    // final failure — surface helpful error
    console.error('All parse attempts failed. Last error:', err.message);
    throw new Error('Unable to parse returned JSON. Last parse error: ' + err.message);
  }
}

// followUpController.js (patch)
const generateContent = async (req, res) => {
  try {
    const { userId, itemId, task } = req.query;
    const { prompt } = req.body;

    
    
    // fetch previous chat history (your existing helper)
    const chatResponse = await getChat(userId, itemId, task, true);
    
    // Map DB roles -> chat API roles and keep original order (oldest -> newest)
    const prevMessages = chatResponse.prev.map(entry => {
      const roleLower = (entry.role || "").toLowerCase();
      const role = (roleLower.includes("bot") || roleLower.includes("assistant")) ? "assistant" : "user";
      return { role, content: entry.content };
    });
    // Strong system instruction: strict JSON only
    const systemInstruction = {
      role: "system",
      content:
        "You are a helpful study assistant. ALWAYS return ONLY valid JSON matching the previously used JSON structure. " +
        "Do not add any commentary, explanations, or markdown. Do not add backticks or quotes around the JSON. " +
        "If asked to modify the previous JSON, return a full JSON object with the same top-level schema.",
    };

    // Put history first, then the new user follow-up (so the model sees context before the request)
    const followUpPrompt = `Please ${prompt}`; // you can keep your original phrasing here
    const messages = [
      systemInstruction,
      ...prevMessages,
      { role: "user", content: followUpPrompt },
    ];

    // Cohere messages-shape request
    const cohereReq = {
      model: DEFAULT_MODEL,
      messages,
      temperature: Number(process.env.TEMPERATURE || 0), // use 0 for deterministic JSON
      max_tokens: Number(process.env.MAX_TOKENS || 2048),
    };
    
    let response;
    try {
      response = await client.chat(cohereReq);
    } catch (err) {
      // fallback to older "message + chat_history" style (map roles to uppercase)
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

    // Save raw inputs/outputs (for reproducible debugging)
    await addPrevEntry(userId, itemId, task, "user", prompt);
    await addPrevEntry(userId, itemId, task, "chatbot", result);

    // resilient parse (see helper below)
    const ret = tryParseWithRepair(result);
    
    
    // ... then your existing DB posting logic unchanged:
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
    console.error("Cohere error:", err);
    return res.status(500).json({ error: "Failed to generate content" });
  }
};


export default generateContent;
