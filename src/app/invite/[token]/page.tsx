"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const accept = async () => {
    setStatus("loading");
    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("err");
      setMessage(typeof data.error === "string" ? data.error : "Could not accept invite.");
      return;
    }
    setStatus("ok");
    setMessage("You’re in. Open the workspace to see your organization.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.35), transparent), radial-gradient(ellipse 50% 40% at 100% 60%, rgba(34,211,238,0.12), transparent)",
        }}
      />
      <Card className="relative z-10 w-full max-w-md p-8 shadow-2xl shadow-black/40">
        <h1 className="text-xl font-semibold tracking-tight">Organization invite</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Accept this invite to join the team on Board. You must be signed in with the same email the invite was sent to.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="primary" className="w-full" disabled={status === "loading" || status === "ok"} onClick={accept}>
            {status === "loading" ? "Accepting…" : "Accept invite"}
          </Button>
          <Button variant="secondary" className="w-full" type="button" onClick={() => router.push("/")}>
            Back to workspace
          </Button>
        </div>
        {status === "ok" && (
          <p className="mt-4 flex items-start gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </p>
        )}
        {status === "err" && (
          <p className="mt-4 flex items-start gap-2 text-sm text-red-400">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}
