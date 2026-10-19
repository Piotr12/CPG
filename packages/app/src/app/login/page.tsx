import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { currentUser } from "../../auth/require-admin";
import { en } from "../../i18n/messages/en";
import { signIn } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Caveman Planning Good" };

/** Only ever seen signed out (a signed-in admin is sent on), so it speaks the default language. */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{en.login.title}</CardTitle>
          <CardDescription>{en.login.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm action={signIn} labels={en.login} />
        </CardContent>
      </Card>
      <Suspense>
        <RedirectWhenSignedIn />
      </Suspense>
    </main>
  );
}

/** Someone already signed in has nothing to do here. */
async function RedirectWhenSignedIn() {
  await connection();
  if ((await currentUser())?.role === "admin") redirect("/admin");
  return null;
}
