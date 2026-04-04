import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" &&
          "bg-[var(--accent)] text-white shadow-lg shadow-indigo-500/25 hover:brightness-110",
        variant === "secondary" &&
          "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface)]",
        variant === "ghost" && "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
        variant === "destructive" && "bg-red-500/15 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/25",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
