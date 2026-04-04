import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function verify(userId: string, boardId: string) {
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const access = await db.membership.findFirst({ where: { userId, organizationId: board.organizationId } });
  if (!access) return null;
  return board;
}

export async function POST(_: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const board = await verify(user.id, boardId);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.boardFavorite.upsert({
    where: { boardId_userId: { boardId, userId: user.id } },
    create: { boardId, userId: user.id },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const board = await verify(user.id, boardId);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.boardFavorite.deleteMany({ where: { boardId, userId: user.id } });
  return NextResponse.json({ ok: true });
}
