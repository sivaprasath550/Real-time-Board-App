import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

function getOrigin(request: Request): string {
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes("localhost")) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}

function buildEmailHtml(inviterName: string, orgName: string, acceptUrl: string) {
  return `<!DOCTYPE html>
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
        <strong style="color:#a5b4fc">${orgName}</strong> on Board — a real-time collaborative whiteboard.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${acceptUrl}"
           style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;">
          ✅ Accept Invite
        </a>
      </div>
      <p style="color:#64748b;font-size:12px;text-align:center;word-break:break-all;">
        Or copy this link: <a href="${acceptUrl}" style="color:#818cf8">${acceptUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** Returns null on success, error message string on failure */
async function trySendEmail(to: string, subject: string, html: string): Promise<string | null> {
  // ── 1. Resend API (BEST - works everywhere, free 100/day) ─────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "Board App <onboarding@resend.dev>",
          to,
          subject,
          html,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text();
        return `Resend error (${res.status}): ${body}`;
      }
      console.log(`[Board] ✅ Resend email sent to ${to}`);
      return null; // success
    } catch (e: any) {
      return `Resend exception: ${e.message}`;
    }
  }

  // ── 2. SMTP fallback ──────────────────────────────────────────────────
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: smtpUser, pass: smtpPass.replace(/\s/g, "") },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Board" <${smtpUser}>`,
        to,
        subject,
        html,
      });
      console.log(`[Board] ✅ SMTP email sent to ${to}`);
      return null; // success
    } catch (e: any) {
      return `SMTP error: ${e.message}`;
    }
  }

  return "No email provider configured. Add RESEND_API_KEY to Railway Variables.";
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

  const origin = getOrigin(request);
  const acceptUrl = `${origin}/invite/${token}`;
  const subject = `${user.name} invited you to join ${org?.name ?? "a workspace"} on Board`;
  const html = buildEmailHtml(user.name, org?.name ?? "your org", acceptUrl);

  // Send email and surface the result (with 12s max wait)
  const emailError = await Promise.race([
    trySendEmail(parsed.data.email, subject, html),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve("Email timed out after 12s — check Railway logs"), 12000)
    ),
  ]);

  console.log(emailError
    ? `[Board] ❌ Email to ${parsed.data.email}: ${emailError}`
    : `[Board] ✅ Email delivered to ${parsed.data.email}`
  );

  return NextResponse.json({
    invite,
    acceptUrl,
    emailSent: !emailError,
    emailError: emailError ?? null,
    message: !emailError
      ? `✅ Invite email sent to ${parsed.data.email}!`
      : `📋 Email failed (${emailError}) — copy this link and share it manually:`,
  });
}
