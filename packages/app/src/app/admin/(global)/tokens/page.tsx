import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { CreateTokenDialog } from "../../../../components/api-tokens/create-token-dialog";
import { tokensLabels } from "../../../../components/api-tokens/labels";
import { TokensTable } from "../../../../components/api-tokens/tokens-table";
import { getMessages } from "../../../../i18n/get-messages";

export const metadata: Metadata = { title: "API tokens · Caveman Planning Good" };

export default function TokensPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <TokensContent />
      </Suspense>
    </main>
  );
}

/** Any signed-in account: its own tokens, and the controls to create and revoke them. */
async function TokensContent() {
  await connection();
  const user = await requireUser();
  const { apiTokenService } = (await requestScope()).cradle;
  const [tokens, { locale, messages }] = await Promise.all([apiTokenService.list(user.userId), getMessages()]);
  const t = tokensLabels(messages);

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
        <Link href="/admin" className="text-sm font-medium underline underline-offset-4">
          {t.back}
        </Link>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        <CreateTokenDialog labels={t} />
      </div>
      <TokensTable tokens={tokens} labels={t} />
    </div>
  );
}
