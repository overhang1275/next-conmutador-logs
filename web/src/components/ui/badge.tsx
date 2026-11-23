import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "muted" | "danger" };

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-teal-50 text-teal-800 ring-teal-700/10",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-700/10",
    muted: "bg-slate-100 text-slate-700 ring-slate-700/10",
    danger: "bg-rose-50 text-rose-800 ring-rose-700/10",
  };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", variants[variant], className)} {...props} />;
}
