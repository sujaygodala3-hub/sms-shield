// SMS Shield backend - serves the static site in public/ and proxies AI and AWS
// calls server-side so API keys never reach the browser.
//
// Free first. Text AI, first key found wins: Groq (GROQ_API_KEY, free tier),
// Google Gemini (GEMINI_API_KEY, free tier), then paid OpenAI or Claude.
// Photo analysis uses a Groq vision model, or OpenAI if that is the only key.
// All voice runs on ElevenLabs (ELEVENLABS_API_KEY, free tier): spoken guidance
// and speech to text, with Groq Whisper as the speech to text backup. Hands-free
// face control runs in the browser; the optional Amazon Rekognition route is
// only used if AWS keys are set. Every route answers with a clear fallback
// signal when its service is missing, so the frontend can switch to a manual option.
import express from "express";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";
import path from "path";
import { fileURLToPath } from "url";
import "./public/legal.js"; // sets globalThis.SMSLegal, shared with the browser

dotenv.config();

const env = (name) => (process.env[name] || "").trim();
const isReal = (v) => Boolean(v) && !/^(your-|paste-)/.test(v);

const openaiKey = env("OPENAI_API_KEY");
const groqKey = env("GROQ_API_KEY");
const geminiKey = env("GEMINI_API_KEY");
const anthropicKey = env("ANTHROPIC_API_KEY");

const GROQ_OK = groqKey.startsWith("gsk_");
const OPENAI_OK = isReal(openaiKey) && openaiKey.startsWith("sk-");
const PROVIDER = GROQ_OK ? "groq"
  : isReal(geminiKey) ? "gemini"
  : OPENAI_OK ? "openai"
  : anthropicKey.startsWith("sk-ant") ? "claude"
  : null;
const AI_ENABLED = Boolean(PROVIDER);
const MODEL = {
  openai: env("OPENAI_MODEL") || "gpt-5.5",
  groq: env("GROQ_MODEL") || "openai/gpt-oss-120b",
  gemini: env("GEMINI_MODEL") || "gemini-2.5-flash",
  claude: "claude-opus-5-5",
}[PROVIDER];

const openai = OPENAI_OK ? new OpenAI({ apiKey: openaiKey }) : null;
const groq = GROQ_OK ? new Groq({ apiKey: groqKey }) : null;
const VISION_PROVIDER = groq ? "groq" : openai ? "openai" : null;
const VISION_MODEL = VISION_PROVIDER === "groq"
  ? env("GROQ_VISION_MODEL") || "qwen/qwen3.8-27b"
  : env("OPENAI_VISION_MODEL") || env("OPENAI_MODEL") || "gpt-5.5";

const gemini = PROVIDER === "gemini" ? new GoogleGenAI({ apiKey: geminiKey }) : null;
// Pin the public API endpoint so a stray ANTHROPIC_BASE_URL in the launching
// shell can't redirect requests; set SMS_SHIELD_API_BASE_URL to override.
const claude = PROVIDER === "claude"
  ? new Anthropic({ apiKey: anthropicKey, baseURL: env("SMS_SHIELD_API_BASE_URL") || "https://api.anthropic.com" })
  : null;

// AWS SDK clients read AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the environment.
const AWS_ENABLED = isReal(env("AWS_ACCESS_KEY_ID")) && isReal(env("AWS_SECRET_ACCESS_KEY"));
const AWS_REGION = env("AWS_REGION") || "us-east-1";
const rekognition = AWS_ENABLED ? new RekognitionClient({ region: AWS_REGION }) : null;

