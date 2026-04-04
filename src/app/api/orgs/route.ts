import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ name: z.string().min(2) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ organizations: memberships.map((m) => m.organization) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const org = await db.organization.create({
    data: {
      name: parsed.data.name,
      memberships: { create: { userId: user.id, role: "owner" } },
    },
  });
  return NextResponse.json({ organization: org });
}
