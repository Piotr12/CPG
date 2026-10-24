import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { Button } from "@cpg/ui/components/button";
import { getMessages } from "../i18n/get-messages";

/** Next.js adds `noindex` to a 404 itself; this says so for the streamed case, which answers 200 (lesson 2026-10-19). */
export const metadata: Metadata = { title: "Page not found · Caveman Planning Good", robots: { index: false } };

/** An unknown address, or a `notFound()` outside a tenant: inside the shell, in the reader's language. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <NotFoundContent />
      </Suspense>
    </main>
  );
}

async function NotFoundContent() {
  await connection();
  const { locale, messages } = await getMessages();
  const t = messages.notFound;

  return (
    <div lang={locale}>
      <EmptyState title={t.title}>
        <p>{t.description}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin">{t.goToTenants}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
