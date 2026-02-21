import { Command } from "commander";
import chalk from "chalk";
import { login } from "../services/auth-service.ts";
import { loadTokens, clearTokens } from "../services/token-store.ts";
import { createSpinner } from "../ui/spinner.ts";
import { success, error } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";

export function registerAuthCommands(program: Command) {
  const auth = program.command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Log in via Bungie OAuth")
    .action(async () => {
      const spinner = createSpinner("Waiting for Bungie authorization...").start();
      try {
        console.log(
          chalk.dim("Opening browser for Bungie authorization...")
        );
        const tokens = await login();
        spinner.succeed(
          success(`Logged in as ${chalk.bold(tokens.displayName)}`)
        );
      } catch (err) {
        spinner.fail(error(formatError(err)));
        process.exit(1);
      }
    });

  auth
    .command("logout")
    .description("Clear stored credentials")
    .action(async () => {
      await clearTokens();
      console.log(success("Logged out. Credentials cleared."));
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      const tokens = loadTokens();
      if (!tokens) {
        console.log(error("Not logged in. Run: destiny auth login"));
        return;
      }

      const accessExpired = Date.now() >= tokens.accessTokenExpiresAt;
      const refreshExpired = Date.now() >= tokens.refreshTokenExpiresAt;

      console.log(chalk.bold("Auth Status"));
      console.log(`  User:    ${chalk.cyan(tokens.displayName)}`);
      console.log(
        `  Bungie ID: ${chalk.dim(tokens.membershipId)}`
      );
      console.log(
        `  Destiny ID: ${chalk.dim(tokens.destinyMembershipId)}`
      );
      console.log(
        `  Access Token: ${accessExpired ? chalk.red("expired") : chalk.green("valid")}`
      );
      console.log(
        `  Refresh Token: ${refreshExpired ? chalk.red("expired") : chalk.green("valid")}`
      );

      if (refreshExpired) {
        console.log(
          chalk.yellow("\n  Session expired. Run: destiny auth login")
        );
      }
    });
}
