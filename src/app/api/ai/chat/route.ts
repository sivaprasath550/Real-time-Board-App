import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateBoardBotResponse } from "@/lib/gemini";

const bodySchema = z.object({
  boardId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const board = await db.board.findUnique({
    where: { id: parsed.data.boardId },
    select: { id: true, organizationId: true },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const access = await db.membership.findFirst({
    where: { userId: user.id, organizationId: board.organizationId },
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.aiMessage.create({
    data: {
      boardId: parsed.data.boardId,
      userId: user.id,
      role: "user",
      content: parsed.data.message,
    },
  });

  const existingNotes = await db.aiNote.findMany({
    where: { boardId: parsed.data.boardId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { title: true, content: true },
  });

  let bot;
  try {
    bot = await generateBoardBotResponse({ message: parsed.data.message, existingNotes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 },
    );
  }

  if (bot.answer) {
    await db.aiMessage.create({
      data: {
        boardId: parsed.data.boardId,
        userId: user.id,
        role: "assistant",
        content: bot.answer,
      },
    });
  }

  const notesAdded = [];
  for (const n of bot.notes) {
    const created = await db.aiNote.create({
      data: {
        boardId: parsed.data.boardId,
        userId: user.id,
        title: n.title,
        content: n.content,
      },
      select: { id: true, title: true, content: true, createdAt: true },
    });
    notesAdded.push(created);
  }

  return NextResponse.json({ answer: bot.answer, notesAdded });
}

