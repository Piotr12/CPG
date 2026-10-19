import type { Locale } from "@cpg/core";

/** Every help topic, in display order. A new screen adds its topic here, in both languages. */
export const HELP_TOPIC_IDS = [
  "getting-started",
  "signing-in",
  "admin-home",
  "test-and-prod",
  "language-and-theme",
  "using-help",
] as const;
export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

/**
 * The screen each topic explains, as the route of its `page.tsx`: the directory under `src/app` with
 * route groups dropped and dynamic segments kept as written. `tests/every-page-has-help.test.ts` fails
 * when a page has no topic.
 */
export const HELP_TOPIC_ROUTES: Record<HelpTopicId, string> = {
  "getting-started": "/",
  "signing-in": "/login",
  "admin-home": "/admin",
  "test-and-prod": "/admin/[tenant]",
  "language-and-theme": "/admin",
  "using-help": "/help",
};

interface HelpText {
  title: string;
  body: string[];
}

export interface HelpTopic extends HelpText {
  id: HelpTopicId;
  route: string;
}

const en: Record<HelpTopicId, HelpText> = {
  "getting-started": {
    title: "Getting started with CPG",
    body: [
      "CPG is a small MRP II planning tool: it turns what customers want into plans for what to buy and what to make.",
      "Sign in on the sign-in page with the account the administrator gave you. The built-in administrator signs in as admin.",
      "Help is linked at the top of every page, and every new screen of CPG adds its own topic here.",
    ],
  },
  "signing-in": {
    title: "Signing in",
    body: [
      "Enter your username and password, then choose Sign in.",
      "If either is wrong you see “Invalid username or password.” CPG never says which of the two was wrong.",
      "After several failed attempts, signing in pauses for 15 minutes. Wait, then try again.",
      "A session lasts 12 hours. Sign out from the header when you are done.",
    ],
  },
  "admin-home": {
    title: "Cave control",
    body: [
      "Cave control is the administrator's home page.",
      "The Database card shows where CPG keeps its data, how many migrations are applied, whether any are still pending, and how many settings are stored.",
      "A pending migration normally means CPG is still starting. If it stays, tell whoever runs CPG.",
      "Open Test or Open Prod takes you to that tenant's business data.",
    ],
  },
  "test-and-prod": {
    title: "Test and Prod",
    body: [
      "CPG keeps two separate sets of business data: Test, with demonstration data that is safe to experiment with, and Prod, the live data.",
      "The strip at the top of every page says which one you are working in: TEST in amber, PROD in dark with a red edge, or GLOBAL on pages that belong to neither.",
      "Switch with Test and Prod on the right of the strip. Nothing you do in one ever appears in the other, and the same number can mean a different record in each.",
    ],
  },
  "language-and-theme": {
    title: "Language and theme",
    body: [
      "Choose English or Polski, and Light or Dark, in the header next to Sign out.",
      "The choice belongs to your account: it stays after you sign out, follows you to other browsers, and never changes anyone else's.",
      "Before you sign in, CPG shows English and the light theme.",
    ],
  },
  "using-help": {
    title: "Using help",
    body: [
      "Type one or more words and choose Search. Topics that contain every word are shown.",
      "Capital letters and Polish diacritics don't matter: “logowanie” and “LOGOWANIE” find the same topics, and so do “łatwo” and “latwo”.",
      "Every screen of CPG has at least one topic, and new screens add theirs.",
    ],
  },
};

const pl: Record<HelpTopicId, HelpText> = {
  "getting-started": {
    title: "Pierwsze kroki z CPG",
    body: [
      "CPG to małe narzędzie do planowania MRP II: zamienia to, czego chcą klienci, w plany zakupów i produkcji.",
      "Zaloguj się na stronie logowania kontem, które dał ci administrator. Wbudowany administrator loguje się jako admin.",
      "Pomoc jest dostępna u góry każdej strony, a każdy nowy ekran CPG dodaje tu własny temat.",
    ],
  },
  "signing-in": {
    title: "Logowanie",
    body: [
      "Wpisz nazwę użytkownika i hasło, a następnie wybierz Zaloguj.",
      "Jeśli któreś z nich jest błędne, zobaczysz komunikat o nieprawidłowej nazwie użytkownika lub haśle. CPG nigdy nie mówi, które z nich było błędne.",
      "Po kilku nieudanych próbach logowanie zostaje wstrzymane na 15 minut. Odczekaj i spróbuj ponownie.",
      "Sesja trwa 12 godzin. Gdy skończysz, wyloguj się w nagłówku.",
    ],
  },
  "admin-home": {
    title: "Kontrola jaskini",
    body: [
      "Kontrola jaskini to strona startowa administratora.",
      "Karta Baza danych pokazuje, gdzie CPG przechowuje dane, ile migracji zastosowano, czy jakieś jeszcze oczekują i ile ustawień zapisano.",
      "Oczekująca migracja zwykle oznacza, że CPG jeszcze się uruchamia. Jeśli nie znika, powiedz o tym osobie, która utrzymuje CPG.",
      "Przyciski Otwórz Test i Otwórz Prod prowadzą do danych biznesowych wybranego środowiska.",
    ],
  },
  "test-and-prod": {
    title: "Środowiska Test i Prod",
    body: [
      "CPG przechowuje dwa oddzielne zbiory danych biznesowych: Test z danymi demonstracyjnymi, na których można bezpiecznie eksperymentować, oraz Prod z danymi rzeczywistymi.",
      "Pasek u góry każdej strony pokazuje, w którym środowisku pracujesz: TEST na bursztynowo, PROD na ciemno z czerwoną krawędzią albo GLOBAL na stronach, które nie należą do żadnego z nich.",
      "Przełączaj się przyciskami Test i Prod po prawej stronie paska. Nic, co zrobisz w jednym środowisku, nie pojawi się w drugim, a ten sam numer może oznaczać w każdym z nich inny rekord.",
    ],
  },
  "language-and-theme": {
    title: "Język i motyw",
    body: [
      "Wybierz English lub Polski oraz Jasny lub Ciemny w nagłówku obok przycisku Wyloguj.",
      "Wybór należy do twojego konta: zostaje po wylogowaniu, działa w innych przeglądarkach i nigdy nie zmienia ustawień innych osób.",
      "Przed zalogowaniem CPG wyświetla się po angielsku i w jasnym motywie.",
    ],
  },
  "using-help": {
    title: "Jak korzystać z pomocy",
    body: [
      "Wpisz jedno lub kilka słów i wybierz Szukaj. Zobaczysz tematy, które zawierają wszystkie te słowa.",
      "Wielkość liter i polskie znaki nie mają znaczenia: „logowanie” i „LOGOWANIE” znajdą te same tematy, podobnie jak „łatwo” i „latwo”.",
      "Każdy ekran CPG ma co najmniej jeden temat, a nowe ekrany dodają własne.",
    ],
  },
};

const TEXTS: Record<Locale, Record<HelpTopicId, HelpText>> = { en, pl };

/** Every topic in the reader's language, in display order. */
export function helpTopics(locale: Locale): HelpTopic[] {
  return HELP_TOPIC_IDS.map((id) => ({ id, route: HELP_TOPIC_ROUTES[id], ...TEXTS[locale][id] }));
}