const elevenKey = env("ELEVENLABS_API_KEY");
const ELEVEN_ENABLED = isReal(elevenKey);
// One calm voice everywhere. Override with ELEVENLABS_VOICE_ID.
const ELEVEN_VOICE = env("ELEVENLABS_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL"; // Sarah, a default voice free accounts can use
const ELEVEN_MODEL = env("ELEVENLABS_MODEL") || "eleven_flash_v2_5";
const STT_PROVIDER = ELEVEN_ENABLED ? "elevenlabs" : groq ? "groq" : null;

if (!AI_ENABLED) console.warn("No AI key set - chat and symptom checker run in demo mode (rule-based answers).");
if (!VISION_PROVIDER) console.warn("No GROQ_API_KEY - photo analysis will offer the describe-it-in-words fallback.");
if (!AWS_ENABLED) console.warn("No AWS keys - hands-free mode will offer keyboard and on-screen buttons.");
if (!ELEVEN_ENABLED) console.warn("No ELEVENLABS_API_KEY - voice falls back to the browser voice and browser speech recognition.");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Camera frames need a bigger body limit; everything else stays small.
const smallJson = express.json({ limit: "200kb" });
const audioBody = express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" });
const imageJson = express.json({ limit: "8mb" });
const IMAGE_ROUTES = new Set(["/api/vision", "/api/face"]);
app.use((req, res, next) => (req.path === "/api/stt" ? audioBody : IMAGE_ROUTES.has(req.path) ? imageJson : smallJson)(req, res, next));
app.use(express.static(path.join(__dirname, "public")));

// Condition keys the frontend has cost/medication data for.
const CONDITION_KEYS = [
  "strep", "uti", "appendicitis", "diabetes", "hypertension",
  "pneumonia", "asthma", "cellulitis", "migraine", "other",
];

const SYMPTOM_SYSTEM = `You are the symptom triage step of SMS Shield, a patient-facing prototype that helps people understand likely conditions, costs, and billing rights. You are not a doctor and must not diagnose.
Given a plain-language description of symptoms (and optionally age, duration, and US state), return the 3 most likely conditions, most likely first.
For each condition, set conditionKey to the closest match from this list, or "other" if none fit: ${CONDITION_KEYS.join(", ")}.
Urgency levels: "emergency" (call 911 / go to the ER now), "urgent" (see a clinician within 24 hours), "soon" (book a visit this week), "self-care" (home care, watch for changes).
List red-flag symptoms that would mean going to the ER immediately. Keep every string short and plain (under 30 words). Use generic medication names only.
Use careful words such as "could be" or "might be" everywhere, including the summary. Never say someone has a condition or that it "is" one. Do not use em dashes.`;

const SYMPTOM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["conditions", "redFlags", "summary"],
  properties: {
    summary: { type: "string" },
    redFlags: { type: "array", items: { type: "string" } },
    conditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "conditionKey", "likelihood", "urgency", "why", "nextStep", "medications"],
        properties: {
          name: { type: "string" },
          conditionKey: { type: "string", enum: CONDITION_KEYS },
          likelihood: { type: "string", enum: ["high", "medium", "low"] },
          urgency: { type: "string", enum: ["emergency", "urgent", "soon", "self-care"] },
          why: { type: "string" },
          nextStep: { type: "string" },
          medications: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const VISION_SYSTEM = `You look at a photo a patient took of a problem area on their body for SMS Shield, an accessibility-first prototype. You are not a doctor and must never diagnose.
Describe what the photo could show in plain, calm language that works when read aloud. Always use hedged words such as "could be", "might be" or "may be". Never say a condition "is" present.
Give up to 3 possible conditions, most likely first. For each, set conditionKey to the closest match from this list, or "other": ${CONDITION_KEYS.join(", ")}.
Urgency: "emergency" (call 911 or go to the ER now), "urgent" (see a clinician within 24 hours), "soon" (book a visit this week), "self-care" (home care, watch for changes).
redFlag is one sentence on when to seek urgent care, such as spreading redness, fever, or trouble breathing.
If the photo is blurry, too dark, or doesn't show a body area, set imageUsable to false and explain how to retake it in summary.
Keep every string under 30 words. Do not use em dashes.`;

const VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["imageUsable", "summary", "possibleConditions", "urgency", "redFlag"],
  properties: {
    imageUsable: { type: "boolean" },
    summary: { type: "string" },
    possibleConditions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "conditionKey", "why"],
        properties: {
          name: { type: "string" },
          conditionKey: { type: "string", enum: CONDITION_KEYS },
          why: { type: "string" },
        },
      },
    },
    urgency: { type: "string", enum: ["emergency", "urgent", "soon", "self-care"] },
    redFlag: { type: "string" },
  },
};

