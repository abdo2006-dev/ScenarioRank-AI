import type { ReactNode } from "react";

function cn(...classes: (string | undefined | false)[]) { return classes.filter(Boolean).join(" "); }
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-white/10 bg-white/5 backdrop-blur p-5", className)}>{children}</div>;
}
export function Badge({ children, color = "default" }: { children: ReactNode; color?: "default" | "amber" | "blue" }) {
  const colors = { default: "bg-white/10 text-white/70", amber: "bg-amber-400/15 text-amber-300", blue: "bg-blue-400/15 text-blue-300" };
  return <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", colors[color])}>{children}</span>;
}
export function ScoreBar({ value, max = 10, color = "#f59e0b" }: { value: number; max?: number; color?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(value / max) * 100}%`, background: color }} /></div>;
}
