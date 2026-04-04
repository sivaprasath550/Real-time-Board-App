import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, name, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
