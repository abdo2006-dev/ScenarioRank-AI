export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-4">
      <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
        <p className="text-sm font-semibold text-red-300">
          ⚠️ Pipeline Error
        </p>
        <p className="mt-1 text-xs text-white/50">{message}</p>
      </div>
    </div>
  );
}
