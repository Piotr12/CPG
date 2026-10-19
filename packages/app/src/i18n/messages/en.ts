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
  },
  tenants: {
    choose: "Choose a tenant",
    open: (name: string) => `Open ${name} →`,
    description: { test: "Demonstration data, safe to experiment", prod: "Live data" },
    strip: {
      test: "Test tenant — demonstration data, safe to experiment",
      prod: "Prod tenant — live data",
      global: "Global — no tenant selected",
    },
    generation: (generation: number) => `Dataset generation ${generation}`,
    noRecords: "No business records yet",
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
