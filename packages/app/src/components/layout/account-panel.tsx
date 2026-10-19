import { Button } from "@cpg/ui/components/button";
import { cn } from "@cpg/ui/lib/utils";
import type { Locale, Theme } from "@cpg/core";
import { signOut, updatePreferences } from "../../app/admin/actions";
import type { Messages } from "../../i18n/messages/en";
import { PreferencesControls } from "../preferences/preferences-controls";

/**
 * The signed-in account's own controls in the menu: who is signed in, language and theme, and sign-out.
 * `stacked` fills the popover and the sheet; `inline` is one row in the bar from `xl`, where the name
 * is truncated and "Signed in as" is left to screen readers to save room.
 */
export function AccountPanel({
  username,
  locale,
  theme,
  messages,
  layout = "stacked",
}: {
  username: string;
  locale: Locale;
  theme: Theme;
  messages: Messages;
  layout?: "stacked" | "inline";
}) {
  const isInline = layout === "inline";

  return (
    <div data-account-panel={layout} className={cn("flex gap-3", isInline ? "items-center" : "flex-col items-start")}>
      <p className={cn("text-sm text-muted-foreground", isInline && "flex min-w-0")}>
        <span className={cn(isInline && "sr-only")}>{messages.nav.signedInAs} </span>
        <strong title={username} className={cn("text-foreground", isInline ? "max-w-32 truncate" : "break-all")}>
          {username}
        </strong>
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