const Legal = globalThis.SMSLegal;
const CHAT_SYSTEM = `You are the SMS Shield assistant. SMS Shield helps disabled people in the US get medical guidance and know their legal rights at every step of health care. Users may be blind or low vision, deaf or hard of hearing, or have limited movement.
You answer medical and legal questions in one conversation. Write warm, plain sentences at about a 6th grade reading level. Keep replies to 2 to 5 short sentences or a short list. Replies may be read aloud, so avoid tables, links and heavy formatting.
When a right applies (accommodations, interpreters, accessible formats, service animals, billing protections, appeals), end with a line that starts with "Your rights:" and name the law and citation from the rules below. Only use citations from the rules below. If something is not covered there, call it a general principle and do not invent a statute, case name, case number or success rate.
Medical guidance must be careful: use "could be" or "might be", never say someone has a condition. For anything that sounds like an emergency, tell them to call 911 first. For thoughts of self-harm, mention 988.
Always end with exactly this sentence: "I am not a doctor or lawyer. General information, not legal advice." Do not use em dashes.

${Legal.aiContext()}`;

const CHAT_DISCLAIMER = "I am not a doctor or lawyer. General information, not legal advice.";
const withDisclaimer = (text) => {
  const t = String(text || "").replace(/\u2014/g, ", ").trim();
  return t.includes("I am not a doctor or lawyer") ? t : `${t}\n\n${CHAT_DISCLAIMER}`;
};

function textOf(response) {
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// Gemini's schema support is narrower; drop keys it doesn't need.
function forGemini(schema) {
  if (Array.isArray(schema)) return schema.map(forGemini);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) if (k !== "additionalProperties") out[k] = forGemini(v);
  return out;
}

class Refusal extends Error {}

