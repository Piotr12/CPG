import { Button } from "@cpg/ui/components/button";
import type { Locale, Theme } from "@cpg/core";
import { signOut, updatePreferences } from "../../app/admin/actions";
import type { Messages } from "../../i18n/messages/en";
import { PreferencesControls } from "../preferences/preferences-controls";

/** The signed-in account's own controls in the menu: who is signed in, language and theme, and sign-out. */
export function AccountPanel({
  username,
  locale,
  theme,
  messages,
}: {
  username: string;
  locale: Locale;
  theme: Theme;
  messages: Messages;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">
        {messages.nav.signedInAs} <strong className="break-all text-foreground">{username}</strong>
      </p>
      <PreferencesControls locale={locale} theme={theme} labels={messages.preferences} action={updatePreferences} />
      <form action={signOut} data-action="sign-out">
        <Button type="submit" variant="outline" size="sm">
          {messages.nav.signOut}
        </Button>
      </form>
    </div>
  );
}
