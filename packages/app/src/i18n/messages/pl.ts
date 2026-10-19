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
    users: "Użytkownicy",
    userHome: "Ekrany materiałów, BOM-ów i transakcji pojawią się w kolejnych etapach.",
  },
  users: {
    heading: "Użytkownicy",
    back: "Kontrola jaskini",
    neverDeleted: "Użytkownicy nigdy nie są usuwani. Dezaktywuj konto, aby odebrać dostęp; historia zachowa jego nazwę.",
    empty: "Nie ma jeszcze kont.",
    columns: { username: "Nazwa użytkownika", role: "Rola", status: "Stan", created: "Utworzono", actions: "Akcje" },
    roles: { admin: "administrator", user: "użytkownik" },
    status: { active: "Aktywny", inactive: "Nieaktywny" },
    menu: { label: "Akcje dla {username}", reset: "Resetuj hasło", deactivate: "Dezaktywuj", reactivate: "Aktywuj ponownie" },
    cancel: "Anuluj",
    create: {
      open: "Utwórz użytkownika",
      title: "Nowy użytkownik",
      description: "Loguje się na /login tą nazwą i hasłem. Tylko ty możesz później zmienić hasło.",
      username: "Nazwa użytkownika",
      password: "Hasło początkowe",
      passwordHint: "Co najmniej 12 znaków.",
      submit: "Utwórz użytkownika",
      submitting: "Tworzenie…",
    },
    reset: {
      title: "Reset hasła: {username}",
      description: "To wyloguje użytkownika ze wszystkich sesji. Przekaż mu nowe hasło osobiście.",
      password: "Nowe hasło",
      passwordHint: "Co najmniej 12 znaków.",
      submit: "Resetuj hasło",
      submitting: "Resetowanie…",
    },
    deactivate: {
      title: "Dezaktywować {username}?",
      description: "{username} zostanie wylogowany ze wszystkich sesji i nie zaloguje się do czasu ponownej aktywacji. Konto i jego historia zostają.",
      confirm: "Dezaktywuj",
    },
    reactivate: {
      title: "Aktywować ponownie {username}?",
      description:
        "{username} znów zaloguje się obecnym hasłem. Zresetuj je także, jeśli konto mogło zostać przejęte.",
      confirm: "Aktywuj ponownie",
    },
    fieldErrors: {
      usernameFormat: "Użyj 3–32 małych liter, cyfr, kropek, myślników lub podkreśleń.",
      passwordTooShort: "Użyj co najmniej 12 znaków.",
      passwordTooLong: "Użyj co najwyżej 256 znaków.",
    },
    errors: {
      CONFLICT: "Ta nazwa użytkownika jest zajęta.",
      NOT_FOUND: "Ten użytkownik już nie istnieje.",
      FORBIDDEN: "Tylko administrator może zarządzać użytkownikami.",
    },
  },
  nav: {
    help: "Pomoc",
  },
  help: {
    heading: "Pomoc",
    searchLabel: "Szukaj w pomocy",
    search: "Szukaj",
    matches: (count, query) => `Pasujące tematy dla „${query}”: ${count}.`,
    noMatch: (query) => `Żaden temat nie pasuje do „${query}”.`,
    showAll: "Pokaż wszystkie tematy",
    screen: (route) => `Ekran: ${route}`,
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
