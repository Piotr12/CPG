import type { Messages } from "./en";

/** Polish. Same shape as `en`; "Caveman Planning Good" is the product name and stays as it is. */
export const pl: Messages = {
  home: {
    title: "Caveman Planning Good",
    tagline: "MRP II. Bo planowanie trudne. Jaskiniowiec i tak próbuje.",
    steps: [
      { name: "Prognoza popytu", grunt: "Zgadnij, czego ludzie chcą. Chcą czegoś innego." },
      { name: "Struktura wyrobu", grunt: "Wiedz, z czego rzeczy zrobione. Zanim je zrobisz." },
      { name: "Planowanie produkcji", grunt: "Zdecyduj, co robić, ile i kiedy." },
      { name: "Realizacja produkcji", grunt: "Rób rzeczy. Dowiedz się, czemu plan zły." },
    ],
    motto: "Popyt przyjść. Jaskiniowiec planować. Jaskiniowiec robić.",
  },
  login: {
    title: "🦣 Zaloguj się do CPG",
    description: "Użyj swojego konta CPG.",
    username: "Nazwa użytkownika",
    password: "Hasło",
    submit: "Zaloguj",
    submitting: "Logowanie…",
  },
  admin: {
    heading: "Kontrola jaskini",
    signedInAs: "Zalogowano jako",
    signOut: "Wyloguj",
    database: "Baza danych",
    migrationsApplied: (count) => `Zastosowane migracje: ${count}`,
    migrationsPending: (count) => `Oczekujące: ${count}`,
    settings: (count) => `Ustawienia: ${count}`,
  },
  preferences: {
    language: "Język",
    theme: "Motyw",
    light: "Jasny",
    dark: "Ciemny",
  },
  errors: {
    UNAUTHORIZED: "Musisz się zalogować.",
    TOO_MANY_ATTEMPTS: "Zbyt wiele prób. Spróbuj ponownie za kilka minut.",
    VALIDATION_FAILED: "Niektóre pola są nieprawidłowe.",
    INTERNAL: "Coś poszło nie tak. Spróbuj ponownie.",
  },
};
