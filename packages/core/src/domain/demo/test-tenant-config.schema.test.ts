import { describe, expect, it } from "vitest";
import rawConfig from "./test-tenant-config.json";
import { finishedProducts, productsBoughtBy, TEST_TENANT_CONFIG, testTenantConfigSchema, type TestTenantConfig } from "./test-tenant-config.schema";

/** The committed file, changed by `change`, parsed again: the messages of every issue, or [] when it parses. */
function messagesAfter(change: (config: TestTenantConfig) => void): string[] {
  const copy = structuredClone(TEST_TENANT_CONFIG);
  change(copy);
  const result = testTenantConfigSchema.safeParse(copy);
  return result.success ? [] : result.error.issues.map(({ message }) => message);
}

const bomOf = (config: TestTenantConfig, output: string, priority = 1) =>
  config.catalogue.boms.find((bom) => bom.output === output && bom.priority === priority)!;
const customerOf = (config: TestTenantConfig, customer: string) => config.demand.customers.find((entry) => entry.customer === customer)!;
const trendOf = (config: TestTenantConfig, customer: string) => customerOf(config, customer).trend as { quarterlyGrowth: string; shares: Record<string, string> };
const weightsOf = (config: TestTenantConfig, customer: string) => (customerOf(config, customer).trend as { remainderWeights: Record<string, string> }).remainderWeights;

describe("the committed test-tenant config", () => {
  it("parses, and TEST_TENANT_CONFIG is that parse", () => {
    expect(messagesAfter(() => {})).toEqual([]);
    expect(TEST_TENANT_CONFIG).toEqual(testTenantConfigSchema.parse(rawConfig));
  });

  it("states the owner's shape: 1 plant, 4 customers, 2 suppliers, 14 + 4 materials and 5 types in 12 SKUs, 3 office-cabinet BOMs, 24 months back, 12 ahead", () => {
    const { shape, horizon } = TEST_TENANT_CONFIG;
    expect([
      shape.locations,
      shape.customers,
      shape.suppliers,
      shape.rawMaterials,
      shape.intermediates,
      shape.finishedProducts.types,
      shape.finishedProducts.skus,
      shape.alternateBoms.product,
      shape.alternateBoms.count,
      horizon.historyMonths,
      horizon.forecastMonths,
    ]).toEqual([1, 4, 2, 14, 4, 5, 12, "00000018", 3, 24, 12]);
  });

  it("keeps the first records' identities (#126 Q9), turns 00000013 into blue paint, and has 18 BOMs and 16 made pairs", () => {
    const { catalogue } = TEST_TENANT_CONFIG;
    expect(catalogue.materials.slice(0, 6).map(({ description }) => description)).toEqual([
      "Steel sheet 2 mm",
      "Bolt M8",
      "Paint, red",
      "Side panel, primed",
      "Cabinet, red",
      "Cardboard box",
    ]);
    expect(catalogue.materials[12].description).toBe("Paint, blue RAL 5010");
    expect(catalogue.locations).toEqual(["Main plant, Wrocław"]);
    expect(catalogue.customers).toEqual(["Hardware Store Chain Sp. z o.o.", "Office Interiors S.A.", "Online shop (direct sales)", "Export distributor (DE)"]);
    expect(catalogue.suppliers).toEqual(["Steel Service Centre Sp. z o.o.", "Industrial Supplies Wholesale Sp. z o.o."]);
    expect(catalogue.boms).toHaveLength(18);
    expect(catalogue.production).toHaveLength(16);
  });

  it("buys steel and wire from the steel service centre and everything else from the wholesaler (Q4)", () => {
    const bySupplier = (supplier: string) => catalogueRaw().filter(({ buy }) => buy!.supplier === supplier).map(({ description }) => description);
    expect(bySupplier("00000001")).toEqual(["Steel sheet 2 mm", "Steel sheet 1.0 mm", "Welding wire 0.8 mm"]);
    expect(bySupplier("00000002")).toHaveLength(11);
    expect(bySupplier("00000002").filter((description) => description.startsWith("Paint"))).toHaveLength(5);
  });

  it("paints a SKU at final assembly: the four intermediates hold no paint, and the colours of a type differ only in their paint line (Q2)", () => {
    const paints = new Set(["00000003", "00000008", "00000013", "00000022", "00000023"]);
    const { boms } = TEST_TENANT_CONFIG.catalogue;
    for (const intermediate of ["00000004", "00000015", "00000016", "00000017"]) {
      expect(bomOf(TEST_TENANT_CONFIG, intermediate).components.some(({ material }) => paints.has(material))).toBe(false);
    }
    const withoutPaint = (output: string) => bomOf(TEST_TENANT_CONFIG, output).components.filter(({ material }) => !paints.has(material));
    for (const { products } of typesWithProducts()) {
      for (const product of products) {
        expect(withoutPaint(product)).toEqual(withoutPaint(products[0]));
        expect(bomOf(TEST_TENANT_CONFIG, product).components.filter(({ material }) => paints.has(material))).toHaveLength(1);
      }
    }
    expect(boms.filter(({ output }) => output === "00000018").map(({ priority }) => priority)).toEqual([1, 2, 3]);
  });

  it("has the online shop buy every SKU, the hardware chain five, Office Interiors eight and the export distributor seven, in pallets (spec 'Customers')", () => {
    const skus = finishedProducts(TEST_TENANT_CONFIG);
    expect(TEST_TENANT_CONFIG.demand.customers.map((entry) => [entry.customer, productsBoughtBy(entry).length, entry.wholePacks])).toEqual([
      ["00000001", 5, false],
      ["00000002", 8, false],
      ["00000003", skus.length, false],
      ["00000004", 7, true],
    ]);
    expect([trendOf(TEST_TENANT_CONFIG, "00000003").quarterlyGrowth, trendOf(TEST_TENANT_CONFIG, "00000001").quarterlyGrowth]).toEqual(["0.10", "-0.015"]);
  });
});

