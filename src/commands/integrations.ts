import { Command } from "commander";
import { dim, header } from "../ui/format.ts";

function printStreamDeckStatus(): void {
  console.log("Stream Deck integration is deferred in this milestone.");
  console.log(dim("Status: scaffolded command placeholders only (no runtime hooks)."));
}

function printPackagingStatus(): void {
  console.log(header("\nPackaging Status"));
  console.log("Desktop packaging: placeholder scaffold (no installer pipeline yet).");
  console.log("Mobile packaging: placeholder scaffold (no mobile shell wiring yet).");
  console.log(
    dim("Use these commands as explicit stubs until packaging streams are implemented.")
  );
}

export function registerIntegrationsCommand(program: Command): void {
  const integrations = program
    .command("integrations")
    .description("Deferred integration and packaging scaffolding commands");

  integrations
    .command("status")
    .description("Show integration and packaging scaffold summary")
    .action(() => {
      printStreamDeckStatus();
      printPackagingStatus();
    });

  const streamdeck = integrations
    .command("streamdeck")
    .description("Stream Deck integration scaffolding");

  streamdeck
    .command("status")
    .description("Show Stream Deck scaffold status")
    .action(() => {
      printStreamDeckStatus();
    });

  streamdeck
    .command("setup")
    .description("Print Stream Deck setup placeholder steps")
    .action(() => {
      console.log("Placeholder setup scaffolding for Stream Deck is available.");
      console.log(
        dim(
          "No plugin files are generated yet; this command exists so automation can target a stable CLI surface."
        )
      );
    });

  const packaging = integrations
    .command("packaging")
    .description("Desktop/mobile packaging scaffolding");

  packaging
    .command("status")
    .description("Show packaging scaffold status")
    .action(() => {
      printPackagingStatus();
    });
}
