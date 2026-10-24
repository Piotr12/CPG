import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { Button } from "@cpg/ui/components/button";
import { currentUser, HOME_PATH, SIGN_IN_PATH } from "../auth/require-admin";
import { MammothMark } from "../components/layout/mammoth-mark";
import type { HelpTopicId } from "../help/topics";
import { getMessages } from "../i18n/get-messages";

/** The help topic behind each of `home.steps`, in the same order: ids are routes, not text. */
const HOME_FLOW_TOPICS = ["forecasts", "boms", "production-orders", "stock"] as const satisfies readonly HelpTopicId[];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

/**
 * Request-time, so a signed-in account reads the landing page in its own language (spec Q4) and is
 * offered the way in that fits: Sign in for a visitor, Open CPG for an account.
 */
async function HomeContent() {
  await connection();
  const [user, { locale, messages }] = await Promise.all([currentUser(), getMessages()]);
  const t = messages.home;

  return (
    <div lang={locale} className="flex flex-col gap-8">
      <header className="flex flex-col items-start gap-4">
        <MammothMark size={40} />
        <h1 className="text-4xl font-semibold tracking-tight">{t.title}</h1>
        <p className="max-w-prose text-lg text-muted-foreground">{t.tagline}</p>
        <Button asChild size="lg">
          <Link href={user ? HOME_PATH : SIGN_IN_PATH}>{user ? t.open : t.signIn}</Link>
        </Button>
      </header>

      <ol aria-label={t.flowLabel} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {t.steps.map((step, i) => (
          <li key={HOME_FLOW_TOPICS[i]} className="flex items-center gap-2">
            {i > 0 && <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
            <Link href={`/help#${HOME_FLOW_TOPICS[i]}`} className="text-foreground underline underline-offset-4">
              {step.name}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
