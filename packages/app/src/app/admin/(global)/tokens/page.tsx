import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireUser } from "../../../../auth/require-admin";
import { CreateTokenDialog } from "../../../../components/api-tokens/create-token-dialog";
import { tokensLabels } from "../../../../components/api-tokens/labels";
import { TokensTable } from "../../../../components/api-tokens/tokens-table";
import { getMessages } from "../../../../i18n/get-messages";

export const metadata: Metadata = { title: "API tokens · Caveman Planning Good" };

export default function TokensPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
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
    <div lang={locale}>
      <PageHeader title={t.heading} description={t.intro} actions={<CreateTokenDialog labels={t} />} />
      <TokensTable tokens={tokens} labels={t} />
    </div>
  );
}
