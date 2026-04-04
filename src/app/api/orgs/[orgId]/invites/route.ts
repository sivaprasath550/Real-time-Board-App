import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import nodemailer from "nodemailer";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

async function sendInviteEmail(
  to: string,
  inviterName: string,
  orgName: string,
  token: string
) {
  const origin = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const fullAcceptUrl = `${origin}/invite/${token}`;
  const fullDeclineUrl = `${origin}/invite/${token}/decline`;

  let transporter: nodemailer.Transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Board Invite</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 36px;">
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">You're invited!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Join your team on <strong>Board</strong></p>
    </div>
    <div style="padding:36px;">
      <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        <strong style="color:#fff">${inviterName}</strong> has invited you to join
        <strong style="color:#a5b4fc">${orgName}</strong> on Board — a real-time collaborative whiteboard powered by AI.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <a href="${fullAcceptUrl}"
           style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">
          ✅ Accept Invite
        </a>
        <a href="${fullDeclineUrl}"
           style="display:inline-block;padding:14px 36px;background:#374151;color:#9ca3af;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">
          ❌ Decline
        </a>
      </div>
      <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">
        This invite link expires in 7 days. If you didn't expect this, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`;

  const info = await transporter.sendMail({
    from: `"Board" <noreply@board.app>`,
    to,
    subject: `${inviterName} invited you to join ${orgName} on Board`,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log(`\n📧 [Board] Invite email preview: ${previewUrl}\n`);
  return previewUrl;
}

export async function GET(_: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const hasAccess = await db.membership.findFirst({ where: { userId: user.id, organizationId: orgId } });
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const invites = await db.invite.findMany({
    where: { organizationId: orgId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invites });
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const membership = await db.membership.findFirst({ where: { userId: user.id, organizationId: orgId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const token = randomBytes(20).toString("hex");
  const org = await db.organization.findUnique({ where: { id: orgId } });

  const invite = await db.invite.create({
    data: {
      token,
      email: parsed.data.email,
      role: parsed.data.role,
      organizationId: orgId,
      createdById: user.id,
    },
  });

  let emailPreview: string | false = false;
  try {
    emailPreview = await sendInviteEmail(parsed.data.email, user.name, org?.name ?? "your org", token);
  } catch (e) {
    console.error("[Board] Email send failed:", e);
  }

  return NextResponse.json({
    invite,
    acceptUrl: `/invite/${token}`,
    emailPreview: emailPreview || null,
    message: emailPreview ? "Invite email sent! Check server console for the preview link." : "Invite created — email delivery failed, copy link manually.",
  });
}
