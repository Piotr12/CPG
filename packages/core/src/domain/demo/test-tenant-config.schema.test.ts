import { describe, expect, it } from "vitest";
import rawConfig from "./test-tenant-config.json";
import { byId, idsOf, isSimpleProduct, TEST_TENANT_CONFIG, testTenantConfigSchema, type TestTenantConfig } from "./test-tenant-config.schema";

/** The committed file, changed by `change`, parsed again: the messages of every issue, or [] when it parses. */
function messagesAfter(change: (config: TestTenantConfig) => void): string[] {
  const copy = structuredClone(TEST_TENANT_CONFIG);
  change(copy);
  const result = testTenantConfigSchema.safeParse(copy);
  return result.success ? [] : result.error.issues.map(({ message }) => message);
}

const bomOf = (config: TestTenantConfig, output: string, priority = 1) =>
  config.catalogue.boms.find((bom) => bom.output === output && bom.priority === priority)!;

describe("the committed test-tenant config", () => {
  it("parses, and TEST_TENANT_CONFIG is that parse", () => {
    expect(messagesAfter(() => {})).toEqual([]);
    expect(TEST_TENANT_CONFIG).toEqual(testTenantConfigSchema.parse(rawConfig));
  });

  it("states the owner's shape: 4 plants, 10 customers, 6 suppliers, 12 + 4 + 5 + 5 materials, 3 key-cabinet BOMs, 24 months back, 12 ahead", () => {
    const { shape, horizon } = TEST_TENANT_CONFIG;
    expect([
      shape.locations,
      shape.customers,
      shape.suppliers,
      shape.rawMaterials,
      shape.intermediates,
      shape.finishedProducts.simple,
      shape.finishedProducts.composed,
      shape.alternateBoms.count,
      horizon.historyMonths,
      horizon.forecastMonths,
    ]).toEqual([4, 10, 6, 12, 4, 5, 5, 3, 24, 12]);
  });

  it("keeps the first records' identities (spec Q9) and has 16 BOMs and 15 made pairs", () => {
    const { catalogue } = TEST_TENANT_CONFIG;
    expect(catalogue.materials.slice(0, 6).map(({ description }) => description)).toEqual([
      "Steel sheet 2 mm",
      "Bolt M8",
      "Paint, red",
      "Painted side panel",
      "Cabinet, red",
      "Cardboard box",
    ]);
    expect(catalogue.locations[0]).toBe("Main plant, Wrocław");
    expect(catalogue.customers.slice(0, 4)).toEqual(["Hardware Store Chain Sp. z o.o.", "Office Interiors S.A.", "Online shop (direct sales)", "Export distributor (DE)"]);
    expect(catalogue.suppliers.slice(0, 3)).toEqual(["Steel Service Centre Sp. z o.o.", "Fasteners Wholesale", "Packaging Supplies Ltd."]);
    expect(catalogue.boms).toHaveLength(16);
    expect(catalogue.production).toHaveLength(15);
  });

  it("makes 00000022…00000026 simple and 00000005, 00000018…00000021 composed", () => {
    const finished = idsOf(TEST_TENANT_CONFIG.catalogue.materials).filter((id) => byId(TEST_TENANT_CONFIG.catalogue.materials, id)!.type === "finished");
    expect(finished.filter((id) => isSimpleProduct(TEST_TENANT_CONFIG, id))).toEqual(["00000022", "00000023", "00000024", "00000025", "00000026"]);
    expect(finished.filter((id) => !isSimpleProduct(TEST_TENANT_CONFIG, id))).toEqual(["00000005", "00000018", "00000019", "00000020", "00000021"]);
  });

  it("has every customer buy two to five products from one to three plants", () => {
    const plantOf = (product: string) => TEST_TENANT_CONFIG.catalogue.production.find(({ material }) => material === product)!.location;
    for (const { shares } of TEST_TENANT_CONFIG.demand.customers) {
      const products = Object.keys(shares);
      expect(products.length).toBeGreaterThanOrEqual(2);
      expect(products.length).toBeLessThanOrEqual(5);
      const plants = new Set(products.map(plantOf)).size;
      expect(plants).toBeGreaterThanOrEqual(1);
      expect(plants).toBeLessThanOrEqual(3);
    }
  });
});

