import { describe, expect, test } from "bun:test";
import {
  definitionDisplayName,
  htmlToText,
  humanizeCodeName,
} from "./definition-name.ts";

describe("definition display names", () => {
  test("turns Destiny 1 progression identifiers into readable labels", () => {
    expect(humanizeCodeName("r1_s4_factions_gunsmith")).toBe("Gunsmith");
    expect(humanizeCodeName("faction_event_iron_banner")).toBe("Iron Banner");
  });

  test("prefers faction and item names over internal identifiers", () => {
    expect(
      definitionDisplayName({
        name: "r1_s4_factions_gunsmith",
        factionName: "Gunsmith",
      })
    ).toBe("Gunsmith");
    expect(
      definitionDisplayName({
        name: "inventory_item_fatebringer",
        itemName: "Fatebringer",
      })
    ).toBe("Fatebringer");
    expect(definitionDisplayName({ name: "faction_event_iron_banner" })).toBe(
      "Iron Banner"
    );
    expect(
      definitionDisplayName({
        displayProperties: { name: "Banshee-44" },
        hash: 1,
      })
    ).toBe("Banshee-44");
  });

  test("strips advisor HTML", () => {
    expect(htmlToText("<div>Weekly&nbsp;heroic</div><br>Bring a friend")).toBe(
      "Weekly heroic\nBring a friend"
    );
  });
});
