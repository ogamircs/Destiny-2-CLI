import { describe, expect, test } from "bun:test";
import {
  definitionDisplayName,
  htmlToText,
  humanizeCodeName,
  prettifyProgressionName,
  vendorNameFromParts,
} from "./definition-name.ts";

describe("definition display names", () => {
  test("turns Destiny 1 progression identifiers into readable labels", () => {
    expect(humanizeCodeName("r1_s4_factions_gunsmith")).toBe("Gunsmith");
    expect(humanizeCodeName("faction_event_iron_banner")).toBe("Iron Banner");
    expect(prettifyProgressionName("terminals")).toBe("Terminals");
    expect(prettifyProgressionName("r1_s4_tickets.pvp.trials_of_osiris.wins")).toBe(
      "Trials of Osiris Wins"
    );
    expect(prettifyProgressionName("r1_s4_tickets.pvp.trials_of_osiris.losses")).toBe(
      "Trials of Osiris Losses"
    );
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

  test("names a vendor from its display item when the vendor itself is unnamed", () => {
    expect(vendorNameFromParts(null, "Xûr")).toBe("Xûr");
    expect(vendorNameFromParts("Banshee-44", "Some Icon")).toBe("Banshee-44");
    expect(vendorNameFromParts("  ", null)).toBeNull();
  });

  test("strips advisor HTML", () => {
    expect(htmlToText("<div>Weekly&nbsp;heroic</div><br>Bring a friend")).toBe(
      "Weekly heroic\nBring a friend"
    );
  });
});
