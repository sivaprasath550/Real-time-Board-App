import { NextResponse } from "next/server";

// Keep it in memory across hot-reloads in dev
const globalCursors = (globalThis as any).globalCursors || new Map<string, Map<string, any>>();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).globalCursors = globalCursors;
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { boardId, userId, x, y, name } = data;

    if (!boardId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let boardCursors = globalCursors.get(boardId);
    if (!boardCursors) {
      boardCursors = new Map<string, any>();
      globalCursors.set(boardId, boardCursors);
    }

    boardCursors.set(userId, { x, y, name, lastUpdate: Date.now() });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");

  if (!boardId) {
    return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
  }

  const boardCursors = globalCursors.get(boardId);
  const cursors: Record<string, any> = {};

  if (boardCursors) {
    const now = Date.now();
    for (const [userId, cursor] of boardCursors.entries()) {
      // Remove cursors inactive for over 10 seconds
      if (now - cursor.lastUpdate > 10000) {
        boardCursors.delete(userId);
      } else {
        cursors[userId] = cursor;
      }
    }
  }

  return NextResponse.json({ cursors });
}
