import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const apiKey = process.env.GEMINI_API_KEY;

const geminiResponseSchema = z.object({
  answer: z.string().min(1),
  notes: z
    .array(
      z.object({
        title: z.string().min(1),
        content: z.union([z.string(), z.array(z.string())]).transform((v) =>
          Array.isArray(v) ? v.join("\n") : v
        ),
      }),
    )
    .optional(),
});

function extractJson(text: string) {
  try {
    const rawMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (rawMatch) {
      return JSON.parse(rawMatch[1]) as unknown;
    }
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    let firstArr = text.indexOf("[");
    let lastArr = text.lastIndexOf("]");
    
    const isArray = firstArr !== -1 && (first === -1 || firstArr < first);
    
    if (isArray && lastArr !== -1) {
      return JSON.parse(text.slice(firstArr, lastArr + 1)) as unknown;
    } else if (first !== -1 && last !== -1) {
      return JSON.parse(text.slice(first, last + 1)) as unknown;
    }
  } catch (e) {
    console.error("JSON Extraction Failed! Raw Output: ", text);
    throw e;
  }
  throw new Error("No JSON object or array found in Gemini response.");
}

export async function generateBoardBotResponse(args: {
  message: string;
  existingNotes: Array<{ title: string; content: string }>;
}) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const existing = args.existingNotes
    .slice(0, 12)
    .map((n, idx) => `Note ${idx + 1}: ${n.title}\n${n.content}`)
    .join("\n\n");

  const prompt = [
    "You are BoardBot, a helpful assistant for a collaborative whiteboard app.",
    "The user can request explanations, improvement ideas, summaries, and action plans.",
    "Important: you MUST respond with ONLY valid JSON.",
    '{ "answer": string, "notes"?: Array<{ "title": string, "content": string }> }',
    "Existing notes you may reference:",
    existing || "(none)",
    `User message: ${args.message}`,
  ].join("\n");

  const resp = await model.generateContent(prompt);
  const parsed = geminiResponseSchema.parse(extractJson(resp.response.text()));
  return { answer: parsed.answer, notes: parsed.notes ?? [] };
}


// NEW FEATURES BELOW

export async function generateMindmap(topic: string) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = [
    `I am building a mindmap about: "${topic}"`,
    "Break this concept down into 5-8 sub-concepts that I can put on sticky notes.",
    "Respond with a JSON array of strings ONLY. Example: [\"Data Layer\", \"UI Components\", \"State\"]"
  ].join("\n");

  const resp = await model.generateContent(prompt);
  return extractJson(resp.response.text()) as string[];
}

export async function organizeNotes(notes: Array<{ id: string, text: string }>) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = [
    "I have the following notes on my whiteboard. I want to organize them into 3-5 thematic columns.",
    "Categorize them. Return a JSON array of objects, where each object has 'themeName' (string) and 'noteIds' (array of strings).",
    "Notes:",
    JSON.stringify(notes)
  ].join("\n");

  const resp = await model.generateContent(prompt);
  return extractJson(resp.response.text()) as Array<{ themeName: string, noteIds: string[] }>;
}

export async function generateDebateTurn(history: string[], isSkeptic: boolean) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const role = isSkeptic ? "The Skeptic" : "The Visionary";
  const attitude = isSkeptic 
    ? "You are critical, pointing out flaws, risks, scaling issues, and constraints."
    : "You are optimistic, proposing wild ideas, benefits, user experience improvements, and future possibilities.";

  const prompt = [
    `You are ${role} in a debate about a given topic on a collaborative whiteboard.`,
    attitude,
    "Here is the history of the whiteboard (previous sticky notes):",
    ...history.slice(-10),
    "Write exactly one new sticky note for yourself to add to the debate. Keep it punchy, short, and to the point (max 1-2 sentences).",
    "Respond with ONLY a JSON object: { \"text\": \"your argument\" }"
  ].join("\n");

  const resp = await model.generateContent(prompt);
  const parsed = extractJson(resp.response.text()) as { text: string };
  return parsed.text;
}

export async function processVoiceCommand(transcript: string) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = [
    "The user spoke the following voice command to their collaborative whiteboard:",
    `"${transcript}"`,
    "Extract actionable info. Return a JSON object formatted exactly as:",
    '{ "action": "pros_cons", "topic": "...", "pros": ["...", "..."], "cons": ["...", "..."] }',
    "OR if it's just a general question:",
    '{ "action": "answer", "text": "..." }',
  ].join("\n");

  const resp = await model.generateContent(prompt);
  return extractJson(resp.response.text());
}

export async function generateUIFromSketch(svgContent: string) {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = [
    "I have drawn a wireframe on my digital whiteboard. Here is an SVG representation of my strokes.",
    "Do not get confused by the exact path math. Just use the general layout and boundaries to infer what UI component I am sketch (e.g. a card, form, button, list, profile, chart).",    
    "Return fully functional Tailwind HTML to replace the drawing. Make it incredibly beautiful using modern UI paradigms. Include vibrant colors if appropriate, or a sleek dark theme. Only use standard HTML/Tailwind classes, no external React components.",
    "Return ONLY a valid JSON object matching exactly: { \"html\": \"<div class='...'>...</div>\" }",
    "SVG Strokes Data:",
    svgContent
  ].join("\n");

  const resp = await model.generateContent(prompt);
  const parsed = extractJson(resp.response.text()) as { html: string };
  return parsed.html;
}
