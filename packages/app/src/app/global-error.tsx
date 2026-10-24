"use client";

import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Button } from "@cpg/ui/components/button";
import { fill } from "../i18n/fill";
import { ERROR_BOUNDARY } from "../i18n/messages/error-boundary";
import { errorReference } from "./error-reference";
import "./globals.css";

/**
 * An error in the root layout itself: this page replaces the layout, so it brings its own document and
 * styles, and knows neither the reader's language nor the theme. Like the `<noscript>` notice, it says
 * everything in both languages, English first. Try again re-fetches and re-renders (`retry`).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorReference(error);

  return (
    <html lang="en">
      <body className="min-h-full font-sans">
        <title>Something went wrong · Caveman Planning Good</title>
        <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
          <ErrorMessage>
            <div className="flex flex-col gap-2">
              {(["en", "pl"] as const).map((lang) => (
                <p key={lang} lang={lang}>
                  <span className="font-medium">{ERROR_BOUNDARY[lang].title}</span>{" "}
                  {fill(ERROR_BOUNDARY[lang].description, { digest })}
                </p>
              ))}
            </div>
          </ErrorMessage>
          <Button onClick={() => retry()}>
            <span lang="en">{ERROR_BOUNDARY.en.retry}</span> / <span lang="pl">{ERROR_BOUNDARY.pl.retry}</span>
          </Button>
        </main>
      </body>
    </html>
  );
}
