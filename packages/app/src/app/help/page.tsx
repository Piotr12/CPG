import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { cleanHelpQuery, HELP_QUERY_MAX_LENGTH, searchHelp } from "../../help/search-help";
import { helpTopics } from "../../help/topics";
import { getMessages } from "../../i18n/get-messages";

export const metadata: Metadata = { title: "Help · Caveman Planning Good" };

/** Public: help holds nothing sensitive, and the sign-in screen needs it too (spec Q8). */
export default function HelpPage({ searchParams }: PageProps<"/help">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
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
      <form action="/help" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="help-q">{t.searchLabel}</Label>
          <Input id="help-q" type="search" name="q" defaultValue={query} maxLength={HELP_QUERY_MAX_LENGTH} />
        </div>
        <Button type="submit">{t.search}</Button>
      </form>
      {query && (
        <p className="max-w-prose text-muted-foreground">
          {topics.length ? t.matches(topics.length, query) : t.noMatch(query)}{" "}
          <Link href="/help" className="text-foreground underline underline-offset-4">
            {t.showAll}
          </Link>
        </p>
      )}
      {topics.map((topic) => (
        <section key={topic.id} id={topic.id} className="flex max-w-prose flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-lg font-semibold">{topic.title}</h2>
          <p className="text-xs text-muted-foreground">{t.screen(topic.route)}</p>
          {topic.body.map((paragraph, i) => (
            <p key={`${topic.id}-${i}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
