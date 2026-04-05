import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");
  if (!to) return NextResponse.json({ error: "?to=email required" }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const html = `<div style="font-family:Arial;padding:24px;background:#1e293b;color:#e2e8f0;border-radius:12px;max-width:500px;margin:20px auto;">
    <h2 style="color:#818cf8;">✅ Board App — Email Test</h2>
    <p>Your email configuration is working! Invitations will be delivered.</p>
  </div>`;

  // Try Resend first
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "Board App <onboarding@resend.dev>",
          to,
          subject: "✅ Board App — Email Test (Resend)",
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Resend error: ${err}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, provider: "Resend", message: `Test email sent to ${to}` });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Try SMTP
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: smtpUser, pass: smtpPass.replace(/\s/g, "") },
        connectionTimeout: 8000,
      });
      await transporter.verify();
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Board" <${smtpUser}>`,
        to,
        subject: "✅ Board App — Email Test (SMTP)",
        html,
      });
      return NextResponse.json({ success: true, provider: `SMTP (${smtpHost})`, message: `Test email sent to ${to}` });
    } catch (e: any) {
      return NextResponse.json({
        error: e.message,
        hint: e.message.includes("auth") ? "Wrong SMTP_PASS — make sure to use Gmail App Password (no spaces)" : "Check SMTP settings",
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    error: "No email provider configured",
    options: {
      recommended: "Add RESEND_API_KEY to your environment (free at resend.com)",
      alternative: "Add SMTP_HOST + SMTP_USER + SMTP_PASS for Gmail SMTP",
    },
  }, { status: 500 });
}
