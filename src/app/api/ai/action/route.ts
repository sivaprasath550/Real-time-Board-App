import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateMindmap, organizeNotes, generateDebateTurn, generateUIFromSketch, processVoiceCommand } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, payload } = body;

    let result;

    if (action === "mindmap") {
      result = await generateMindmap(payload.topic);
    } else if (action === "organize") {
      result = await organizeNotes(payload.notes);
    } else if (action === "debate") {
      result = await generateDebateTurn(payload.history, payload.isSkeptic);
    } else if (action === "voice") {
      result = await processVoiceCommand(payload.transcript);
    } else if (action === "vision") {
      result = await generateUIFromSketch(payload.svg);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (err: any) {
    console.error("AI Action Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
