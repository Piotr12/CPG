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
  "materials",
  "material-conversions",
  "locations",
  "customers",
  "suppliers",
  "planning-parameters",
  "safety-stock",
  "boms",
  "bom-revisions",
  "customer-orders",
  "customer-order-detail",
  "import",
  "stock",
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
  materials: "/admin/[tenant]/materials",
  "material-conversions": "/admin/[tenant]/materials/[id]",
  locations: "/admin/[tenant]/locations",
  customers: "/admin/[tenant]/customers",
  suppliers: "/admin/[tenant]/suppliers",
  "planning-parameters": "/admin/[tenant]/planning-parameters",
  "safety-stock": "/admin/[tenant]/safety-stock",
  boms: "/admin/[tenant]/boms",
  "bom-revisions": "/admin/[tenant]/boms/[id]",
  "customer-orders": "/admin/[tenant]/customer-orders",
  "customer-order-detail": "/admin/[tenant]/customer-orders/[id]",
  import: "/admin/[tenant]/import",
  stock: "/admin/[tenant]/stock",
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
  "customer-orders": { title: "Customer orders", body: ["Both roles can create and edit customer orders under Transactions. Choose one active customer and one location for the header; each line has its own material, positive quantity, unit and required date. Orders start Open with zero fulfilled. Entering an order moves no stock. Stored quantities use the material’s base unit; the entered amount and factor stay in history. A customer may be deactivated while existing orders continue. A stale version refuses an overwrite; reload before retrying. A read-only tenant hides write controls and refuses writes."] },
  "customer-order-detail": { title: "Maintaining a customer order", body: ["Both roles can create and edit customer orders under Transactions. Choose one active customer and one location for the header; each line has its own material, positive quantity, unit and required date. Orders start Open with zero fulfilled. Entering an order moves no stock. Stored quantities use the material’s base unit; the entered amount and factor stay in history. A customer may be deactivated while existing orders continue. A stale version refuses an overwrite; reload before retrying. A read-only tenant hides write controls and refuses writes."] },
  "getting-started": {
    title: "Getting started with CPG",
    body: [
      "CPG is a small MRP II planning tool: it turns what customers want into plans for what to buy and what to make.",
      "Sign in on the sign-in page with the account the administrator gave you. The built-in administrator signs in as admin.",
      "The sidebar on the left of every page lists the screens your account can open: the TEST | PROD switch at the top, the tenant's own screens (Overview, Master data, Audit) under it, and the screens shared by both tenants, Help included, at the bottom. The button at the top of the sidebar, or Ctrl+B (⌘B on a Mac), shrinks it to icons and back. On a phone, open it with the Menu button. Every new screen of CPG adds its own topic here.",
    ],
  },
  "signing-in": {
    title: "Signing in",
    body: [
      "Choose Sign in on the homepage or at the top of the page, enter your username and password, then choose Sign in.",
      "If either is wrong you see “Invalid username or password.” CPG never says which of the two was wrong.",
      "After several failed attempts, signing in pauses for 15 minutes. Wait, then try again.",
      "A session lasts 12 hours. Sign out from your account card, with your name, at the bottom of the sidebar when you are done.",
    ],
  },
  "admin-home": {
    title: "Cave control",
    body: [
      "Cave control is the page every account lands on after signing in: choose the Test or Prod tenant there. Your language and theme, your API tokens and Sign out are in your account card at the bottom of the sidebar. There is no password change: only the administrator sets passwords.",
      "The administrator opens this page from Administration → Tenants in the sidebar, next to Users, and also sees the Database card here. The card shows where CPG keeps its data, how many migrations are applied, whether any are still pending, and how many settings are stored.",
      "A pending migration normally means CPG is still starting. If it stays, tell whoever runs CPG.",
      "The administrator's Read-only card makes Test or Prod read-only, and writable again, after a confirmation. Each tenant has its own flag, and every change is kept in the Global audit. A read-only tenant shows Read-only on the chooser, a lock on its side of the TEST | PROD switch, and a banner on its pages.",
      "Open Test or Open Prod takes you to that tenant's business data.",
    ],
  },
  "test-and-prod": {
    title: "Test and Prod",
    body: [
      "CPG keeps two separate sets of business data: Test, with demonstration data that is safe to experiment with, and Prod, the live data.",
      "The row at the top of every page says which one you are working in: TEST in amber, PROD in dark with a red edge, or GLOBAL on pages shared by both, followed by where you are, such as Master data › Materials.",
      "Switch with TEST | PROD at the top of the sidebar: you stay on the same screen in the other tenant, or land on its list when you were on one record. On a page shared by both, the switch only changes which tenant the sidebar's screens open. Nothing you do in one ever appears in the other, and the same number can mean a different record in each.",
      "When the administrator makes a tenant read-only, the switch shows a lock on its side and a banner under the row at the top of its pages says so. Nobody can change its business data then, the administrator and the API included, so the buttons that would change it are gone. You can still read everything, including the audit, and change your own language, theme and API tokens.",
    ],
  },
  "managing-users": {
    title: "Managing users",
    body: [
      "Only the administrator opens Users, under Administration in the sidebar. Create user adds a normal user with a username (3–32 lowercase letters, digits, dots, dashes or underscores) and an initial password of at least 12 characters. Tell them the password yourself.",
      "Reset password, in a user's row menu, sets a new password and signs that user out everywhere at once.",
      "Deactivate signs the user out everywhere and stops them signing in. Reactivate lets them back in with their current password, so reset it too if the account may have been compromised.",
      "Users are never deleted: an account stays, so its history keeps its name. The built-in administrator can't be changed here.",
    ],
  },
  "api-tokens": {
    title: "API tokens",
    body: [
      "API tokens let a script or tool use the CPG API as you. Open API tokens from your account card at the bottom of the sidebar, choose Create token, give it a name and create it.",
      "The secret is shown once. Copy it straight away: CPG stores only a fingerprint of it and can never show it again. If you lose it, revoke the token and create a new one.",
      "Send the secret in every API request as the Authorization: Bearer header. The token can do exactly what your account can, in Test and Prod, and it never expires.",
      "Revoke ends a token at once. A password reset or a deactivation ends all of an account's tokens. Tokens can be listed and revoked through the API too, but only created here.",
      "Every API request that changes something needs an Idempotency-Key header: a fresh value, such as a UUID, for each change. If the answer is lost, send the same request with the same key again within 24 hours: CPG returns the first answer and changes nothing twice. A key reused for a different request is refused.",
      "To change a record (a user, a material or one of its unit conversions, a location, a customer or a supplier), send the version you read with it, from GET /api/users or the tenant's GET routes. If someone changed the record since, CPG refuses with a version conflict and keeps their change: read it again and retry. For writes to the Test tenant, also send the Dataset-Generation header with the generation from GET /api/tenants/test.",
    ],
  },
  "global-audit": {
    title: "The Global audit",
    body: [
      "Global audit, at the bottom of the sidebar, opens every change to accounts and to the tenants' settings, newest first. It lists users created, passwords reset, accounts deactivated or reactivated, language or theme changes, API tokens created or revoked, and a tenant made read-only or writable again. A token ended by a password reset or a deactivation is listed as revoked too.",
      "Each entry shows when it happened (in UTC), the account that made it, the session it came from, the channel (UI for CPG's screens, API for programs) and what changed, as before → after.",
      "A password reset is listed without the password: CPG never records passwords or their hashes. When the administrator's password is changed in the server's settings, the administrator's API tokens end at the next restart without an entry here.",
      "Every account can read the audit, and nobody can change or delete an entry, not even the administrator. Older entries shows the previous page.",
    ],
  },
  "tenant-audit": {
    title: "A tenant's audit",
    body: [
      "Audit, in the sidebar under the tenant's screens (or Audit — Test or Audit — Prod on the tenant's page), opens that tenant's own audit: the changes to its business records, kept apart from the other tenant's.",
      "It lists every material, location, customer and supplier created, changed, deactivated or reactivated, every unit conversion, planning parameter set and safety-stock target added, changed or removed, and every BOM created, revised, deactivated or reactivated, with the values before and after. Account changes are always in the Global audit.",
      "Like the Global audit, it is read-only for everyone.",
    ],
  },
  materials: {
    title: "Materials",
    body: [
      "Materials, under Master data in the sidebar, lists that tenant's materials by ID. Test and Prod each have their own: material 00000001 in Test and 00000001 in Prod are different records.",
      "Every material has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a type, a description and a base unit.",
      "The type is raw (bought), intermediate (made and used to make other materials) or finished (made and sold). The base unit is the unit every quantity of the material is stored in, exactly to six decimals. A material can't become raw while a location makes it (planning parameters set to Make).",
      "Every account can read materials. Only the administrator creates and changes them, with Create material here and Edit on a material's page; through the API too, with the same rules.",
    ],
  },
  "material-conversions": {
    title: "A material and its unit conversions",
    body: [
      "Choose a material's ID to open its page: its type, base unit and status, and its unit conversions.",
      "A conversion lets people enter quantities in another unit, such as a case of 12. It reads 1 case = 12 each: the alternate quantity and unit, then the base quantity and the base unit. A quantity entered in that unit is converted into the base unit once, rounded half-up to six decimals, and the unit and factor it was entered with are kept. The inverse is shown for orientation only.",
      "Changing or removing a conversion never changes quantities already stored. The base unit can change only while the material has no conversions, planning parameters or safety-stock targets, since their values are in it. Once any BOM uses the material, as its output or as a component, neither its type nor its base unit can change again.",
      "Deactivate keeps the material and its history, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  locations: {
    title: "Locations",
    body: [
      "Locations, under Master data in the sidebar, lists the sites where that tenant's materials are made and stocked. Test and Prod each have their own: location 00000001 in Test and 00000001 in Prod are different records.",
      "Every location has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates locations, with Create location and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the location and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  customers: {
    title: "Customers",
    body: [
      "Customers, under Master data in the sidebar, lists who that tenant sells to. Test and Prod each have their own: customer 00000001 in Test and 00000001 in Prod are different records.",
      "Every customer has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates customers, with Create customer and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the customer and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  suppliers: {
    title: "Suppliers",
    body: [
      "Suppliers, under Master data in the sidebar, lists who that tenant buys from. Test and Prod each have their own: supplier 00000001 in Test and 00000001 in Prod are different records.",
      "Every supplier has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates suppliers, with Create supplier and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the supplier and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  "planning-parameters": {
    title: "Planning parameters",
    body: [
      "Planning parameters, under Master data in the sidebar, tell MRP how each material is supplied at each location: Make (production) or Buy (purchasing), the lead time in whole calendar days, and the minimum lot and lot multiple a proposal must respect, in the material's base unit.",
      "A raw material is always bought. An intermediate or finished material can be made at one location and bought at another. Without a set, MRP will report the material's parameters at that location as missing.",
      "Every account can read the list. Only the administrator adds, changes and removes sets, with Add parameters and each row's ⋯ menu; through the API too, with the same rules. Only active materials and locations can get a new set; existing sets stay when either is deactivated.",
      "Every change appears in the tenant's audit. A material's base unit can't change while it has planning parameters.",
    ],
  },
  "safety-stock": {
    title: "Safety stock",
    body: [
      "Safety stock, under Master data in the sidebar, lists the minimum stock to keep of a material at a location. Each target applies from its date until the next target for the same material and location; with no target in force, the target is 0.",
      "Two targets can't share a date. To change a target's quantity, use Change target; to move it, remove it and add one on the new date. A target of 0 ends a buffer from its date.",
      "The status says which target is in effect today (UTC), which ones are scheduled for later, and which earlier ones a later target has replaced.",
      "Every account can read the list. Only the administrator adds, changes and removes targets, with Add target and each row's ⋯ menu; through the API too. Every change appears in the tenant's audit.",
    ],
  },
  boms: {
    title: "BOMs",
    body: [
      "BOMs (bills of materials), under Master data in the sidebar, list that tenant's recipes. A BOM makes one intermediate or finished material, its output, from raw and intermediate components; the quantities are for one base unit of the output. Each BOM has an eight-digit ID that CPG assigns in order and that never changes.",
      "One output can have several BOMs, its alternatives. Each has a priority (1 is the highest) and a validity: from a date, through a date or with no end, both days included. Two active alternatives for the same output can't have the same priority on any shared day.",
      "A component can be entered in any unit the material converts, such as 2 cases; CPG stores it in the material's base unit (24 each) and keeps what was entered. A recipe can't use its own output, directly or through other BOMs: CPG shows the cycle it would make.",
      "Every account can read BOMs. Only the administrator creates and changes them, with Create BOM here and Edit recipe on a BOM's page; through the API too, with the same rules. Only active materials can be picked.",
    ],
  },
  "bom-revisions": {
    title: "A BOM and its revisions",
    body: [
      "Choose a BOM's ID to open its page: its output, status, priority and validity, the recipe of its current revision, and every revision.",
      "A recipe never changes in place. Saving a real change to the priority, the dates or the components creates a new revision; the old ones stay readable from Revisions, unchanged, for the orders that will use them. Saving the same recipe, or entering the same quantity in another unit, creates nothing.",
      "Changing a unit conversion later doesn't change a saved recipe: the line keeps its quantity and the factor it was entered with. To use a new factor, enter the line again.",
      "Deactivate keeps the BOM and its revisions, but it can't be chosen for new orders; Reactivate undoes that after checking its priority again. Neither creates a revision. Every change appears in the tenant's audit.",
    ],
  },
  import: {
    title: "Import from spreadsheet",
    body: [
      "Import, under Master data in the sidebar, loads or updates the tenant's master data and BOMs from one .xlsx workbook. Only the administrator sees it, and it is blocked while the tenant is read-only. Run it when nobody else is changing data: while it runs, other changes wait.",
      "Download the template: it has a sheet for materials, unit conversions, locations, customers, suppliers, planning parameters and safety stock, and two for BOMs, plus instructions in English and Polish. Fill only the sheets you need and keep each sheet's header row. A blank ID creates a record, an existing ID updates it, and an ID that doesn't exist is an error. Nothing is ever deleted by an import.",
      "Sheets are applied in the template's order, so a planning row can use a material the Materials sheet creates: the dry run shows the ID it will get. A BOM's lines are its complete recipe: a component left out is removed in a new revision, an identical recipe creates no revision, and a new BOM's lines name its header by an import reference you choose.",
      "Upload the workbook and run the dry run: it checks every row with the same rules as the screens, writes nothing, and lists every problem by sheet, row and column, or shows what would be created, changed or left unchanged. Only a dry run without problems can be committed, and the commit writes everything in one go or nothing. If anything the workbook uses changed since the dry run, the commit is refused: run the dry run again. At most 2000 rows and 512 KB per workbook. The API offers the same: GET /api/import/template, and POST /api/tenants/{tenant}/import/dry-run and /commit with the workbook as base64.",
    ],
  },
  stock: {
    title: "Physical stock and corrections",
    body: [
      "Stock in the tenant menu shows the exact physical balance and recent movements for a selected material and location. A pair without movements has zero stock. Test and Prod are separate; fresh Test includes demonstration opening movements.",
      "Either role can post a reasoned correction while the tenant and masters are writable and active. Enter a signed change: 5 adds five and -5 removes five. Pick the base unit or a defined conversion; it converts once, half-up to six decimals, and keeps the entered quantity, unit and factor. The server uses today's UTC business date; backdating and future dating are unavailable. A correction that would make stock negative is refused with the available quantity.",
      "Opening balances and physical customer returns are ordinary positive corrections with a reason; there is no return document. Every user correction creates an immutable stock movement and a separate before/after audit entry. Source, actor and unit/factor appear in movement details. Installation openings are explicitly labelled Installation. The screen shows up to 100 recent movements, while its balance includes all movements.",
      "A material with any movement keeps its type and base unit forever, even after returning to zero. Nonzero stock prevents material or location deactivation. The API reads GET /api/tenants/{tenant}/stock?material=00000001&location=00000001 and posts POST /api/tenants/{tenant}/stock/corrections with a bearer token, idempotency key, current Test generation and material, location, signed quantity, unit and reason.",
    ],
  },
  "language-and-theme": {
    title: "Language and theme",
    body: [
      "Choose English or Polski, and Light or Dark, in your account card at the bottom of the sidebar.",
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
  "customer-orders": { title: "Zamówienia klientów", body: ["Obie role mogą tworzyć i edytować zamówienia klientów w sekcji Transakcje. Wybierz aktywnego klienta i jedną lokalizację nagłówka; każda pozycja ma własny materiał, dodatnią ilość, jednostkę i wymagany termin. Nowe zamówienie jest Otwarte, z ilością zrealizowaną równą zero. Zapis nie zmienia zapasu. Ilości zapisuje się w jednostce bazowej, zachowując wprowadzoną ilość i przelicznik. Klienta można dezaktywować, a istniejące zamówienia nadal obsługiwać. Nieaktualna wersja nie nadpisze zmian: odśwież dane. Środowisko tylko do odczytu ukrywa przyciski zapisu i odmawia zmian."] },
  "customer-order-detail": { title: "Edycja zamówienia klienta", body: ["Obie role mogą tworzyć i edytować zamówienia klientów w sekcji Transakcje. Wybierz aktywnego klienta i jedną lokalizację nagłówka; każda pozycja ma własny materiał, dodatnią ilość, jednostkę i wymagany termin. Nowe zamówienie jest Otwarte, z ilością zrealizowaną równą zero. Zapis nie zmienia zapasu. Ilości zapisuje się w jednostce bazowej, zachowując wprowadzoną ilość i przelicznik. Klienta można dezaktywować, a istniejące zamówienia nadal obsługiwać. Nieaktualna wersja nie nadpisze zmian: odśwież dane. Środowisko tylko do odczytu ukrywa przyciski zapisu i odmawia zmian."] },
  "getting-started": {
    title: "Pierwsze kroki z CPG",
    body: [
      "CPG to małe narzędzie do planowania MRP II: zamienia to, czego chcą klienci, w plany zakupów i produkcji.",
      "Zaloguj się na stronie logowania kontem, które dał ci administrator. Wbudowany administrator loguje się jako admin.",
      "Panel boczny po lewej stronie każdej strony pokazuje ekrany, które twoje konto może otworzyć: na górze przełącznik TEST | PROD, pod nim ekrany środowiska (Przegląd, Dane podstawowe, Audyt), a na dole ekrany wspólne dla obu środowisk, w tym Pomoc. Przycisk na górze panelu albo Ctrl+B (⌘B na Macu) zwija go do ikon i z powrotem. Na telefonie otwórz go przyciskiem Menu. Każdy nowy ekran CPG dodaje tu własny temat.",
    ],
  },
  "signing-in": {
    title: "Logowanie",
    body: [
      "Wybierz Zaloguj się na stronie głównej lub u góry strony, wpisz nazwę użytkownika i hasło, a następnie wybierz Zaloguj.",
      "Jeśli któreś z nich jest błędne, zobaczysz komunikat o nieprawidłowej nazwie użytkownika lub haśle. CPG nigdy nie mówi, które z nich było błędne.",
      "Po kilku nieudanych próbach logowanie zostaje wstrzymane na 15 minut. Odczekaj i spróbuj ponownie.",
      "Sesja trwa 12 godzin. Gdy skończysz, wyloguj się na karcie konta z twoją nazwą, na dole panelu bocznego.",
    ],
  },
  "admin-home": {
    title: "Kontrola jaskini",
    body: [
      "Kontrola jaskini to strona, na którą trafia każde konto po zalogowaniu: wybierz tu środowisko Test lub Prod. Język i motyw, tokeny API oraz przycisk Wyloguj są na karcie konta na dole panelu bocznego. Nie ma tu zmiany hasła: hasła ustawia tylko administrator.",
      "Administrator otwiera tę stronę pozycją Administracja → Środowiska w panelu bocznym, obok Użytkowników, i widzi tu też kartę Baza danych. Karta pokazuje, gdzie CPG przechowuje dane, ile migracji zastosowano, czy jakieś jeszcze oczekują i ile ustawień zapisano.",
      "Oczekująca migracja zwykle oznacza, że CPG jeszcze się uruchamia. Jeśli nie znika, powiedz o tym osobie, która utrzymuje CPG.",
      "Karta Tylko do odczytu administratora po potwierdzeniu ustawia Test lub Prod tylko do odczytu i z powrotem jako zapisywalne. Każde środowisko ma własne ustawienie, a każda zmiana trafia do audytu globalnego. Środowisko tylko do odczytu jest tak oznaczone przy wyborze środowiska, ma kłódkę po swojej stronie przełącznika TEST | PROD i baner na swoich stronach.",
      "Przyciski Otwórz Test i Otwórz Prod prowadzą do danych biznesowych wybranego środowiska.",
    ],
  },
  "test-and-prod": {
    title: "Środowiska Test i Prod",
    body: [
      "CPG przechowuje dwa oddzielne zbiory danych biznesowych: Test z danymi demonstracyjnymi, na których można bezpiecznie eksperymentować, oraz Prod z danymi rzeczywistymi.",
      "Wiersz u góry każdej strony pokazuje, w którym środowisku pracujesz: TEST na bursztynowo, PROD na ciemno z czerwoną krawędzią albo GLOBAL na stronach wspólnych dla obu, a za nim miejsce, w którym jesteś, na przykład Dane podstawowe › Materiały.",
      "Przełączaj się przełącznikiem TEST | PROD na górze panelu bocznego: zostajesz na tym samym ekranie w drugim środowisku albo trafiasz na jego listę, jeśli byłeś na jednym rekordzie. Na stronie wspólnej dla obu przełącznik zmienia tylko to, które środowisko otwierają ekrany panelu. Nic, co zrobisz w jednym środowisku, nie pojawi się w drugim, a ten sam numer może oznaczać w każdym z nich inny rekord.",
      "Gdy administrator ustawi środowisko tylko do odczytu, przełącznik pokazuje kłódkę po jego stronie, a baner pod wierszem u góry jego stron to mówi. Nikt nie może wtedy zmienić jego danych biznesowych, także administrator i API, więc przyciski, które by je zmieniały, znikają. Nadal możesz wszystko czytać, także audyt, i zmieniać własny język, motyw i tokeny API.",
    ],
  },
  "managing-users": {
    title: "Zarządzanie użytkownikami",
    body: [
      "Ekran Użytkownicy, w sekcji Administracja panelu bocznego, otwiera tylko administrator. Utwórz użytkownika dodaje zwykłego użytkownika z nazwą (3–32 małe litery, cyfry, kropki, myślniki lub podkreślenia) i hasłem początkowym o długości co najmniej 12 znaków. Przekaż mu hasło osobiście.",
      "Resetuj hasło w menu wiersza ustawia nowe hasło i od razu wylogowuje tego użytkownika ze wszystkich sesji.",
      "Dezaktywuj wylogowuje użytkownika ze wszystkich sesji i blokuje logowanie. Aktywuj ponownie wpuszcza go z obecnym hasłem, więc zresetuj je także wtedy, gdy konto mogło zostać przejęte.",
      "Użytkownicy nigdy nie są usuwani: konto zostaje, więc historia zachowuje jego nazwę. Wbudowanego administratora nie można tu zmienić.",
    ],
  },
  "api-tokens": {
    title: "Tokeny API",
    body: [
      "Tokeny API pozwalają skryptowi lub narzędziu korzystać z API CPG w twoim imieniu. Otwórz Tokeny API z karty konta na dole panelu bocznego, wybierz Utwórz token, nadaj mu nazwę i utwórz go.",
      "Sekret jest pokazywany tylko raz. Skopiuj go od razu: CPG przechowuje wyłącznie jego odcisk i nigdy nie pokaże go ponownie. Jeśli go zgubisz, unieważnij token i utwórz nowy.",
      "Wysyłaj sekret w każdym żądaniu do API jako nagłówek Authorization: Bearer. Token może dokładnie to, co twoje konto, w środowiskach Test i Prod, i nigdy nie wygasa.",
      "Unieważnij natychmiast kończy działanie tokenu. Reset hasła lub dezaktywacja kończy działanie wszystkich tokenów konta. Tokeny można też wyświetlać i unieważniać przez API, ale tworzyć tylko tutaj.",
      "Każde żądanie do API, które coś zmienia, wymaga nagłówka Idempotency-Key: nowej wartości, na przykład UUID, dla każdej zmiany. Jeśli odpowiedź zginie, wyślij to samo żądanie z tym samym kluczem ponownie w ciągu 24 godzin: CPG zwróci pierwszą odpowiedź i niczego nie zmieni dwa razy. Klucz użyty ponownie do innego żądania zostanie odrzucony.",
      "Aby zmienić rekord (użytkownika, materiał lub jeden z jego przeliczników jednostek, lokalizację, klienta lub dostawcę), wyślij wersję, którą odczytałeś z GET /api/users lub z tras GET środowiska. Jeśli ktoś w międzyczasie go zmienił, CPG odmówi z konfliktem wersji i zachowa tamtą zmianę: odczytaj go ponownie i spróbuj jeszcze raz. Przy zapisach w środowisku Test wyślij też nagłówek Dataset-Generation z generacją z GET /api/tenants/test.",
    ],
  },
  "global-audit": {
    title: "Audyt globalny",
    body: [
      "Audyt globalny, na dole panelu bocznego, pokazuje każdą zmianę kont i ustawień środowisk, od najnowszej. Znajdziesz tu utworzonych użytkowników, zresetowane hasła, dezaktywowane i ponownie aktywowane konta, zmiany języka lub motywu, utworzone i unieważnione tokeny API oraz środowiska ustawione jako tylko do odczytu lub ponownie zapisywalne. Token usunięty przy resecie hasła lub dezaktywacji konta też jest tu zapisany jako unieważniony.",
      "Każdy wpis pokazuje, kiedy nastąpiła zmiana (w UTC), które konto ją wprowadziło, z jakiej sesji, jakim kanałem (Ekran dla ekranów CPG, Interfejs API dla programów) i co się zmieniło, jako przed → po.",
      "Reset hasła jest zapisany bez hasła: CPG nigdy nie zapisuje haseł ani ich skrótów. Gdy hasło administratora zmieni się w ustawieniach serwera, jego tokeny API przestają działać przy następnym uruchomieniu serwera, bez wpisu w tym audycie.",
      "Audyt może przeglądać każde konto, a nikt nie może zmienić ani usunąć wpisu, nawet administrator. Starsze wpisy pokazują poprzednią stronę.",
    ],
  },
  "tenant-audit": {
    title: "Audyt środowiska",
    body: [
      "Audyt, w panelu bocznym pod ekranami środowiska (albo Audyt — Test lub Audyt — Prod na stronie środowiska), otwiera własny audyt tego środowiska: zmiany jego rekordów biznesowych, oddzielone od drugiego środowiska.",
      "Pokazuje każde utworzenie, zmianę, dezaktywację i ponowną aktywację materiału, lokalizacji, klienta lub dostawcy oraz każde dodanie, zmianę lub usunięcie przelicznika jednostek, parametrów planowania lub celu zapasu bezpieczeństwa, a także każde utworzenie, zmianę receptury, dezaktywację i ponowną aktywację BOM-u, z wartościami przed i po. Zmiany kont są zawsze w audycie globalnym.",
      "Tak jak audyt globalny, jest tylko do odczytu dla wszystkich.",
    ],
  },
  materials: {
    title: "Materiały",
    body: [
      "Materiały, w sekcji Dane podstawowe panelu bocznego, wyświetlają materiały tego środowiska według ID. Test i Prod mają własne: materiał 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy materiał ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także typ, opis i jednostkę bazową.",
      "Typ to surowiec (kupowany), półprodukt (wytwarzany i zużywany do innych materiałów) albo wyrób gotowy (wytwarzany i sprzedawany). Jednostka bazowa to jednostka, w której zapisywana jest każda ilość materiału, dokładnie do sześciu miejsc po przecinku. Materiał nie może stać się surowcem, dopóki jakaś lokalizacja go produkuje (parametry planowania ustawione na Produkcja).",
      "Materiały może przeglądać każde konto. Tworzy je i zmienia tylko administrator, przyciskiem Utwórz materiał tutaj i Edytuj na stronie materiału; także przez API, na tych samych zasadach.",
    ],
  },
  "material-conversions": {
    title: "Materiał i jego przeliczniki jednostek",
    body: [
      "Wybierz ID materiału, aby otworzyć jego stronę: typ, jednostkę bazową, status i przeliczniki jednostek.",
      "Przelicznik pozwala wpisywać ilości w innej jednostce, na przykład w kartonach po 12 sztuk. Czyta się go jako 1 karton = 12 szt.: ilość i jednostka alternatywna, potem ilość i jednostka bazowa. Ilość wpisana w tej jednostce jest przeliczana na jednostkę bazową raz, z zaokrągleniem połówek w górę do sześciu miejsc po przecinku, a jednostka i przelicznik, z którymi ją wpisano, zostają zapisane. Odwrotność jest tylko orientacyjna.",
      "Zmiana lub usunięcie przelicznika nigdy nie zmienia ilości już zapisanych. Jednostkę bazową można zmienić tylko wtedy, gdy materiał nie ma przeliczników, parametrów planowania ani celów zapasu bezpieczeństwa, bo ich wartości są w niej zapisane. Gdy materiał trafi do jakiegokolwiek BOM-u, jako wyrób lub składnik, nie można już zmienić ani jego typu, ani jednostki bazowej.",
      "Dezaktywuj zachowuje materiał i jego historię, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  locations: {
    title: "Lokalizacje",
    body: [
      "Lokalizacje, w sekcji Dane podstawowe panelu bocznego, wyświetlają miejsca, w których jego materiały są wytwarzane i składowane. Test i Prod mają własne: lokalizacja 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każda lokalizacja ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Lokalizacje może przeglądać każde konto. Tworzy je, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz lokalizację i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje lokalizację i wszystko, co już jej używa, ale nie można jej wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  customers: {
    title: "Klienci",
    body: [
      "Klienci, w sekcji Dane podstawowe panelu bocznego, to ci, którym to środowisko sprzedaje. Test i Prod mają własne: klient 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy klient ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Klientów może przeglądać każde konto. Tworzy ich, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz klienta i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje klienta i wszystko, co już go używa, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  suppliers: {
    title: "Dostawcy",
    body: [
      "Dostawcy, w sekcji Dane podstawowe panelu bocznego, to ci, od których to środowisko kupuje. Test i Prod mają własne: dostawca 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy dostawca ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Dostawców może przeglądać każde konto. Tworzy ich, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz dostawcę i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje dostawcę i wszystko, co już go używa, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  "planning-parameters": {
    title: "Parametry planowania",
    body: [
      "Parametry planowania, w sekcji Dane podstawowe w menu bocznym, mówią MRP, jak każdy materiał jest zaopatrywany w każdej lokalizacji: Produkcja albo Zakup, czas realizacji w pełnych dniach kalendarzowych oraz minimalna partia i wielokrotność partii, których propozycja musi przestrzegać, w jednostce bazowej materiału.",
      "Surowiec jest zawsze kupowany. Półprodukt lub wyrób gotowy może być produkowany w jednej lokalizacji i kupowany w innej. Bez zestawu MRP zgłosi brak parametrów materiału w tej lokalizacji.",
      "Listę może przeglądać każde konto. Zestawy dodaje, zmienia i usuwa tylko administrator, przyciskiem Dodaj parametry i menu ⋯ w wierszu; także przez API, na tych samych zasadach. Nowy zestaw może dostać tylko aktywny materiał i aktywna lokalizacja; istniejące zestawy zostają po dezaktywacji.",
      "Każda zmiana pojawia się w audycie środowiska. Jednostki bazowej materiału nie można zmienić, dopóki ma on parametry planowania.",
    ],
  },
  "safety-stock": {
    title: "Zapas bezpieczeństwa",
    body: [
      "Zapas bezpieczeństwa, w sekcji Dane podstawowe w menu bocznym, to minimalny zapas materiału w lokalizacji. Każdy cel obowiązuje od swojej daty do następnego celu dla tego samego materiału i lokalizacji; gdy żaden cel nie obowiązuje, wynosi 0.",
      "Dwa cele nie mogą mieć tej samej daty. Aby zmienić ilość, użyj Zmień cel; aby przesunąć datę, usuń cel i dodaj nowy. Cel 0 kończy zapas od swojej daty.",
      "Status mówi, który cel obowiązuje dziś (UTC), które są zaplanowane na później, a które wcześniejsze zastąpił późniejszy cel.",
      "Listę może przeglądać każde konto. Cele dodaje, zmienia i usuwa tylko administrator, przyciskiem Dodaj cel i menu ⋯ w wierszu; także przez API. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  boms: {
    title: "BOM-y",
    body: [
      "BOM-y (struktury wyrobów), w sekcji Dane podstawowe w menu bocznym, to receptury tego środowiska. BOM wytwarza jeden półprodukt lub wyrób gotowy, swój wyrób, z surowców i półproduktów; ilości dotyczą jednej jednostki bazowej wyrobu. Każdy BOM ma ośmiocyfrowe ID, które CPG nadaje po kolei i które nigdy się nie zmienia.",
      "Jeden wyrób może mieć kilka BOM-ów, swoich alternatyw. Każda ma priorytet (1 to najwyższy) i okres ważności: od daty, do daty lub bez końca, oba dni się liczą. Dwie aktywne alternatywy tego samego wyrobu nie mogą mieć tego samego priorytetu w żadnym wspólnym dniu.",
      "Składnik można wpisać w każdej jednostce, którą materiał przelicza, na przykład 2 kartony; CPG zapisuje go w jednostce bazowej materiału (24 szt.) i zachowuje to, co wpisano. Receptura nie może używać własnego wyrobu, ani bezpośrednio, ani przez inne BOM-y: CPG pokazuje cykl, który by powstał.",
      "BOM-y może przeglądać każde konto. Tworzy je i zmienia tylko administrator, przyciskiem Utwórz BOM tutaj i Edytuj recepturę na stronie BOM-u; także przez API, na tych samych zasadach. Wybrać można tylko aktywne materiały.",
    ],
  },
  "bom-revisions": {
    title: "BOM i jego rewizje",
    body: [
      "Wybierz ID BOM-u, aby otworzyć jego stronę: wyrób, status, priorytet i ważność, recepturę bieżącej rewizji oraz wszystkie rewizje.",
      "Receptura nigdy nie zmienia się w miejscu. Zapisanie prawdziwej zmiany priorytetu, dat lub składników tworzy nową rewizję; stare pozostają do wglądu w sekcji Rewizje, bez zmian, dla zleceń, które będą ich używać. Zapisanie tej samej receptury albo wpisanie tej samej ilości w innej jednostce niczego nie tworzy.",
      "Późniejsza zmiana przelicznika jednostek nie zmienia zapisanej receptury: wiersz zachowuje swoją ilość i przelicznik, z którym go wpisano. Aby użyć nowego przelicznika, wpisz wiersz ponownie.",
      "Dezaktywuj zachowuje BOM i jego rewizje, ale nie można go wybrać dla nowych zleceń; Aktywuj ponownie to cofa po ponownym sprawdzeniu priorytetu. Żadne z nich nie tworzy rewizji. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  import: {
    title: "Import z arkusza",
    body: [
      "Import, w sekcji Dane podstawowe w menu bocznym, wczytuje lub aktualizuje dane podstawowe i BOM-y środowiska z jednego skoroszytu .xlsx. Widzi go tylko administrator i jest zablokowany, gdy środowisko jest tylko do odczytu. Uruchamiaj go, gdy nikt inny nie zmienia danych: w trakcie importu inne zmiany czekają.",
      "Pobierz szablon: ma arkusz na materiały, przeliczniki jednostek, lokalizacje, klientów, dostawców, parametry planowania i zapas bezpieczeństwa oraz dwa na BOM-y, a do tego instrukcję po angielsku i po polsku. Wypełnij tylko potrzebne arkusze i zachowaj wiersz nagłówka każdego z nich. Puste ID tworzy rekord, istniejące ID go aktualizuje, a ID, które nie istnieje, jest błędem. Import nigdy niczego nie usuwa.",
      "Arkusze są stosowane w kolejności szablonu, więc wiersz parametrów planowania może użyć materiału tworzonego przez arkusz Materials: próba pokazuje ID, które dostanie. Wiersze BOM-u to jego pełna receptura: pominięty składnik jest usuwany w nowej rewizji, identyczna receptura nie tworzy rewizji, a wiersze nowego BOM-u wskazują jego nagłówek przez wybraną przez ciebie referencję importu.",
      "Wyślij skoroszyt i wykonaj próbę: sprawdza każdy wiersz tymi samymi zasadami co ekrany, niczego nie zapisuje i wymienia każdy problem z arkuszem, wierszem i kolumną albo pokazuje, co zostanie utworzone, zmienione lub pozostanie bez zmian. Zatwierdzić można tylko próbę bez problemów, a zatwierdzenie zapisuje wszystko naraz albo nic. Jeśli coś, czego używa skoroszyt, zmieniło się od czasu próby, zatwierdzenie jest odrzucane: wykonaj próbę ponownie. Najwyżej 2000 wierszy i 512 KB na skoroszyt. API oferuje to samo: GET /api/import/template oraz POST /api/tenants/{tenant}/import/dry-run i /commit ze skoroszytem w base64.",
    ],
  },
  stock: {
    title: "Zapas fizyczny i korekty",
    body: [
      "Zapas w menu środowiska pokazuje dokładny stan fizyczny i ostatnie ruchy wybranego materiału w lokalizacji. Para bez ruchów ma stan zero. Test i Prod są oddzielne; świeży Test zawiera demonstracyjne ruchy otwarcia.",
      "Obie role mogą zaksięgować korektę z powodem, gdy środowisko pozwala na zapis, a materiał i lokalizacja są aktywne. Wpisz zmianę ze znakiem: 5 dodaje pięć, -5 odejmuje pięć. Wybierz jednostkę podstawową lub zdefiniowany przelicznik; ilość jest przeliczana raz, z zaokrągleniem połówkowym w górę do sześciu miejsc, i zachowuje wpisaną ilość, jednostkę oraz przelicznik. Serwer używa dzisiejszej daty UTC; nie można księgować w przeszłość ani przyszłość. Korekta prowadząca do ujemnego zapasu jest odrzucana z dostępną ilością.",
      "Stany otwarcia i fizyczny zwrot od klienta to zwykłe dodatnie korekty z powodem; nie powstaje dokument zwrotu. Każda korekta użytkownika tworzy niezmienny ruch magazynowy i oddzielny wpis audytu ze stanem przed i po. Źródło, użytkownik i przelicznik są w szczegółach ruchu. Otwarcia demonstracyjne są oznaczone jako Instalacja. Ekran pokazuje do 100 ostatnich ruchów, a saldo uwzględnia wszystkie ruchy.",
      "Materiał po dowolnym ruchu zachowuje na zawsze typ i jednostkę podstawową, nawet po wyzerowaniu zapasu. Niezerowy zapas blokuje dezaktywację materiału i lokalizacji. API odczytuje GET /api/tenants/{tenant}/stock?material=00000001&location=00000001 i księguje POST /api/tenants/{tenant}/stock/corrections z tokenem, kluczem idempotencji, bieżącą generacją Test oraz materiałem, lokalizacją, ilością ze znakiem, jednostką i powodem.",
    ],
  },
  "language-and-theme": {
    title: "Język i motyw",
    body: [
      "Wybierz English lub Polski oraz Jasny lub Ciemny na karcie konta na dole panelu bocznego.",
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
