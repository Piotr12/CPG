/**
 * E18-S03's integration setups (spec Q8), built through the API at a location of their own, so a report read
 * filtered by it lists only these pairs, on one page. Nothing here touches a shared demo material.
 *
 * - **Fallback** (UX-020, MRP-025): F's priority-1 BOM needs 1 A, its priority-2 BOM 1 B; the lot multiple of 2
 *   lifts 4.1 to 6, and only 5 A is on hand, so F plans through priority 2 and explains priority 1.
 * - **Inactive input** (MRP-050): G's priority-1 BOM needs R, deactivated; its priority-2 BOM needs S, on hand.
 * - **No usable BOM** (LFC-026): H's only BOM needs T, deactivated.
 * - **Chain** (MRP-047): P needs 2 I, I needs 0.5 V, V is bought; nothing on hand, so P and I are provisional.
 * - **At risk** (MRP-051, LFC-027): an open order of 10 W pins a BOM of raw U, deactivated afterwards, with 10 W
 *   ordered after its finish.
 */
export interface ExplanationIds {
  site: string;
  f: string; a: string; b: string; fFirst: string; fSecond: string;
  g: string; r: string; gFirst: string; gSecond: string;
  h: string; t: string; hBom: string;
  p: string; i: string; v: string; pBom: string; iBom: string;
  w: string; u: string; order: string;
}

interface Calls {
  /** POSTs `body` and answers the created record's ID. */
  create: (path: string, body: unknown) => Promise<string>;
  /** Deactivates material `id` through PATCH, with its current version. */
  deactivate: (id: string) => Promise<void>;
}

/** A day `days` after the server's UTC today, as the run plans from it. */
export const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export async function explanationSetup({ create, deactivate }: Calls, prefix: string): Promise<ExplanationIds> {
  const tenant = "/api/tenants/prod";
  const material = (type: string, name: string, baseUnit = "each") => create(`${tenant}/materials`, { type, description: `${prefix} ${name}`, baseUnit });
  const site = await create(`${tenant}/locations`, { name: `${prefix} explained plant` });
  const recipe = (output: string, input: string, quantity: string, priority = 1) =>
    create(`${tenant}/boms`, { output, priority, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity, unit: "each" }] });
  const plan = (item: string, procurement: "make" | "buy", leadTimeDays: number, lotMultiple = "1") =>
    create(`${tenant}/planning-parameters`, { material: item, location: site, procurement, leadTimeDays, minimumQuantity: "0", lotMultiple });
  const stock = (item: string, quantity: string) => create(`${tenant}/stock/corrections`, { material: item, location: site, quantity, unit: "each", reason: `${prefix} count` });

  const [f, a, b] = [await material("finished", "cake f"), await material("raw", "sugar a"), await material("raw", "honey b")];
  const [fFirst, fSecond] = [await recipe(f, a, "1"), await recipe(f, b, "1", 2)];
  await plan(f, "make", 2, "2");
  await stock(a, "5");
  await stock(b, "20");

  const [g, r, s] = [await material("finished", "tart g"), await material("raw", "colouring r"), await material("raw", "flour s")];
  const [gFirst, gSecond] = [await recipe(g, r, "1"), await recipe(g, s, "1", 2)];
  await plan(g, "make", 2);
  await stock(s, "10");

  const [h, t] = [await material("finished", "pie h"), await material("raw", "retired t")];
  const hBom = await recipe(h, t, "1");
  await plan(h, "make", 2);

  const [p, i, v] = [await material("finished", "cabinet p"), await material("intermediate", "frame i"), await material("raw", "steel v")];
  const [pBom, iBom] = [await recipe(p, i, "2"), await recipe(i, v, "0.5")];
  await plan(p, "make", 2);
  await plan(i, "make", 3);
  await plan(v, "buy", 1);

  const [w, u] = [await material("finished", "pinned w"), await material("raw", "glaze u")];
  const wBom = await recipe(w, u, "1");
  await plan(w, "make", 2);
  const order = await create(`${tenant}/production-orders`, { output: w, location: site, quantity: "10", unit: "each", plannedFinish: day(8), bom: wBom, revision: 1 });

  const customer = await create(`${tenant}/customers`, { name: `${prefix} explained retail` });
  await create(`${tenant}/customer-orders`, {
    customer,
    location: site,
    lines: [
      { material: f, quantity: "4.1", unit: "each", requiredDate: day(10) },
      { material: g, quantity: "5", unit: "each", requiredDate: day(10) },
      { material: h, quantity: "5", unit: "each", requiredDate: day(10) },
      { material: p, quantity: "10", unit: "each", requiredDate: day(20) },
      { material: w, quantity: "10", unit: "each", requiredDate: day(12) },
    ],
  });
  // Allowed while only BOMs and the open order's pinned revision use them (E10-S05, LFC-015).
  for (const inactive of [r, t, u]) await deactivate(inactive);
  return { site, f, a, b, fFirst, fSecond, g, r, gFirst, gSecond, h, t, hBom, p, i, v, pBom, iBom, w, u, order };
}
