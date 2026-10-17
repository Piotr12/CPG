const steps = [
  { name: "Demand Forecast", grunt: "Guess what people want. They want something else." },
  { name: "Bill of Materials", grunt: "Know what things made of. Before making them." },
  { name: "Production Planning", grunt: "Decide what make, how much, when." },
  { name: "Production Execution", grunt: "Make things. Learn why plan wrong." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-6 py-24">
      <header className="flex flex-col gap-4">
        <span className="text-5xl" aria-hidden>
          🦣
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Caveman Planning Good</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          MRP II. Because planning hard. Caveman try anyway.
        </p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.name} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="font-mono text-xs text-zinc-500">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 font-medium">{step.name}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.grunt}</p>
          </li>
        ))}
      </ol>

      <footer className="text-sm text-zinc-500">Demand come. Caveman plan. Caveman make.</footer>
    </main>
  );
}
