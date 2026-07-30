import { useEffect, useRef } from "react";

export function ErrorBanner({ message }: { message: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bannerRef.current?.focus();
  }, [message]);

  return (
    <div className="mx-auto max-w-3xl px-6 pt-4">
      <div ref={bannerRef} tabIndex={-1} role="alert"
        className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
        <p className="text-sm font-semibold text-red-300">
          ⚠️ Pipeline Error
        </p>
        <p className="mt-1 text-xs text-white/50">{message}</p>
      </div>
    </div>
  );
}
