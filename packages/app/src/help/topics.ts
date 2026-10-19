import type { Locale } from "@cpg/core";

/** Every help topic, in display order. A new screen adds its topic here, in both languages. */
export const HELP_TOPIC_IDS = [
  "getting-started",
  "signing-in",
  "admin-home",
  "managing-users",
  "api-tokens",
  "test-and-prod",
  "global-audit",
  "tenant-audit",
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
  "managing-users": "/admin/users",
  "api-tokens": "/admin/tokens",
  "test-and-prod": "/admin/[tenant]",
  "global-audit": "/admin/audit",
  "tenant-audit": "/admin/[tenant]/audit",
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
      "The menu at the top of every page lists the screens your account can open, Help included. On a phone, open it with the Menu button. Every new screen of CPG adds its own topic here.",
    ],
  },
  "signing-in": {
    title: "Signing in",
    body: [
      "Choose Sign in on the homepage or in the menu, enter your username and password, then choose Sign in.",
      "If either is wrong you see “Invalid username or password.” CPG never says which of the two was wrong.",
      "After several failed attempts, signing in pauses for 15 minutes. Wait, then try again.",
      "A session lasts 12 hours. Sign out from the menu when you are done: on a wide screen it is behind the button with your name.",
    ],
  },
  "admin-home": {
    title: "Cave control",
    body: [
      "Cave control is the home page of every account: choose the Test or Prod tenant there. Your name, language and theme, and Sign out are in the menu. There is no password change: only the administrator sets passwords.",
      "The administrator also sees Users in the menu and the Database card here. The card shows where CPG keeps its data, how many migrations are applied, whether any are still pending, and how many settings are stored.",
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
  "managing-users": {
    title: "Managing users",
    body: [
      "Only the administrator opens Users. Create user adds a normal user with a username (3–32 lowercase letters, digits, dots, dashes or underscores) and an initial password of at least 12 characters. Tell them the password yourself.",
      "Reset password, in a user's row menu, sets a new password and signs that user out everywhere at once.",
      "Deactivate signs the user out everywhere and stops them signing in. Reactivate lets them back in with their current password, so reset it too if the account may have been compromised.",
      "Users are never deleted: an account stays, so its history keeps its name. The built-in administrator can't be changed here.",
    ],
  },
  "api-tokens": {
    title: "API tokens",
    body: [
      "API tokens let a script or tool use the CPG API as you. Open API tokens in the menu, choose Create token, give it a name and create it.",
      "The secret is shown once. Copy it straight away: CPG stores only a fingerprint of it and can never show it again. If you lose it, revoke the token and create a new one.",
      "Send the secret in every API request as the Authorization: Bearer header. The token can do exactly what your account can, in Test and Prod, and it never expires.",
      "Revoke ends a token at once. A password reset or a deactivation ends all of an account's tokens. Tokens can be listed and revoked through the API too, but only created here.",
    ],
  },
  "global-audit": {
    title: "The Global audit",
    body: [
      "Audit, in the menu, opens the Global audit: every change to accounts, newest first. It lists users created, passwords reset, accounts deactivated or reactivated, language or theme changes, and API tokens created or revoked.",
      "Each entry shows when it happened (in UTC), the account that made it, the session it came from, the channel (UI for CPG's screens, API for programs) and what changed, as before → after.",
      "A password reset is listed without the password: CPG never records passwords or their hashes.",
      "Every account can read the audit, and nobody can change or delete an entry, not even the administrator. Older entries shows the previous page.",
    ],
  },
  "tenant-audit": {
    title: "A tenant's audit",
    body: [
      "Audit — Test or Audit — Prod, on that tenant's page, opens its own audit: the changes to its business records, kept apart from the other tenant's.",
      "It is empty until CPG holds records such as materials. Account changes are always in the Global audit.",
      "Like the Global audit, it is read-only for everyone.",
    ],
  },
  "language-and-theme": {
    title: "Language and theme",
    body: [
      "Choose English or Polski, and Light or Dark, in the menu next to Sign out.",
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
      "Menu u góry każdej strony pokazuje ekrany, które twoje konto może otworzyć, w tym Pomoc. Na telefonie otwórz je przyciskiem Menu. Każdy nowy ekran CPG dodaje tu własny temat.",
    ],
  },
  "signing-in": {
    title: "Logowanie",
    body: [
      "Wybierz Zaloguj się na stronie głównej lub w menu, wpisz nazwę użytkownika i hasło, a następnie wybierz Zaloguj.",
      "Jeśli któreś z nich jest błędne, zobaczysz komunikat o nieprawidłowej nazwie użytkownika lub haśle. CPG nigdy nie mówi, które z nich było błędne.",
      "Po kilku nieudanych próbach logowanie zostaje wstrzymane na 15 minut. Odczekaj i spróbuj ponownie.",
      "Sesja trwa 12 godzin. Gdy skończysz, wyloguj się w menu: na szerokim ekranie jest pod przyciskiem z twoją nazwą.",
    ],
  },
  "admin-home": {
    title: "Kontrola jaskini",
    body: [
      "Kontrola jaskini to strona startowa każdego konta: wybierz tu środowisko Test lub Prod. Twoja nazwa, język i motyw oraz przycisk Wyloguj są w menu. Nie ma tu zmiany hasła: hasła ustawia tylko administrator.",
      "Administrator widzi też Użytkowników w menu i tutaj kartę Baza danych. Karta pokazuje, gdzie CPG przechowuje dane, ile migracji zastosowano, czy jakieś jeszcze oczekują i ile ustawień zapisano.",
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
  "managing-users": {
    title: "Zarządzanie użytkownikami",
    body: [
      "Ekran Użytkownicy otwiera tylko administrator. Utwórz użytkownika dodaje zwykłego użytkownika z nazwą (3–32 małe litery, cyfry, kropki, myślniki lub podkreślenia) i hasłem początkowym o długości co najmniej 12 znaków. Przekaż mu hasło osobiście.",
      "Resetuj hasło w menu wiersza ustawia nowe hasło i od razu wylogowuje tego użytkownika ze wszystkich sesji.",
      "Dezaktywuj wylogowuje użytkownika ze wszystkich sesji i blokuje logowanie. Aktywuj ponownie wpuszcza go z obecnym hasłem, więc zresetuj je także wtedy, gdy konto mogło zostać przejęte.",
      "Użytkownicy nigdy nie są usuwani: konto zostaje, więc historia zachowuje jego nazwę. Wbudowanego administratora nie można tu zmienić.",
    ],
  },
  "api-tokens": {
    title: "Tokeny API",
    body: [
      "Tokeny API pozwalają skryptowi lub narzędziu korzystać z API CPG w twoim imieniu. Otwórz Tokeny API w menu, wybierz Utwórz token, nadaj mu nazwę i utwórz go.",
      "Sekret jest pokazywany tylko raz. Skopiuj go od razu: CPG przechowuje wyłącznie jego odcisk i nigdy nie pokaże go ponownie. Jeśli go zgubisz, unieważnij token i utwórz nowy.",
      "Wysyłaj sekret w każdym żądaniu do API jako nagłówek Authorization: Bearer. Token może dokładnie to, co twoje konto, w środowiskach Test i Prod, i nigdy nie wygasa.",
      "Unieważnij natychmiast kończy działanie tokenu. Reset hasła lub dezaktywacja kończy działanie wszystkich tokenów konta. Tokeny można też wyświetlać i unieważniać przez API, ale tworzyć tylko tutaj.",
    ],
  },
  "global-audit": {
    title: "Audyt globalny",
    body: [
      "Audyt w menu otwiera Audyt globalny: każdą zmianę kont, od najnowszej. Znajdziesz tu utworzonych użytkowników, zresetowane hasła, dezaktywowane i ponownie aktywowane konta, zmiany języka lub motywu oraz utworzone i unieważnione tokeny API.",
      "Każdy wpis pokazuje, kiedy nastąpiła zmiana (w UTC), które konto ją wprowadziło, z jakiej sesji, jakim kanałem (Ekran dla ekranów CPG, Interfejs API dla programów) i co się zmieniło, jako przed → po.",
      "Reset hasła jest zapisany bez hasła: CPG nigdy nie zapisuje haseł ani ich skrótów.",
      "Audyt może przeglądać każde konto, a nikt nie może zmienić ani usunąć wpisu, nawet administrator. Starsze wpisy pokazują poprzednią stronę.",
    ],
  },
  "tenant-audit": {
    title: "Audyt środowiska",
    body: [
      "Audyt — Test lub Audyt — Prod na stronie środowiska otwiera jego własny audyt: zmiany jego rekordów biznesowych, oddzielone od drugiego środowiska.",
      "Jest pusty, dopóki CPG nie przechowuje rekordów, na przykład materiałów. Zmiany kont są zawsze w audycie globalnym.",
      "Tak jak audyt globalny, jest tylko do odczytu dla wszystkich.",
    ],
  },
  "language-and-theme": {
    title: "Język i motyw",
    body: [
      "Wybierz English lub Polski oraz Jasny lub Ciemny w menu obok przycisku Wyloguj.",
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
