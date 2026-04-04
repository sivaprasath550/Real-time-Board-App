import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token } = await params;
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  if (invite.email !== user.email) {
    return NextResponse.json({ error: "Invite email mismatch" }, { status: 403 });
  }

  await db.$transaction([
    db.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invite.organizationId } },
      create: { userId: user.id, organizationId: invite.organizationId, role: invite.role },
      update: { role: invite.role },
    }),
    db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
