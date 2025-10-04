// generateContent-cohere.js
import { CohereClient } from "cohere-ai";
import 'dotenv/config'; // load .env in development
import JSON5 from 'json5';
import { addPrevEntry, createChat, isExisting } from "./chat-utils/chat.js";
import fetchContent from "./llm-utils/fetchContent.js";
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

// Strict JSON schema prompt (use when format=json is requested for notes)
const NOTES_PROMPT = `Generate structured study notes as strict JSON using this schema:
{
"title": string,
"meta": { "author": string, "topic": string, "date": "YYYY-MM-DD" },
"sections": [
{
"heading": string,
"paragraphs": [string,...],
"bulletlist": {
  description: string,
  "bullets": [string,...]
}(optional),
"subsections": [ ... same structure ... ] (optional)
}
]
}


Guidelines:
- Return ONLY valid JSON, and nothing else (no markdown, no backticks, no commentary).
- Use arrays for repeating elements. Keep paragraphs detailed such that user will understand it very easily.
- You can give multiple paragraphs within the section.
- Create 6-12 top-level sections and include a subsection for "AI integration" if relevant.
- Try to add bullet points for whichever sections possible as it increases the readability.
- The description of bullet points gives the reader an idea of what the bullets points about.
- Any further follow up chats should output the same JSON structure.

Now summarize the following text into that JSON format:\n\n`;
const MCQS_PROMPT = `Generate structured study MCQ questions as strict JSON using this schema:
{
  "questions": [
    {
    "question": string,
    "options": [string,...],
    "answer": number 
    }
  ]
}


Guidelines:
- Return ONLY valid JSON, and nothing else (no markdown, no backticks, no commentary).
- There will be exactly 4 options, each of type string.
- answer is a number(0-indexed) indicating the position of correct answer.
- Make atleast 10 MCQS.
- Any further follow up chats should output the same JSON structure.

Now convert the following text into that JSON format:\n\n`;
const FCS_PROMPT = `Generate structured study Flash cards as strict JSON using this schema:
{
  "questions": [
    {
    "question": string,
    "answer": string 
    }
  ]
}


Guidelines:
- Return ONLY valid JSON, and nothing else (no markdown, no backticks, no commentary).
-the question should be very detailed, but the answer should be few important kewords(~4 words max).
- Any further follow up chats should output the same JSON structure.

Now convert the following text into that JSON format:\n\n`;

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
const generateContent = async (req, res) => {
  try {
    const { userId, itemId, task } = req.query;
    const existing = await isExisting(userId, itemId, task);
    if(existing.value) return res.status(409).json({error : "item already generated"});
    const fetchResponse = await fetchContent(userId, itemId);
    if (fetchResponse.error)
      return res.status(fetchResponse.status).json({ error: fetchResponse.error });
    const { text } = fetchResponse;

    let userPrompt;
    if (task === "notes") {
      userPrompt = `${NOTES_PROMPT}${text}`;
    } else if (task === "mcqs") {
      userPrompt = `${MCQS_PROMPT}${text}`;
    } else if (task === "flashcards") {
      userPrompt = `${FCS_PROMPT}${text}`;
    } else {
      return res.status(400).json({ error: "Invalid task selected." });
    }

    // Try the "messages" shape first (newer SDK/docs)
    const attemptMessagesShape = async () => {
      const cohereRequest = {
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are a helpful study assistant." },
          { role: "user", content: userPrompt },
        ],
        temperature: Number(process.env.TEMPERATURE || 0),
        max_tokens: Number(process.env.MAX_TOKENS || 1024),
      };
      return client.chat(cohereRequest);
    };

    // Fallback: try "message" + "chat_history" shape (older SDK variants / some endpoints)
    const attemptMessageShape = async () => {
      // Cohere examples show chat_history entries like { role: "USER", text: "..." }
      const cohereRequest = {
        model: DEFAULT_MODEL,
        message: userPrompt,
        chat_history: [
          { role: "SYSTEM", text: "You are a helpful study assistant." },
          // you may include previous user/assistant entries here if you have them
        ],
        temperature: Number(process.env.TEMPERATURE || 0),
        max_tokens: Number(process.env.MAX_TOKENS || 1024),
      };
      return client.chat(cohereRequest);
    };

    let response;
    try {
      response = await attemptMessagesShape();
    } catch (err) {
      // If the server complains about a missing "message" key (or similar), retry with the other shape
      console.log("second came");
      
      const errMessage = String(err?.message || err);
      const hasMissingMessageError =
        err?.errors?.some?.((e) => String(e?.message || "").includes('Missing required key "message"')) ||
        errMessage.includes('Missing required key "message"') ||
        errMessage.includes('required key [message]') ||
        errMessage.includes('Missing "message"');

      if (hasMissingMessageError) {
        // retry with the alternate shape
        try {
          response = await attemptMessageShape();
        } catch (err2) {
          console.error("Cohere chat fallback (message shape) failed:", err2);
          throw err2;
        }
      } else {
        // unknown error — rethrow
        console.error("Cohere chat (messages shape) failed with:", err);
        throw err;
      }
    }

    const result = extractCohereText(response);

    //add this to chat history

    const createResponse = await createChat(userId, itemId, task);
    if(createResponse.value) return res.status(409).json({error : "item already generated"});
    await addPrevEntry(userId, itemId, task, "chatbot", result);
    const ret = tryParseWithRepair(result);
    if(task === "notes"){
      const response = await postToNotes(userId, itemId, ret);
      if(response.success) return res.status(200).json(ret);
      else return res.status(response.status).json({error : response.error});
    }
    else if(task === "mcqs") {
      const updatedResult = await randomiseOptions(ret);
      const response = await postToMCQs(userId, itemId, updatedResult);
      if(response.success) return res.status(200).json(updatedResult);
      else return res.status(response.status).json({error : response.error});
    }
    else if(task === "flashcards") {
      const response = await postToFCs(userId, itemId, ret);
      if(response.success) return res.status(200).json(ret);
      else return res.status(response.status).json({error : response.error});
    }
    return res.status(404).json({error : "invalid task selected"});
  } catch (err) {
    console.error("Cohere error:", err);
    return res.status(500).json({ error: "Failed to generate content" });
  }
};

export default generateContent;
