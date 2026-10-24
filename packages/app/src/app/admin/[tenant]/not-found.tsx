import { Suspense } from "react";
import { connection } from "next/server";
import { TENANT_NAMES } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { isGroup, TENANT_TREE, type NavEntry } from "../../../components/layout/nav-tree";
import { getMessages } from "../../../i18n/get-messages";
import { BackLink } from "./back-link";

/**
 * A record or page this tenant doesn't have (another tenant's ID included, TEN-014): the message inside
 * the tenant layout, so the tenant header stays, and the way back to the list the address belongs to.
 * Next.js adds `noindex` to every not-found page; only the root one may set its own metadata.
 */
/** The tenant's lists: every sidebar entry under the tenant but its Overview. */
const LISTS = TENANT_TREE.flatMap((node) => (isGroup(node) ? node.children : [node])).filter((leaf) => "section" in leaf && leaf.section);

export default function TenantNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <TenantNotFoundContent />
      </Suspense>
    </main>
  );
}

async function TenantNotFoundContent() {
  await connection();
  const { locale, messages } = await getMessages();
  const t = messages.notFound;
  const lists: NavEntry[] = LISTS.map((leaf) => ({ ...leaf, label: messages.nav[leaf.id] }));

  return (
    <div lang={locale} className="flex flex-col items-start">
      {/* The page's one h1 (design system v1, "Typography"); the way back follows it as the content. */}
      <PageHeader title={t.title} description={t.description} />
      <BackLink
        lists={lists}
        tenants={TENANT_NAMES}
        labels={{ backTo: t.backTo, backToOverview: t.backToOverview, goToTenants: t.goToTenants }}
      />
    </div>
  );
}
