import { Suspense } from "react";
import { WorkspaceApp } from "@/components/workspace/workspace-app";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--background)]" aria-hidden />}>
      <WorkspaceApp />
    </Suspense>
  );
}