// Returns parsed JSON matching `schema`.
async function generateJSON(system, user, schema) {
  if (PROVIDER === "openai") {
    const r = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "developer", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name: "result", schema, strict: true } },
    });
    const msg = r.choices[0].message;
    if (msg.refusal || !msg.content) throw new Refusal("The assistant could not answer that request.");
    return JSON.parse(msg.content);
  }
  if (PROVIDER === "groq") {
    // json_object mode plus the schema in the prompt works across Groq models.
    const r = await groq.chat.completions.create({
      model: MODEL, temperature: 0.3, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` },
        { role: "user", content: user },
      ],
    });
    return JSON.parse(r.choices[0].message.content);
  }
  if (PROVIDER === "gemini") {
    const r = await gemini.models.generateContent({
      model: MODEL,
      contents: user,
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: forGemini(schema), temperature: 0.3 },
    });
    if (!r.text) throw new Refusal("The assistant could not answer that request.");
    return JSON.parse(r.text);
  }
  // Claude: server-side refusal fallback retries a declined request on a fallback model.
  const r = await claude.beta.messages.create({
    model: MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system, output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  if (r.stop_reason === "refusal") throw new Refusal("The assistant could not answer that request.");
  return JSON.parse(textOf(r));
}

// `messages`: [{ role: "user" | "assistant", content }]. Returns reply text.
async function generateChat(system, messages) {
  if (PROVIDER === "openai") {
    const r = await openai.chat.completions.create({
      model: MODEL, messages: [{ role: "developer", content: system }, ...messages],
    });
    const msg = r.choices[0].message;
    if (msg.refusal || !msg.content) throw new Refusal("I can't help with that one. For anything urgent, call 911.");
    return msg.content;
  }
  if (PROVIDER === "groq") {
    const r = await groq.chat.completions.create({
      model: MODEL, temperature: 0.4, messages: [{ role: "system", content: system }, ...messages],
    });
    return r.choices[0].message.content;
  }
  if (PROVIDER === "gemini") {
    const r = await gemini.models.generateContent({
      model: MODEL,
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: { systemInstruction: system, temperature: 0.4 },
    });
    if (!r.text) throw new Refusal("I can't help with that one. For anything urgent, call 911.");
    return r.text;
  }
  const r = await claude.beta.messages.create({
    model: MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system, output_config: { effort: "low" }, messages,
  });
  if (r.stop_reason === "refusal") throw new Refusal("I can't help with that one. For anything urgent, call 911.");
  return textOf(r);
}

function sendError(res, err, service = PROVIDER) {
  console.error(`${service} error:`, err?.message || err);
  const status = Number.isInteger(err?.status) ? err.status
    : Number.isInteger(err?.$metadata?.httpStatusCode) ? err.$metadata.httpStatusCode
    : 500;
  res.status(status).json({ error: err?.message || "Request failed." });
}

// Accepts a data URL or bare base64 string and returns the image bytes.
function imageBytes(input) {
  if (typeof input !== "string" || !input) return null;
  const b64 = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const buf = Buffer.from(b64, "base64");
  return buf.length > 100 ? buf : null;
}

app.get("/api/status", (_req, res) => {
  res.json({
    ai: AI_ENABLED, provider: PROVIDER, model: AI_ENABLED ? MODEL : null,
    vision: Boolean(VISION_PROVIDER), rekognition: AWS_ENABLED, voice: ELEVEN_ENABLED, stt: Boolean(STT_PROVIDER) || ELEVEN_ENABLED,
  });
});

app.post("/api/symptoms", async (req, res) => {
  const { text, age, duration, state } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "`text` is required." });
  }
  if (!AI_ENABLED) return res.json({ demo: true });

  const details = [
    `Symptoms: ${text.slice(0, 2000)}`,
    age ? `Age: ${age}` : null,
    duration ? `Duration: ${duration}` : null,
    state ? `US state: ${state}` : null,
  ].filter(Boolean).join("\n");

  try {
    res.json({ demo: false, result: await generateJSON(SYMPTOM_SYSTEM, details, SYMPTOM_SCHEMA) });
  } catch (err) {
    if (err instanceof Refusal) return res.status(422).json({ error: err.message });
    sendError(res, err);
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "`messages` (non-empty array) is required." });
  }
  if (!AI_ENABLED) return res.json({ demo: true });

  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const system = context ? `${CHAT_SYSTEM}\n\nWhat the user has entered on the site so far: ${String(context).slice(0, 1500)}` : CHAT_SYSTEM;

  try {
    res.json({ demo: false, reply: withDisclaimer(await generateChat(system, clean)) });
  } catch (err) {
    if (err instanceof Refusal) return res.json({ demo: false, reply: err.message });
    sendError(res, err);
  }
});

// Photo analysis. The image lives only in this request's memory and is never
// written to disk or logged.
app.post("/api/vision", async (req, res) => {
  if (!VISION_PROVIDER) return res.status(503).json({ error: "Photo analysis is not set up.", fallback: "describe" });
  const image = req.body?.image;
  if (!imageBytes(image)) return res.status(400).json({ error: "A photo is required." });
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : "";
  const url = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

  const prompt = note ? `The patient adds: ${note}` : "Here is the photo of the problem area.";
  try {
    if (VISION_PROVIDER === "groq") {
      // JSON mode plus the schema in the prompt, the same way the Groq text path works.
      const r = await groq.chat.completions.create({
        model: VISION_MODEL, temperature: 0.2, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${VISION_SYSTEM}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(VISION_SCHEMA)}` },
          { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url } }] },
        ],
      });
      const raw = r.choices[0].message.content || "";
      const result = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      if (!Array.isArray(result.possibleConditions)) throw new Error("Unexpected vision reply");
      return res.json({ result });
    }
    const r = await openai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: "developer", content: VISION_SYSTEM },
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url, detail: "auto" } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "photo_result", schema: VISION_SCHEMA, strict: true } },
    });
    const msg = r.choices[0].message;
    if (msg.refusal || !msg.content) return res.status(422).json({ error: "The photo could not be analyzed.", fallback: "describe" });
    res.json({ result: JSON.parse(msg.content) });
  } catch (err) {
    console.error(`${VISION_PROVIDER} vision error:`, err?.message || err);
    res.status(502).json({ error: "Photo analysis is unavailable right now.", fallback: "describe" });
  }
});

