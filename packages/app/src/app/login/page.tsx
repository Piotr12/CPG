import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { currentUser, HOME_PATH } from "../../auth/require-admin";
import { MammothMark } from "../../components/layout/mammoth-mark";
import { en } from "../../i18n/messages/en";
import { signIn } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Caveman Planning Good" };

/** Only ever seen signed out (anyone signed in is sent on), so it speaks the default language. */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <MammothMark size={20} />
              {en.login.title}
            </h1>
          </CardTitle>
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
  if (await currentUser()) redirect(HOME_PATH);
  return null;
}
