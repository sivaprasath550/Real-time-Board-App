import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  title: z.string().min(2),
  organizationId: z.string().min(1),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });

  const hasAccess = await db.membership.findFirst({ where: { userId: user.id, organizationId } });
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const boards = await db.board.findMany({
    where: { organizationId },
    include: { favorites: { where: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    boards: boards.map((b) => ({
      id: b.id,
      title: b.title,
      updatedAt: b.updatedAt,
      isFavorite: b.favorites.length > 0,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const hasAccess = await db.membership.findFirst({
    where: { userId: user.id, organizationId: parsed.data.organizationId },
  });
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const board = await db.board.create({
    data: {
      title: parsed.data.title,
      organizationId: parsed.data.organizationId,
    },
  });
  return NextResponse.json({ board });
}
