import { Button } from "@cpg/ui/components/button";
import type { Locale, Theme } from "@cpg/core";
import { signOut, updatePreferences } from "../../app/admin/actions";
import type { Messages } from "../../i18n/messages/en";
import { PreferencesControls } from "../preferences/preferences-controls";

/** The admin pages' header: who is signed in, the language and theme switches, and sign-out. */
export function SignedInBar({
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
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
      <span>
        {messages.admin.signedInAs} <strong className="text-foreground">{username}</strong>
      </span>
      <PreferencesControls locale={locale} theme={theme} labels={messages.preferences} action={updatePreferences} />
      <form action={signOut} data-action="sign-out">
        <Button type="submit" variant="outline" size="sm">
          {messages.admin.signOut}
        </Button>
      </form>
    </div>
  );
}
