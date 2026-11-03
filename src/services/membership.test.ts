import { describe, expect, test } from "bun:test";
import { selectD1Membership } from "./membership.ts";

const xbox = { membershipType: 1, membershipId: "x", displayName: "XboxName" };
const psn = { membershipType: 2, membershipId: "p", displayName: "PsnName" };
const steam = { membershipType: 3, membershipId: "s", displayName: "SteamName" };

describe("selectD1Membership", () => {
  test("uses the only console membership", () => {
    expect(selectD1Membership([steam, psn])).toEqual(psn);
  });

  test("requires --platform when both consoles are linked", () => {
    expect(() => selectD1Membership([xbox, psn])).toThrow(/--platform xbox or --platform psn/);
    expect(selectD1Membership([xbox, psn], 1)).toEqual(xbox);
  });

  test("rejects a PC platform override and a Steam-only account", () => {
    expect(() => selectD1Membership([steam, psn], 3)).toThrow(/Xbox and PlayStation/);
    expect(() => selectD1Membership([steam])).toThrow(/No Destiny 1 membership/);
  });
});
