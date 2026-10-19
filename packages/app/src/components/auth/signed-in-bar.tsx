import { Button } from "@cpg/ui/components/button";
import { signOut } from "../../app/admin/actions";

/** "Signed in as …" and the sign-out button, at the top of every admin page's gated content. */
export function SignedInBar({ username }: { username: string }) {
  return (
    <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
      <span>
        Signed in as <strong className="text-foreground">{username}</strong>
      </span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
