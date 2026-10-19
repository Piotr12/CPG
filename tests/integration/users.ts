import type { Browser } from "./browser";

/** Creates a normal user on /admin/users, as the signed-in admin. */
export async function createUser(admin: Browser, baseUrl: string, username: string, password: string) {
  await admin.open(`${baseUrl}/admin/users`);
  await admin.waitFor("table");
  await admin.clickRole("button", "Create user");
  await admin.fillLabel("Username", username);
  await admin.fillLabel("Initial password", password);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(username);
}
