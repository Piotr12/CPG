"use client";

import { useSyncExternalStore } from "react";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Button } from "@cpg/ui/components/button";
import { fill } from "../i18n/fill";
import { ERROR_BOUNDARY } from "../i18n/messages/error-boundary";
import { errorReference } from "./error-reference";

/** `DocumentPreferences` keeps `<html lang>` on the reader's language; nothing re-renders this page when it changes. */
const noSubscription = () => () => {};
const documentLang = () => document.documentElement.lang;
const serverLang = () => "en";

/**
 * An unexpected error under the root layout, so the sidebar stays (spec "States and copy"). A client
 * boundary can't call `getMessages()`, so it speaks the language `<html lang>` carries: Polish when it is
 * `pl`, English otherwise. Try again re-fetches and re-renders the failed segment (`retry`, which
 * replaces `reset` in this Next.js: `reset` only re-renders, so a server error would simply recur).
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const lang = useSyncExternalStore(noSubscription, documentLang, serverLang) === "pl" ? "pl" : "en";
  const t = ERROR_BOUNDARY[lang];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <div lang={lang} className="flex flex-col items-start gap-4">
        <ErrorMessage>
          <p className="font-medium">{t.title}</p>
          <p>{fill(t.description, { digest: errorReference(error) })}</p>
        </ErrorMessage>
        <Button onClick={() => retry()}>{t.retry}</Button>
      </div>
    </main>
  );
}
