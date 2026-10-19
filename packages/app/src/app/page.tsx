import { Suspense } from "react";
import { connection } from "next/server";
import { getMessages } from "../i18n/get-messages";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-6 py-24">
      <Suspense fallback={<div aria-busy="true" className="min-h-96" />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

/** Request-time, so a signed-in account reads the landing page in its own language (spec Q4). */
async function HomeContent() {
  await connection();
  const { locale, messages } = await getMessages();
  const t = messages.home;

  return (
    <div lang={locale} className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <span className="text-5xl" aria-hidden>
          🦣
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">{t.title}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{t.tagline}</p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-2">
        {t.steps.map((step, i) => (
          <li key={step.name} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="font-mono text-xs text-zinc-500">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 font-medium">{step.name}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.grunt}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm text-zinc-500">{t.motto}</p>
    </div>
  );
}
