import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { currentUser } from "../../auth/require-admin";
import { signIn } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Caveman Planning Good" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">🦣 Sign in to CPG</CardTitle>
          <CardDescription>Use your CPG account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm action={signIn} />
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
