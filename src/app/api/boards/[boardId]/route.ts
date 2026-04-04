import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().min(2).optional(),
  stateJson: z.string().optional(),
});

async function verify(userId: string, boardId: string) {
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const access = await db.membership.findFirst({ where: { userId, organizationId: board.organizationId } });
  if (!access) return null;
  return board;
}

export async function GET(_: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const board = await verify(user.id, boardId);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ board });
}

export async function PUT(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const board = await verify(user.id, boardId);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const updated = await db.board.update({ where: { id: boardId }, data: parsed.data });
  return NextResponse.json({ board: updated });
}
