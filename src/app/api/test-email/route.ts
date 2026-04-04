import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");
  if (!to) return NextResponse.json({ error: "?to=email required" }, { status: 400 });

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({
      error: "SMTP not configured",
      hint: "Add SMTP_HOST, SMTP_USER, SMTP_PASS to your .env file",
      configured: {
        SMTP_HOST: !!process.env.SMTP_HOST,
        SMTP_USER: !!process.env.SMTP_USER,
        SMTP_PASS: !!process.env.SMTP_PASS,
      },
    }, { status: 500 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"Board App" <${process.env.SMTP_USER}>`,
      to,
      subject: "✅ Board App — Email Test",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:20px auto;background:#1e293b;color:#e2e8f0;padding:24px;border-radius:12px;">
          <h2 style="color:#818cf8;">✅ Email is working!</h2>
          <p>Your Board App SMTP config is correctly set up. Invitations will now be delivered to real inboxes.</p>
          <p style="color:#64748b;font-size:12px;">Sent via ${process.env.SMTP_HOST}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
