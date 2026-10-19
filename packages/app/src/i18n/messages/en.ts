/**
 * Every user-visible string of CPG's screens, in English. `pl.ts` is typed against this object, so a
 * screen can't ship a string that only exists in one language. Strings handed to client components
 * stay plain strings; only server-rendered sections use formatting functions.
 */
export const en = {
  home: {
    title: "Caveman Planning Good",
    tagline: "MRP II. Because planning hard. Caveman try anyway.",
    steps: [
      { name: "Demand Forecast", grunt: "Guess what people want. They want something else." },
      { name: "Bill of Materials", grunt: "Know what things made of. Before making them." },
      { name: "Production Planning", grunt: "Decide what make, how much, when." },
      { name: "Production Execution", grunt: "Make things. Learn why plan wrong." },
    ],
    motto: "Demand come. Caveman plan. Caveman make.",
  },
  login: {
    title: "🦣 Sign in to CPG",
    description: "Use your CPG account.",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
  },
  admin: {
    heading: "Cave control",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    database: "Database",
    migrationsApplied: (count: number) => `${count} migrations applied`,
    migrationsPending: (count: number) => `${count} pending`,
    settings: (count: number) => `${count} settings`,
    users: "Users",
    userHome: "Screens for materials, BOMs and transactions arrive with later stories.",
  },
  /** The users screen. Its strings go to client components, so `{username}` is filled in there. */
  users: {
    heading: "Users",
    back: "Cave control",
    neverDeleted: "Users are never deleted. Deactivate an account to end its access; its history keeps its name.",
    empty: "No accounts yet.",
    columns: { username: "Username", role: "Role", status: "Status", created: "Created", actions: "Actions" },
    roles: { admin: "admin", user: "user" },
    status: { active: "Active", inactive: "Inactive" },
    menu: { label: "Actions for {username}", reset: "Reset password", deactivate: "Deactivate", reactivate: "Reactivate" },
    cancel: "Cancel",
    create: {
      open: "Create user",
      title: "Create user",
      description: "They sign in at /login with this username and password. Only you can change the password later.",
      username: "Username",
      password: "Initial password",
      passwordHint: "At least 12 characters.",
      submit: "Create user",
      submitting: "Creating…",
    },
    reset: {
      title: "Reset password for {username}",
      description: "This signs them out everywhere. Tell them the new password yourself.",
      password: "New password",
      passwordHint: "At least 12 characters.",
      submit: "Reset password",
      submitting: "Resetting…",
    },
    deactivate: {
      title: "Deactivate {username}?",
      description: "{username} is signed out everywhere and can't sign in until reactivated. The account and its history stay.",
      confirm: "Deactivate",
    },
    reactivate: {
      title: "Reactivate {username}?",
      description:
        "{username} can sign in again with their current password. Reset it too if the account may have been compromised.",
      confirm: "Reactivate",
    },
    fieldErrors: {
      usernameFormat: "Use 3–32 lowercase letters, digits, dots, dashes or underscores.",
      passwordTooShort: "Use at least 12 characters.",
      passwordTooLong: "Use at most 256 characters.",
    },
    /** What these error codes mean on the users screen, merged over the shared `errors` by `usersLabels`. */
    errors: {
      CONFLICT: "That username is taken.",
      NOT_FOUND: "That user no longer exists.",
      FORBIDDEN: "Only the administrator can manage users.",
    },
  },
  nav: {
    help: "Help",
  },
  help: {
    heading: "Help",
    searchLabel: "Search help",
    search: "Search",
    matches: (count: number, query: string) => `${count} ${count === 1 ? "topic matches" : "topics match"} “${query}”.`,
    noMatch: (query: string) => `No help topics match “${query}”.`,
    showAll: "Show all topics",
    screen: (route: string) => `Screen: ${route}`,
  },
  preferences: {
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
  },
  /** Keyed by the result envelope's error `code`; unknown codes fall back to the server's message. */
  errors: {
    UNAUTHORIZED: "You need to sign in.",
    TOO_MANY_ATTEMPTS: "Too many attempts. Try again in a few minutes.",
    VALIDATION_FAILED: "Some fields are invalid.",
    INTERNAL: "Something went wrong. Try again.",
  },
};

export type Messages = typeof en;
