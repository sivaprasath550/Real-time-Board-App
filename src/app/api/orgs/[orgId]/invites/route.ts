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

/** Detect the true public origin of the request (works on Railway, Vercel, localhost) */
function getOrigin(request: Request): string {
  // 1. Explicit env var always wins
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes("localhost")) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  // 2. Railway / Vercel forward headers
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

async function sendRealEmail(
  to: string,
  inviterName: string,
  orgName: string,
  acceptUrl: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  const declineUrl = acceptUrl.replace("/invite/", "/invite/") + "/decline";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Board Invite</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 36px;">
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">You're invited! 🎉</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Join your team on <strong>Board</strong></p>
    </div>
    <div style="padding:36px;">
      <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        <strong style="color:#fff">${inviterName}</strong> has invited you to join
        <strong style="color:#a5b4fc">${orgName}</strong> on Board — a real-time collaborative whiteboard powered by AI.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${acceptUrl}"
           style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;">
          ✅ Accept Invite
        </a>
      </div>
      <p style="color:#64748b;font-size:12px;text-align:center;word-break:break-all;">
        Or open this link: <a href="${acceptUrl}" style="color:#818cf8">${acceptUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? `"Board" <${process.env.SMTP_USER}>`,
    to,
    subject: `${inviterName} invited you to join ${orgName} on Board`,
    html,
  });

  console.log(`[Board] ✅ Invite email sent to ${to}`);
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
  if (!membership) return NextResponse.json({ error: "Forbidden — you must be a member of this org" }, { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

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

  // Build absolute accept URL using real public origin
  const origin = getOrigin(request);
  const acceptUrl = `${origin}/invite/${token}`;

  const hasSmtp =
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS;

  // ── Fire email in background — never block the response ──────────────
  if (hasSmtp) {
    // Do NOT await — send email asynchronously so user gets link instantly
    sendRealEmail(parsed.data.email, user.name, org?.name ?? "your org", acceptUrl)
      .then(() => console.log(`[Board] ✅ Invite email sent to ${parsed.data.email}`))
      .catch((e: any) => console.error(`[Board] ❌ Email failed for ${parsed.data.email}:`, e?.message));
  }

  // Return the invite link immediately — UI shows modal right away
  return NextResponse.json({
    invite,
    acceptUrl,
    emailSent: hasSmtp,
    message: hasSmtp
      ? `📨 Invite link created — email is being sent to ${parsed.data.email}`
      : "📋 Share this invite link with your teammate:",
  });
}
