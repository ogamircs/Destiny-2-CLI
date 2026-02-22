import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import { DestinyComponentType } from "../utils/constants.ts";

async function setupVendorsCommandTest() {
  const getProfileMock = mock(async () => ({
    characters: {
      data: {
        "char-hunter": {
          characterId: "char-hunter",
          classType: 1,
          light: 2009,
        },
        "char-titan": {
          characterId: "char-titan",
          classType: 0,
          light: 2002,
        },
      },
    },
  }));

  const getCharacterVendorsMock = mock(async (characterId: string) => {
    if (characterId === "char-hunter") {
      return {
        vendors: {
          data: {
            "2190858386": {
              vendorHash: 2190858386,
              enabled: true,
              nextRefreshDate: "2026-02-23T17:00:00Z",
            },
          },
        },
        categories: {
          data: {
            "2190858386": {
              categories: [
                { itemIndexes: [0, 1, 2] },
                { itemIndexes: [3] },
              ],
            },
          },
        },
        sales: {
          data: {
            "0": { vendorItemIndex: 0 },
            "1": { vendorItemIndex: 1 },
            "2": { vendorItemIndex: 2 },
            "3": { vendorItemIndex: 3 },
          },
        },
      };
    }

    return {
      vendors: {
        data: {
          "2190858386": {
            vendorHash: 2190858386,
            enabled: true,
            nextRefreshDate: "2026-02-23T17:00:00Z",
          },
          "3361454721": {
            vendorHash: 3361454721,
            enabled: true,
            nextRefreshDate: "2026-02-23T17:00:00Z",
          },
        },
      },
      categories: {
        data: {
          "2190858386": {
            categories: [{ itemIndexes: [0] }],
          },
          "3361454721": {
            categories: [{ itemIndexes: [0, 1] }],
          },
        },
      },
      sales: {
        data: {
          "0": { vendorItemIndex: 0 },
          "1": { vendorItemIndex: 1 },
        },
      },
    };
  });

  const withSpinnerMock = mock(
    async (_text: string, fn: () => Promise<unknown>) => fn()
  );

  mock.module("../api/profile.ts", () => ({
    getProfile: getProfileMock,
  }));
  mock.module("../api/progression.ts", () => ({
    getCharacterVendors: getCharacterVendorsMock,
    VendorComponentType: {
      Vendors: 400,
      VendorSales: 401,
      VendorCategories: 402,
    },
  }));
  mock.module("../ui/spinner.ts", () => ({
    withSpinner: withSpinnerMock,
  }));

  const { registerVendorsCommand } = await import(
    `./vendors.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    registerVendorsCommand,
    getProfileMock,
    getCharacterVendorsMock,
  };
}

async function runVendors(
  registerVendorsCommand: (program: Command) => void,
  args: string[]
): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = (...values: unknown[]) => {
    logs.push(values.map((v) => String(v)).join(" "));
  };

  try {
    const program = new Command();
    registerVendorsCommand(program);
    await program.parseAsync(["node", "destiny", "vendors", ...args]);
  } finally {
    console.log = originalLog;
  }

  return logs;
}

describe("vendors command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("aggregates featured vendors and categories as JSON", async () => {
    const ctx = await setupVendorsCommandTest();

    const logs = await runVendors(ctx.registerVendorsCommand, ["--json"]);
    const output = JSON.parse(logs[0]!);

    expect(ctx.getProfileMock).toHaveBeenCalledWith([
      DestinyComponentType.Characters,
    ]);
    expect(ctx.getCharacterVendorsMock).toHaveBeenCalledTimes(2);
    expect(ctx.getCharacterVendorsMock).toHaveBeenCalledWith("char-hunter", [
      400,
      401,
      402,
    ]);
    expect(ctx.getCharacterVendorsMock).toHaveBeenCalledWith("char-titan", [
      400,
      401,
      402,
    ]);

    expect(output.summary).toMatchObject({
      characterCount: 2,
      vendorCount: 2,
      categoryCount: 4,
      saleItemCount: 7,
    });
    expect(output.vendors[0]).toMatchObject({
      vendorHash: 2190858386,
      categoryCount: 3,
      saleItemCount: 5,
      enabledOn: 2,
    });
  });
});
