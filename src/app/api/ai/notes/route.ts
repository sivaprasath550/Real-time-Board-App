import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const querySchema = z.object({
  boardId: z.string().min(1),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId");
  const parsed = querySchema.safeParse({ boardId });
  if (!parsed.success) return NextResponse.json({ error: "Missing boardId" }, { status: 400 });

  const board = await db.board.findUnique({
    where: { id: parsed.data.boardId },
    select: { organizationId: true, id: true },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const access = await db.membership.findFirst({
    where: { userId: user.id, organizationId: board.organizationId },
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const notes = await db.aiNote.findMany({
    where: { boardId: parsed.data.boardId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, content: true, createdAt: true },
  });

  return NextResponse.json({ notes });
}

