export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">
        A Trade Challenge by Spud
      </p>
      <h1 className="text-5xl font-bold sm:text-7xl">ONE → FIVE</h1>
      <p className="text-xl text-neutral-200 sm:text-2xl">
        $1 → $5,000,000 in 21 Days
      </p>
      <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
        21 Days. Only Trades.
      </p>
    </main>
  );
}