describe("testTenantConfigSchema's cross-checks", () => {
  it("refuses a catalogue list longer or shorter than the shape says", () => {
    expect(messagesAfter((config) => config.catalogue.customers.push("Eleventh customer"))).toEqual(["The shape says 10 customers; the catalogue lists 11."]);
    expect(messagesAfter((config) => config.catalogue.locations.push("Fifth plant"))).toEqual(["The shape says 4 locations; the catalogue lists 5."]);
  });

  it("refuses material counts per type that differ from the shape", () => {
    expect(messagesAfter((config) => (config.shape.rawMaterials = 11))).toEqual(["The shape says 11 rawMaterials; the catalogue has 12."]);
    expect(messagesAfter((config) => (config.shape.intermediates = 5))).toEqual(["The shape says 5 intermediates; the catalogue has 4."]);
    expect(messagesAfter((config) => (config.shape.finishedProducts = { simple: 4, composed: 6 }))).toEqual([
      "The shape says 4 simple; the catalogue has 5.",
      "The shape says 6 composed; the catalogue has 5.",
    ]);
  });

  it("refuses a reference to a record the catalogue doesn't have, and checks nothing else until they resolve", () => {
    expect(
      messagesAfter((config) => {
        config.catalogue.boms[0].components[0].material = "00000099";
        config.catalogue.production[0].location = "00000005";
        config.demand.customers[0].customer = "00000000";
        config.catalogue.materials[0].buy!.suppliers = ["00000007"];
        config.catalogue.purchasedIntermediates[0].buy.suppliers = ["00000008"];
        config.shape.rawMaterials = 1;
      }),
    ).toEqual([
      "There is no supplier 00000007 in the catalogue.",
      "There is no material 00000099 in the catalogue.",
      "There is no location 00000005 in the catalogue.",
      "There is no supplier 00000008 in the catalogue.",
      "There is no customer 00000000 in the catalogue.",
    ]);
    expect(messagesAfter((config) => (config.shape.alternateBoms.product = "00000027"))).toEqual(["There is no material 00000027 in the catalogue."]);
    expect(messagesAfter((config) => (config.demand.products[0].material = "00000030"))).toEqual(["There is no material 00000030 in the catalogue."]);
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
    expect(messagesAfter((config) => (bomOf(config, "00000004").components[1].unit = "gal"))).toEqual(["Material 00000003 has no unit gal."]);
  });

  it("refuses a recipe cycle (R04)", () => {
    expect(messagesAfter((config) => bomOf(config, "00000015").components.push({ material: "00000015", quantity: "1", unit: "each" }))).toEqual([
      "BOM 2 closes a cycle through 00000015.",
    ]);
  });

  it("refuses a made material without exactly one priority-1 BOM, and an alternate product with other priorities", () => {
    expect(messagesAfter((config) => config.catalogue.boms.pop())).toEqual(["Material 00000026 needs BOMs at priorities 1, 2, 3; the catalogue has 1, 2."]);
    expect(messagesAfter((config) => config.catalogue.boms.splice(0, 1))).toEqual(["Material 00000004 needs BOMs at priorities 1; the catalogue has none."]);
    expect(messagesAfter((config) => (bomOf(config, "00000025").priority = 2))).toContain("Material 00000025 needs BOMs at priorities 1; the catalogue has 2.");
  });

  it("refuses an alternate-BOM product that isn't a simple finished product (spec Q6)", () => {
    expect(
      messagesAfter((config) => {
        config.shape.alternateBoms = { product: "00000018", count: 1 };
        config.catalogue.boms = config.catalogue.boms.filter(({ output, priority }) => output !== "00000026" || priority === 1);
      }),
    ).toEqual(["Material 00000018 is not a simple finished product."]);
    expect(
      messagesAfter((config) => {
        config.shape.alternateBoms = { product: "00000004", count: 1 };
        config.catalogue.boms = config.catalogue.boms.filter(({ output, priority }) => output !== "00000026" || priority === 1);
      }),
    ).toEqual(["Material 00000004 is not a simple finished product."]);
  });

  it("refuses a made raw material, a pair made twice, and a finished product made at no plant or at two", () => {
    expect(messagesAfter((config) => config.catalogue.production.push({ ...config.catalogue.production[0], material: "00000001" }))).toEqual([
      "Material 00000001 needs BOMs at priorities 1; the catalogue has none.",
      "Material 00000001 is raw: it is bought, never made.",
    ]);
    expect(messagesAfter((config) => config.catalogue.production.push({ ...config.catalogue.production[0] }))).toEqual([
      "Material 00000004 is made at location 00000001 twice.",
    ]);
    expect(messagesAfter((config) => config.catalogue.production.push({ ...config.catalogue.production[3], location: "00000002" }))).toEqual([
      "Finished material 00000005 must be made at exactly one plant; it is made at 2.",
    ]);
    expect(messagesAfter((config) => config.catalogue.production.pop())).toContain("Finished material 00000026 must be made at exactly one plant; it is made at 0.");
  });

  it("refuses a raw material without buy parameters, buy parameters on a made material, and a bought intermediate that isn't one", () => {
    expect(messagesAfter((config) => delete config.catalogue.materials[0].buy)).toEqual(["Raw material 00000001 needs buy parameters and a supplier."]);
    expect(messagesAfter((config) => (config.catalogue.materials[3].buy = config.catalogue.materials[0].buy))).toEqual([
      "Only a raw material is bought everywhere; 00000004 is intermediate.",
    ]);
    expect(messagesAfter((config) => (config.catalogue.purchasedIntermediates[0].material = "00000005"))).toEqual(["Material 00000005 is not an intermediate."]);
  });

  it("refuses demand without an entry per finished product, a non-finished product, an unknown profile or unit, and weights not summing to 1", () => {
    expect(messagesAfter((config) => config.demand.products.pop())).toEqual([
      "Finished material 00000026 needs exactly one demand entry; it has 0.",
      "Material 00000026 has no demand entry.",
      "Material 00000026 has no demand entry.",
      "Material 00000026 has no demand entry.",
      "Material 00000026 has no demand entry.",
      "Material 00000026 has no demand entry.",
    ]);
    expect(messagesAfter((config) => config.demand.products.push({ material: "00000004", monthlyBase: "1", profile: "flat", enteredIn: "each" }))).toEqual([
      "Material 00000004 is not a finished product.",
      "The customers' weights for 00000004 must sum to 1.",
    ]);
    expect(messagesAfter((config) => (config.demand.products[0].profile = "winter"))).toEqual(["There is no seasonality profile winter."]);
    expect(messagesAfter((config) => (config.demand.products[0].enteredIn = "case"))).toEqual(["Material 00000005 has no unit case."]);
    // Every finished product has an SU factor, but SU is never an entered unit (#239).
    expect(messagesAfter((config) => (config.demand.products[0].enteredIn = "SU"))).toEqual(["Material 00000005 has no unit SU."]);
    expect(messagesAfter((config) => (config.demand.customers[0].shares["00000022"] = "0.36"))).toEqual(["The customers' weights for 00000022 must sum to 1."]);
  });

  it("refuses a waste order on a pair that isn't made or a sheet its recipe doesn't use", () => {
    expect(messagesAfter((config) => (config.supply.waste.orders[0].location = "00000002"))).toEqual([
      "Material 00000021 is not made at location 00000002.",
    ]);
    expect(messagesAfter((config) => (config.supply.waste.orders[0].sheet = "00000007"))).toEqual(["Material 00000021's recipe doesn't use 00000007."]);
    expect(messagesAfter((config) => (config.supply.waste.orders[0].output = "00000001"))).toEqual([
      "Material 00000001 is not made at location 00000001.",
      "Material 00000001's recipe doesn't use 00000001.",
    ]);
  });

  it("refuses requisitions and top-ups of anything but a raw material", () => {
    expect(
      messagesAfter((config) => {
        config.supply.requisitions.open[0].material = "00000004";
        config.supply.requisitions.converted[1].material = "00000017";
        config.supply.topUps[2].material = "00000022";
      }),
    ).toEqual(["Material 00000004 is not a raw material.", "Material 00000017 is not a raw material.", "Material 00000022 is not a raw material."]);
  });

  it("refuses decimals that aren't decimal strings", () => {
    expect(messagesAfter((config) => (config.demand.growthPerYear = "-0.04"))).toHaveLength(1);
    expect(messagesAfter((config) => (config.catalogue.production[0].lotMultiple = "0"))).toEqual(["Use a decimal string greater than 0."]);
    expect(messagesAfter((config) => (config.catalogue.production[0].lotMultiple = "ten"))).toEqual(["Use a decimal string greater than 0."]);
  });
});
