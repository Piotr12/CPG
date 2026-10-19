import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cleanHelpQuery, HELP_QUERY_MAX_LENGTH, searchHelp } from "../../help/search-help";
import { helpTopics } from "../../help/topics";
import { getMessages } from "../../i18n/get-messages";

export const metadata: Metadata = { title: "Help · Caveman Planning Good" };

/** Public: help holds nothing sensitive, and the sign-in screen needs it too (spec Q8). */
export default function HelpPage({ searchParams }: PageProps<"/help">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-96" />}>
        <HelpContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Searched on the server, so it works without JavaScript; in the reader's language. */
async function HelpContent({ searchParams }: Pick<PageProps<"/help">, "searchParams">) {
  await connection();
  const [{ q }, { locale, messages }] = await Promise.all([searchParams, getMessages()]);
  const t = messages.help;
  const query = cleanHelpQuery(q);
  const topics = searchHelp(helpTopics(locale), query);

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <form action="/help" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          maxLength={HELP_QUERY_MAX_LENGTH}
          aria-label={t.searchLabel}
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
        />
        <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {t.search}
        </button>
      </form>
      {query && (
        <p className="text-sm text-zinc-500">
          {topics.length ? t.matches(topics.length, query) : t.noMatch(query)}{" "}
          <Link href="/help" className="underline underline-offset-4">
            {t.showAll}
          </Link>
        </p>
      )}
      {topics.map((topic) => (
        <section key={topic.id} id={topic.id} className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="font-medium">{topic.title}</h2>
          <p className="text-xs text-zinc-500">{t.screen(topic.route)}</p>
          {topic.body.map((paragraph, i) => (
            <p key={`${topic.id}-${i}`} className="text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