// Hands-free control: one camera frame in, face signals out.
const DISTRESS = new Set(["FEAR", "SAD", "CONFUSED"]);
app.post("/api/face", async (req, res) => {
  if (!rekognition) return res.status(503).json({ error: "Face control is not set up.", fallback: "keyboard" });
  const bytes = imageBytes(req.body?.image);
  if (!bytes) return res.status(400).json({ error: "A camera frame is required." });

  try {
    const r = await rekognition.send(new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["ALL"] }));
    const f = r.FaceDetails?.[0];
    if (!f) return res.json({ face: false });
    const emotions = (f.Emotions || []).sort((a, b) => b.Confidence - a.Confidence).slice(0, 3)
      .map((e) => ({ type: e.Type, confidence: Math.round(e.Confidence) }));
    res.json({
      face: true,
      eyesOpen: { value: f.EyesOpen?.Value ?? true, confidence: Math.round(f.EyesOpen?.Confidence ?? 0) },
      mouthOpen: { value: f.MouthOpen?.Value ?? false, confidence: Math.round(f.MouthOpen?.Confidence ?? 0) },
      yaw: Math.round(f.Pose?.Yaw ?? 0),
      pitch: Math.round(f.Pose?.Pitch ?? 0),
      emotions,
      distress: emotions.some((e) => DISTRESS.has(e.type) && e.confidence >= 70),
    });
  } catch (err) {
    sendError(res, err, "rekognition");
  }
});

// Spoken guidance with ElevenLabs. Fixed phrases (welcome, countdown, page
// intros) are sent with cache: true and kept in memory so they replay instantly
// and save credits. Personal text such as chat replies is never cached.
const ttsCache = new Map();
const TTS_CACHE_MAX = 80;
app.post("/api/tts", async (req, res) => {
  if (!ELEVEN_ENABLED) return res.status(503).json({ error: "ElevenLabs is not set up.", fallback: "browser" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 2500) : "";
  if (!text) return res.status(400).json({ error: "`text` is required." });
  const cacheable = req.body?.cache === true;
  const send = (audio) => res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }).send(audio);
  if (cacheable && ttsCache.has(text)) return send(ttsCache.get(text));

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.6, similarity_boost: 0.75 } }),
    });
    if (!r.ok) throw Object.assign(new Error(`ElevenLabs TTS ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
    const audio = Buffer.from(await r.arrayBuffer());
    if (cacheable) {
      if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value);
      ttsCache.set(text, audio);
    }
    send(audio);
  } catch (err) {
    sendError(res, err, "elevenlabs");
  }
});

// Speech to text: ElevenLabs first, Groq Whisper as the backup. The audio stays
// in memory for this request only.
app.post("/api/stt", async (req, res) => {
  if (!STT_PROVIDER) return res.status(503).json({ error: "Speech to text is not set up.", fallback: "browser" });
  if (!Buffer.isBuffer(req.body) || req.body.length < 500) return res.status(400).json({ error: "No audio received." });
  const audio = () => new Blob([req.body], { type: req.get("Content-Type") || "audio/webm" });

  const viaEleven = async () => {
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("language_code", "en");
    form.append("file", audio(), "speech.webm");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": elevenKey }, body: form });
    if (!r.ok) throw Object.assign(new Error(`ElevenLabs STT ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
    return ((await r.json()).text || "").trim();
  };
  const viaGroq = async () => {
    const form = new FormData();
    form.append("model", env("GROQ_STT_MODEL") || "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("response_format", "json");
    form.append("file", audio(), "speech.webm");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: form });
    if (!r.ok) throw Object.assign(new Error(`Groq STT ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
    return ((await r.json()).text || "").trim();
  };
  try {
    if (STT_PROVIDER === "elevenlabs") {
      try { return res.json({ text: await viaEleven(), via: "elevenlabs" }); }
      catch (err) { if (!groq) throw err; console.warn("elevenlabs stt failed, using groq:", err.message); }
    }
    res.json({ text: await viaGroq(), via: "groq" });
  } catch (err) {
    sendError(res, err, STT_PROVIDER);
  }
});

// Vercel runs the exported app as a function; locally we listen on a port.
export default app;
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`SMS Shield running at http://localhost:${PORT}`);
    console.log(`  text AI: ${AI_ENABLED ? `${PROVIDER} ${MODEL}` : "demo mode"} | vision: ${VISION_PROVIDER ? `${VISION_PROVIDER} ${VISION_MODEL}` : "off"} | speech to text: ${STT_PROVIDER || "browser"} | AWS (${AWS_REGION}): ${AWS_ENABLED ? "on" : "off"} | ElevenLabs: ${ELEVEN_ENABLED ? "on" : "off"}`);
  });
}
