import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "@cpg/ui/components/button";
import type { Locale, Theme } from "@cpg/core";
import { signOut, updatePreferences } from "../../app/admin/actions";
import type { Messages } from "../../i18n/messages/en";
import { PreferencesControls } from "../preferences/preferences-controls";
import { TOKENS_PATH } from "./nav-tree";

/**
 * The signed-in account's own controls, in the account card's popover: who is signed in, language
 * and theme, its API tokens, and sign-out.
 */
export function AccountPanel({ username, locale, theme, messages }: { username: string; locale: Locale; theme: Theme; messages: Messages }) {
  return (
    <div data-account-panel className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">
        {messages.nav.signedInAs} <strong className="break-all text-foreground">{username}</strong>
      </p>
      <PreferencesControls locale={locale} theme={theme} labels={messages.preferences} action={updatePreferences} />
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={TOKENS_PATH}>
          <KeyRoundIcon aria-hidden />
          {messages.nav.tokens}
        </Link>
      </Button>
      <form action={signOut} data-action="sign-out">
        <Button type="submit" variant="outline" size="sm">
          {messages.nav.signOut}
        </Button>
      </form>
    </div>
  );
}