function catalogueRaw() {
  return TEST_TENANT_CONFIG.catalogue.materials.filter(({ type }) => type === "raw");
}

function typesWithProducts() {
  const { types, products } = TEST_TENANT_CONFIG.demand;
  return types.map(({ name }) => ({ name, products: products.filter(({ type }) => type === name).map(({ material }) => material) }));
}

describe("testTenantConfigSchema's cross-checks", () => {
  it("refuses a catalogue list longer or shorter than the shape says", () => {
    expect(messagesAfter((config) => config.catalogue.customers.push("Fifth customer"))).toEqual(["The shape says 4 customers; the catalogue lists 5."]);
    expect(messagesAfter((config) => config.catalogue.locations.push("Second plant"))).toEqual(["The shape says 1 locations; the catalogue lists 2."]);
  });

  it("refuses material and type counts that differ from the shape", () => {
    expect(messagesAfter((config) => (config.shape.rawMaterials = 13))).toEqual(["The shape says 13 rawMaterials; the catalogue has 14."]);
    expect(messagesAfter((config) => (config.shape.intermediates = 5))).toEqual(["The shape says 5 intermediates; the catalogue has 4."]);
    expect(messagesAfter((config) => (config.shape.finishedProducts = { types: 4, skus: 13 }))).toEqual([
      "The shape says 4 types; the catalogue has 5.",
      "The shape says 13 skus; the catalogue has 12.",
    ]);
  });

  it("refuses a reference to a record the catalogue doesn't have, and checks nothing else until they resolve", () => {
    expect(
      messagesAfter((config) => {
        config.catalogue.materials[0].buy!.supplier = "00000007";
        config.catalogue.boms[0].components[0].material = "00000099";
        config.catalogue.production[0].location = "00000005";
        config.demand.customers[0].customer = "00000000";
        trendOf(config, "00000003").shares["00000031"] = "0.1";
        config.demand.projects[0].customer = "00000009";
        config.demand.projects[1].material = "00000040";
        config.shape.rawMaterials = 1;
      }),
    ).toEqual([
      "There is no supplier 00000007 in the catalogue.",
      "There is no material 00000099 in the catalogue.",
      "There is no location 00000005 in the catalogue.",
      "There is no customer 00000000 in the catalogue.",
      "There is no material 00000031 in the catalogue.",
      "There is no customer 00000009 in the catalogue.",
      "There is no material 00000040 in the catalogue.",
    ]);
    expect(messagesAfter((config) => (config.shape.alternateBoms.product = "00000031"))).toEqual(["There is no material 00000031 in the catalogue."]);
    expect(messagesAfter((config) => (config.demand.products[0].material = "00000031"))).toEqual(["There is no material 00000031 in the catalogue."]);
    for (const list of ["laterIncreases", "topUps", "open", "converted", "waste"] as const) {
      const messages = messagesAfter((config) => {
        const pairs = {
          laterIncreases: config.supply.safetyStock.laterIncreases,
          topUps: config.supply.topUps,
          open: config.supply.requisitions.open,
          converted: config.supply.requisitions.converted,
          waste: config.supply.waste.orders,
        }[list];
        pairs[0].location = "00000009";
      });
      expect(messages).toEqual(["There is no location 00000009 in the catalogue."]);
    }
  });

  it("refuses a raw output, a finished component and a unit the component doesn't have (R02)", () => {
    expect(messagesAfter((config) => (bomOf(config, "00000004").output = "00000001"))).toContain("Material 00000001 is raw: it can't be a BOM's output.");
    expect(messagesAfter((config) => bomOf(config, "00000018").components.push({ material: "00000005", quantity: "1", unit: "each" }))).toEqual([
      "Material 00000005 is finished: it can't be a component.",
    ]);
    expect(messagesAfter((config) => (bomOf(config, "00000005").components[3].unit = "gal"))).toEqual(["Material 00000003 has no unit gal."]);
  });

  it("refuses a recipe cycle (R04)", () => {
    expect(messagesAfter((config) => bomOf(config, "00000015").components.push({ material: "00000015", quantity: "1", unit: "each" }))).toEqual([
      "BOM 2 closes a cycle through 00000015.",
    ]);
  });

  it("refuses a made material without exactly one priority-1 BOM, and an alternate product with other priorities", () => {
    expect(messagesAfter((config) => config.catalogue.boms.pop())).toEqual(["Material 00000018 needs BOMs at priorities 1, 2, 3; the catalogue has 1, 2."]);
    expect(messagesAfter((config) => config.catalogue.boms.splice(0, 1))).toEqual(["Material 00000004 needs BOMs at priorities 1; the catalogue has none."]);
    expect(messagesAfter((config) => (bomOf(config, "00000025").priority = 2))).toContain("Material 00000025 needs BOMs at priorities 1; the catalogue has 2.");
  });

  it("refuses an alternate-BOM product that isn't a finished product (Q13)", () => {
    expect(
      messagesAfter((config) => {
        config.shape.alternateBoms = { product: "00000004", count: 1 };
        config.catalogue.boms = config.catalogue.boms.filter(({ output, priority }) => output !== "00000018" || priority === 1);
      }),
    ).toEqual(["Material 00000004 is not a finished product."]);
  });

  it("refuses a made raw material, a pair made twice, and a finished product made at no plant or at two", () => {
    expect(messagesAfter((config) => config.catalogue.production.push({ ...config.catalogue.production[0], material: "00000001" }))).toEqual([
      "Material 00000001 needs BOMs at priorities 1; the catalogue has none.",
      "Material 00000001 is raw: it is bought, never made.",
    ]);
    expect(messagesAfter((config) => config.catalogue.production.push({ ...config.catalogue.production[0] }))).toEqual([
      "Material 00000004 is made at location 00000001 twice.",
    ]);
    expect(
      messagesAfter((config) => {
        config.catalogue.locations.push("Second plant");
        config.shape.locations = 2;
        config.catalogue.production.push({ ...config.catalogue.production[4], location: "00000002" });
      }),
    ).toEqual(["Finished material 00000005 must be made at exactly one plant; it is made at 2."]);
    expect(messagesAfter((config) => config.catalogue.production.pop())).toContain("Finished material 00000030 must be made at exactly one plant; it is made at 0.");
  });

  it("refuses a raw material without buy parameters, and buy parameters on a made material", () => {
    expect(messagesAfter((config) => delete config.catalogue.materials[0].buy)).toEqual(["Raw material 00000001 needs buy parameters and a supplier."]);
    expect(messagesAfter((config) => (config.catalogue.materials[3].buy = config.catalogue.materials[0].buy))).toEqual([
      "Only a raw material is bought; 00000004 is intermediate.",
    ]);
  });

  it("refuses demand without an entry per SKU, a non-finished product, an unknown type, profile or unit, and colour mixes not summing to 1", () => {
    expect(messagesAfter((config) => config.demand.products.pop())).toEqual([
      "Finished material 00000030 needs exactly one demand entry; it has 0.",
      "The colour mixes of Workshop cabinet must sum to 1.",
    ]);
    expect(messagesAfter((config) => config.demand.products.push({ material: "00000004", type: "Cabinet", mix: "0.1", enteredIn: "each" }))).toEqual([
      "Material 00000004 is not a finished product.",
      "The colour mixes of Cabinet must sum to 1.",
    ]);
    expect(messagesAfter((config) => (config.demand.products[0].type = "Wardrobe"))).toEqual([
      "There is no furniture type Wardrobe.",
      "The colour mixes of Cabinet must sum to 1.",
    ]);
    expect(messagesAfter((config) => (config.demand.types[0].profile = "winter"))).toEqual(["There is no seasonality profile winter."]);
    expect(messagesAfter((config) => (config.demand.products[0].enteredIn = "case"))).toEqual(["Material 00000005 has no unit case."]);
    // Every finished product has an SU factor, but SU is never an entered unit (#239).
    expect(messagesAfter((config) => (config.demand.products[0].enteredIn = "SU"))).toEqual(["Material 00000005 has no unit SU."]);
  });

  it("refuses customers unless exactly one buys every SKU and every SKU's remainder weights sum to 1", () => {
    expect(messagesAfter((config) => delete trendOf(config, "00000003").shares["00000030"])).toEqual(["Exactly one customer must buy every SKU; 0 do."]);
    expect(
      messagesAfter((config) => {
        for (const sku of finishedProducts(config)) trendOf(config, "00000001").shares[sku] ??= "0.01";
      }),
    ).toEqual(["Exactly one customer must buy every SKU; 2 do."]);
    expect(messagesAfter((config) => (weightsOf(config, "00000002")["00000018"] = "0.5"))).toEqual(["The remainder customers' weights for 00000018 must sum to 1."]);
    // A SKU only trending customers buy has no remainder customer at all.
    expect(messagesAfter((config) => delete weightsOf(config, "00000002")["00000027"])).toEqual(["The remainder customers' weights for 00000027 must sum to 1."]);
    expect(messagesAfter((config) => (weightsOf(config, "00000002")["00000004"] = "1"))).toEqual(["Material 00000004 is not a finished product."]);
    expect(messagesAfter((config) => (trendOf(config, "00000001").shares["00000015"] = "0.1"))).toEqual(["Material 00000015 is not a finished product."]);
  });

  it("refuses a delivery day listed twice or outside Monday to Friday", () => {
    expect(messagesAfter((config) => (customerOf(config, "00000001").deliveryDays = [2, 2]))).toEqual(["A delivery day is listed twice."]);
    expect(messagesAfter((config) => (customerOf(config, "00000001").deliveryDays = [6]))).toHaveLength(1);
    expect(messagesAfter((config) => (customerOf(config, "00000001").deliveryDays = []))).toHaveLength(1);
  });

  it("refuses trending shares that leave the remainder customers less than 0.2 of a SKU at the history start or the forecast's end", () => {
    expect(messagesAfter((config) => (trendOf(config, "00000001").shares["00000005"] = "0.7"))).toEqual([
      "The remainder customers keep 0.150 of 00000005; they need at least 0.2.",
    ]);
    // 0.15 growing ~7.4 % a quarter relative to the business holds about 0.35 after 37 months; at 0.25 it holds ~0.59.
    expect(messagesAfter((config) => (trendOf(config, "00000003").shares["00000021"] = "0.25"))).toEqual([
      expect.stringMatching(/^The remainder customers keep 0\.1\d\d of 00000021; they need at least 0\.2\.$/),
    ]);
    // 40 months ahead, the online shop holds ~0.71 of every SKU and the hardware chain ~0.19 of its five.
    expect(messagesAfter((config) => (config.horizon.forecastMonths = 40))).toEqual(
      ["00000005", "00000021", "00000024", "00000025", "00000030"].map((sku) => expect.stringMatching(new RegExp(`^The remainder customers keep 0\\.\\d+ of ${sku}; they need at least 0\\.2\\.$`))),
    );
  });

  it("refuses a project for a SKU its customer doesn't buy, from a customer with no demand entry, or on a day that isn't in every year", () => {
    expect(messagesAfter((config) => (config.demand.projects[0].material = "00000005"))).toEqual(["Customer 00000002 doesn't buy 00000005."]);
    expect(
      messagesAfter((config) => {
        config.catalogue.customers.push("Walk-in customer");
        config.shape.customers = 5;
        config.demand.projects[0].customer = "00000005";
      }),
    ).toEqual(["Customer 00000005 doesn't buy 00000026."]);
    expect(messagesAfter((config) => (config.demand.projects[0].date = "02-29"))).toEqual(["Use a day of the year written MM-DD."]);
    expect(messagesAfter((config) => (config.demand.projects[0].date = "3-16"))).toEqual(["Use a day of the year written MM-DD."]);
  });

  it("refuses a waste order on a pair that isn't made or a sheet its priority-1 BOM doesn't use", () => {
    expect(
      messagesAfter((config) => {
        config.catalogue.locations.push("Second plant");
        config.shape.locations = 2;
        config.supply.waste.orders[0].location = "00000002";
      }),
    ).toEqual(["Material 00000021 is not made at location 00000002."]);
    expect(messagesAfter((config) => (config.supply.waste.orders[0].sheet = "00000007"))).toEqual(["Material 00000021's priority-1 BOM doesn't use 00000007."]);
    expect(messagesAfter((config) => (config.supply.waste.orders[0].output = "00000001"))).toEqual([
      "Material 00000001 is not made at location 00000001.",
      "Material 00000001's priority-1 BOM doesn't use 00000001.",
    ]);
  });

  it("refuses requisitions and top-ups of anything but a raw material", () => {
    expect(
      messagesAfter((config) => {
        config.supply.requisitions.open[0].material = "00000004";
        config.supply.requisitions.converted[1].material = "00000017";
        config.supply.topUps[0].material = "00000022";
        config.supply.topUps.push({ location: "00000001", material: "00000005" });
      }),
    ).toEqual(["Material 00000004 is not a raw material.", "Material 00000017 is not a raw material.", "Material 00000005 is not a raw material."]);
  });

  it("refuses decimals that aren't decimal strings, and a growth rate that isn't a signed one", () => {
    expect(messagesAfter((config) => (config.demand.growthPerYear = "4 %"))).toEqual(["Use a decimal string of at least 0 with at most 12 digits before the point and 6 after it."]);
    expect(messagesAfter((config) => (config.catalogue.production[0].lotMultiple = "0"))).toEqual(["Use a decimal string greater than 0."]);
    expect(messagesAfter((config) => (config.catalogue.production[0].lotMultiple = "ten"))).toEqual(["Use a decimal string greater than 0."]);
    expect(messagesAfter((config) => (trendOf(config, "00000001").quarterlyGrowth = "minus 1 %"))).toEqual(["Use a decimal string such as 0.1 or -0.015."]);
  });
});
