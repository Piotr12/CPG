import { describe, expect, it } from "vitest";
import { HELP_TOPIC_IDS, HELP_TOPIC_ROUTES, helpTopics } from "./topics";

describe("help topics", () => {
  it.each(["en", "pl"] as const)("lists every topic in %s, in order, with its screen", (locale) => {
    const topics = helpTopics(locale);

    expect(topics.map(({ id }) => id)).toEqual([...HELP_TOPIC_IDS]);
    for (const topic of topics) {
      expect(topic.route).toBe(HELP_TOPIC_ROUTES[topic.id]);
      expect(topic.title).not.toBe("");
      expect(topic.body.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["en", "a unit without a conversion (or SU, which is never entered)"],
    ["pl", "jednostkę bez przelicznika (lub SU, w której nie wpisuje się ilości)"],
  ] as const)("lists an SU row among the stock import's dry-run problems in %s (#243)", (locale, problem) => {
    expect(helpTopics(locale).find((topic) => topic.id === "stock-import")!.body.join(" ")).toContain(problem);
  });

  it.each([
    ["en", "the forecast not yet ordered", "due in its calendar month", "the forecasts of past months expire", "safety-stock target in force that day"],
    ["pl", "prognozę jeszcze niezamówioną", "w jej miesiącu kalendarzowym", "prognozy minionych miesięcy wygasają", "cel zapasu bezpieczeństwa obowiązujący tego dnia"],
  ] as const)("says in %s that MRP plans the forecast left after its month's orders and carries each day's safety target (#275)", (locale, forecast, month, expired, safety) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of [forecast, month, expired, safety]) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "what open purchase orders still have to deliver", "a requisition counts as tentative supply", "a requisition, counts today"],
    ["pl", "co otwarte zamówienia zakupu mają jeszcze dostarczyć", "zapotrzebowanie liczy się jako dostawa niepewna", "czy zapotrzebowanie — liczy się dzisiaj"],
  ] as const)("says in %s that an MRP run adds open purchasing supply, requisitions as tentative, overdue supply today (#276)", (locale, orders, tentative, overdue) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    expect(text).toContain(orders);
    expect(text).toContain(tentative);
    expect(text).toContain(overdue);
  });

  it.each([
    ["en", "Open production orders add what they have still to produce", "Open transfers take stock from the source", "without its requisitions", "a transfer's dispatch or arrival", "dependent demand (components of open production orders and of production-order proposals)", "transfer in (open transfers arriving here)"],
    [
      "pl",
      "Otwarte zlecenia produkcyjne dodają to, co mają jeszcze wyprodukować",
      "Otwarte przesunięcia odejmują zapas w lokalizacji źródłowej",
      "bez swoich zapotrzebowań",
      "zaległa wysyłka lub przyjęcie przesunięcia",
      "popyt zależny (składniki otwartych zleceń produkcyjnych i propozycji zleceń produkcyjnych)",
      "przesunięcia przychodzące (otwarte przesunięcia docierające tutaj)",
    ],
  ] as const)("says in %s that an MRP run plans open production orders and transfers, and names their day columns (#277)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "a purchase requisition when the material is bought there", "a gap of 11 becomes 12", "carries into later days", "A proposal creates no document until someone accepts it", "need date and quantity"],
    [
      "pl",
      "zapotrzebowanie zakupowe, gdy materiał jest tam kupowany",
      "brak 11 daje 12",
      "przechodzi na kolejne dni",
      "Propozycja nie tworzy żadnego dokumentu, dopóki ktoś jej nie zaakceptuje",
      "dzień potrzeby i ilość",
    ],
  ] as const)("says in %s that a run proposes supply sized to the lot rules, carrying the surplus and creating no document (#278)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
    expect(text).not.toMatch(/Proposals show zero|Propozycje mają zero/);
  });

  it.each([
    ["en", "starts its lead time, in calendar days, before the day it is needed, and never before today", "is late by the days between", "beyond the horizon, and no day's balance counts it", "lateDays", "beyondHorizon"],
    ["pl", "przed dniem potrzeby, nigdy przed dzisiaj", "jest spóźniona o dni pomiędzy", "jest poza horyzontem i nie liczy się w stanie żadnego dnia", "lateDays", "beyondHorizon"],
  ] as const)("says in %s when a proposal starts, that a late one counts from its finish and that one beyond the horizon counts in no day (#279)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "A production-order proposal also plans what it consumes", "valid on its planned finish", "on the proposal's planned start at the same location", "level by level, every product before its components",
      "netted together", "a BOM cycle exception naming the cycle", "(bom, bomRevision, or null)"],
    ["pl", "Propozycja zlecenia produkcyjnego planuje też to, co zużywa", "ważnego w dniu jej planowanego końca", "w dniu planowanego startu propozycji, w tej samej lokalizacji",
      "poziom po poziomie, każdy wyrób przed swoimi składnikami", "są liczone razem", "wyjątek cyklu BOM z nazwanym cyklem", "(bom, bomRevision albo null)"],
  ] as const)("says in %s that a production-order proposal explodes through its BOM, level by level, and that a BOM cycle is reported (#281)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "can all be supplied on its planned start", "never requisitions or other proposals", "from that day to the end of the horizon", "rounded by the lot rules first",
      "is passed over for the next one", "a no usable BOM exception and no production proposal", "a no feasible BOM exception listing each BOM's missing components"],
    ["pl", "mogą zostać dostarczone w dniu jej planowanego startu", "nigdy z zapotrzebowań ani innych propozycji", "od tego dnia do końca horyzontu", "najpierw zaokrąglana według zasad partii",
      "jest pomijany na rzecz następnego", "wyjątek braku używalnego BOM-u i żadnej propozycji produkcji", "wyjątek braku wykonalnego BOM-u, wymieniający brakujące składniki każdego BOM-u"],
  ] as const)("says in %s how a production-order proposal chooses its BOM by what its components can be supplied with, and the two BOM exceptions (#282)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "the run doesn't propose that production", "It makes a provisional plan instead", "The components' own production for that plan is provisional too",
      "Purchase requisitions for what it needs are still proposed", "never counted in a balance, so the shortage stays visible", "is at risk", "an at-risk production exception",
      "until the order is closed or cancelled or the component is reactivated"],
    ["pl", "przebieg nie proponuje tej produkcji", "Tworzy zamiast niej plan tymczasowy", "Produkcja składników na potrzeby tego planu też jest tymczasowa",
      "Zapotrzebowania zakupowe na to, czego plan potrzebuje, są nadal proponowane", "nigdy nie liczy się w stanie, więc brak pozostaje widoczny", "jest zagrożone", "wyjątek zagrożonej produkcji",
      "składnik zdezaktywowany po utworzeniu zlecenia", "dopóki zlecenie nie zostanie zamknięte lub anulowane albo składnik ponownie aktywowany"],
  ] as const)("says in %s that production no BOM can supply is a provisional plan, never supply, and that an order pinning a deactivated component is at risk (#283)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "Why this BOM, under a production-order proposal", "in the order it tried them", "Inactive BOM Component", "Sugar: needs 6 KG, dependable 5 KG, short 1 KG",
      "cover the pairs on the page", "Provisional — not executable", "follow the chain down to the materials to buy", "never in a supply column or a balance and can't be accepted",
      "At-Risk Existing Production / Inactive BOM Component", "At-risk supply column", "No Feasible BOM (naming each rejected BOM and why)", "rejectedBoms"],
    ["pl", "Dlaczego ten BOM, pod propozycją zlecenia produkcyjnego", "w kolejności, w jakiej je sprawdzał", "Nieaktywny składnik BOM-u", "Cukier: potrzeba 6 KG, pewne 5 KG, brakuje 1 KG",
      "dotyczą par na stronie", "Tymczasowe — niewykonalne", "zejść łańcuchem do materiałów do zakupu", "nigdy nie jest w kolumnie podaży ani w stanie i nie można go zaakceptować",
      "Zagrożona istniejąca produkcja / Nieaktywny składnik BOM-u", "kolumnie Podaż zagrożona", "Brak wykonalnego BOM-u (z każdym odrzuconym BOM-em i powodem)", "rejectedBoms"],
  ] as const)("says in %s how the report explains a fallback BOM, provisional plans, at-risk orders and exceptions (E18-S03)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "has Accept: after you confirm", "carries its warning under its need date", "records the run's ID", "refused as out of date and you run MRP again", "accepted once", "Production-order proposals can't be accepted yet",
      "/mrp/runs/{run}/proposals/{proposal}/accept", "whether they can be accepted (executable)"],
    ["pl", "ma przycisk Akceptuj: po potwierdzeniu", "ma pod datą potrzeby swoje ostrzeżenie", "zapisuje ID przebiegu", "odrzucona jako nieaktualna i trzeba ponownie uruchomić MRP", "zaakceptować raz",
      "Propozycji zleceń produkcyjnych nie można jeszcze akceptować", "/mrp/runs/{run}/proposals/{proposal}/accept", "czy można je zaakceptować (executable)"],
  ] as const)("says in %s how a proposal is accepted, refused as out of date, and through the API (E19-S01)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each([
    ["en", "View switches one pair's table between Day and Week", "the stored days don't change", "W41 shows demand 56, receipts 50, a projected balance of 4, a lowest balance of −10 and a peak shortage of 10",
      "not 6, the sum of the balances, nor 18, the sum of the shortages", "marked partial", "Overdue Transfer", "Late Supply", "Beyond Horizon", "add bucket=week"],
    ["pl", "Widok przełącza tabelę jednej pary między Dniem a Tygodniem", "zapisane dni się nie zmieniają", "T41 pokazuje popyt 56, przyjęcia 50, prognozowany stan 4, najniższy stan −10 i największy niedobór 10",
      "nie 6, czyli sumę stanów, ani 18, czyli sumę niedoborów", "oznaczone jako niepełne", "Zaległe przesunięcie", "Opóźniona dostawa", "Poza horyzontem", "dodaj bucket=week"],
  ] as const)("says in %s how weeks fold flows and balances, with UX-027's example, what each warning means, and the API's weeks (E18-S02, D03)", (locale, ...phrases) => {
    const text = helpTopics(locale).find((topic) => topic.id === "mrp")!.body.join(" ");

    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it("is written separately in Polish, not copied from English", () => {
    const english = helpTopics("en");
    const polish = helpTopics("pl");

    polish.forEach((topic, i) => {
      expect(topic.title).not.toBe(english[i].title);
      expect(topic.body).toHaveLength(english[i].body.length);
    });
  });

  it.each(["en", "pl"] as const)("describes the sidebar, its TEST | PROD switch and the rail shortcut in %s, not the retired top menu or strip", (locale) => {
    const text = (id: string) => helpTopics(locale).find((topic) => topic.id === id)!.body.join(" ");

    expect(text("getting-started")).toContain("Ctrl+B");
    expect(text("test-and-prod")).toContain("TEST | PROD");
    const everything = helpTopics(locale).flatMap((topic) => topic.body).join(" ");
    expect(everything).not.toMatch(/strip|menu at the top|Pasek u góry|Menu u góry/);
  });

  it.each([
    ["en", "listed as revoked too", "without an entry here"],
    ["pl", "zapisany jako unieważniony", "bez wpisu w tym audycie"],
  ] as const)("says in %s which ended tokens the Global audit lists and which it doesn't", (locale, listed, unlisted) => {
    const text = helpTopics(locale).find((topic) => topic.id === "global-audit")!.body.join(" ");

    expect(text).toContain(listed);
    expect(text).toContain(unlisted);
  });

  it.each([
    ["en", "filter by record type and ID", "business date under the audit time", "Reversed by"],
    ["pl", "filtruj według rodzaju i ID rekordu", "datę księgowania", "Odwrócony przez"],
  ] as const)("explains in %s how to trace a record's history (E13-S03)", (locale, filters, businessDate, reversal) => {
    const text = (id: string) => helpTopics(locale).find((topic) => topic.id === id)!.body.join(" ");

    expect(text("global-audit")).toContain(filters);
    expect(text("tenant-audit")).toContain(filters);
    expect(text("tenant-audit")).toContain(businessDate);
    expect(text("tenant-audit")).toContain(reversal);
  });

  it.each([
    ["en", "capital letters don't matter, Polish ones included", "accents do"],
    ["pl", "wielkość liter, także polskich, nie ma znaczenia", "znaki diakrytyczne mają znaczenie"],
  ] as const)("says in %s that list search ignores the case of Polish letters too, but not their accents (#223)", (locale, caseIgnored, accentsCount) => {
    const text = helpTopics(locale).find((topic) => topic.id === "materials")!.body.join(" ");

    expect(text).toContain(caseIgnored);
    expect(text).toContain(accentsCount);
    expect(text).not.toMatch(/Polish accent matches only|pasuje tylko w takiej wielkości/);
  });

  it.each([
    ["en", /recipe/i],
    ["pl", /receptur/i],
  ] as const)("says BOM, never recipe, in %s (one term per concept, design system v1 Principle 7; #206)", (locale, recipe) => {
    const offenders = helpTopics(locale).flatMap((topic) => [topic.title, ...topic.body]).filter((text) => recipe.test(text));

    expect(offenders).toEqual([]);
  });
});
