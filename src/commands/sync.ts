import { Command } from "commander";
import { dim, error, header, success } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import {
  getSyncStatus,
  queueOrSyncOperation,
  replaySyncQueue,
  setSyncOfflineMode,
} from "../services/sync-queue.ts";

function parsePayloadArg(payloadArg: string | undefined): unknown {
  if (!payloadArg) {
    return {};
  }

  try {
    return JSON.parse(payloadArg);
  } catch (err) {
    throw new Error(
      `Payload must be valid JSON. Received: ${payloadArg}. ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return "never";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

export function registerSyncCommand(program: Command): void {
  const sync = program
    .command("sync")
    .description("Optional cloud sync with local offline queue (MVP)");

  sync
    .command("status")
    .description("Show local sync state and queue depth")
    .action(() => {
      try {
        const status = getSyncStatus();
        console.log(header("\nSync Status"));
        console.log(`Offline: ${status.offline ? "on" : "off"}`);
        console.log(`Queued operations: ${status.queuedCount}`);
        console.log(`Cloud mirror records: ${status.cloudRecordCount}`);
        console.log(`Last replay: ${formatTimestamp(status.lastReplayAt)}`);
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  sync
    .command("offline <mode>")
    .description("Toggle offline mode (on|off)")
    .action((mode: string) => {
      try {
        const normalized = mode.toLowerCase();
        if (normalized !== "on" && normalized !== "off") {
          throw new Error('Mode must be "on" or "off"');
        }

        const status = setSyncOfflineMode(normalized === "on");
        if (status.offline) {
          console.log(success("Offline mode enabled."));
        } else {
          console.log(success("Offline mode disabled."));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  sync
    .command("queue <operation> [payload]")
    .description("Queue or apply a sync operation. Payload must be JSON.")
    .action(async (operation: string, payloadArg: string | undefined) => {
      try {
        const payload = parsePayloadArg(payloadArg);
        const result = await queueOrSyncOperation(operation, payload);

        if (result.queued) {
          const reason = result.reason ? ` (${result.reason})` : "";
          console.log(success(`Queued operation ${result.id}${reason}`));
          return;
        }

        console.log(success(`Synced operation ${result.id}`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  sync
    .command("replay")
    .description("Replay queued operations when online")
    .action(async () => {
      try {
        const result = await replaySyncQueue();
        console.log(header("\nSync Replay"));
        console.log(`Replayed: ${result.replayed}`);
        console.log(`Failed: ${result.failed}`);
        console.log(`Remaining: ${result.remaining}`);

        if (result.remaining > 0) {
          console.log(dim("Some operations remain queued for a future replay."));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
