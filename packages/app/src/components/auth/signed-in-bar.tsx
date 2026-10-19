import Link from "next/link";
import { Button } from "@cpg/ui/components/button";
import type { Locale, SessionUser, Theme } from "@cpg/core";
import { signOut, updatePreferences } from "../../app/admin/actions";
import type { Messages } from "../../i18n/messages/en";
import { PreferencesControls } from "../preferences/preferences-controls";

/**
 * The admin pages' header: the API tokens link, who is signed in, the language and theme switches,
 * and sign-out. The admin also gets the link to the users screen.
 */
export function SignedInBar({
  user,
  locale,
  theme,
  messages,
}: {
  user: Pick<SessionUser, "username" | "role">;
  locale: Locale;
  theme: Theme;
  messages: Messages;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
      <Link href="/admin/tokens" className="font-medium text-foreground underline underline-offset-4">
        {messages.admin.tokens}
      </Link>
      {user.role === "admin" && (
        <Link href="/admin/users" className="font-medium text-foreground underline underline-offset-4">
          {messages.admin.users}
        </Link>
      )}
      <span>
        {messages.admin.signedInAs} <strong className="text-foreground">{user.username}</strong>
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
