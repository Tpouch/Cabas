// Usage: pnpm hash-password — prints the APP_PASSWORD_HASH line for .env. Runs with Node's TypeScript support.
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/auth/password.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
// Never echo what is typed (only our own prompts are written, directly to stdout).
(rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {};
// The iterator queues lines, so piped input (both lines at once) works as well as typing.
const lines = rl[Symbol.asyncIterator]();

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const { value } = await lines.next();
  process.stdout.write("\n");
  return typeof value === "string" ? value : "";
}

function fail(message: string): never {
  rl.close();
  console.error(message);
  process.exit(1);
}

const password = await askHidden("Mot de passe : ");
if (password.length < 8) fail("Le mot de passe doit faire au moins 8 caractères.");
if ((await askHidden("Confirme le mot de passe : ")) !== password) fail("Les deux mots de passe ne correspondent pas.");
rl.close();
console.log(`APP_PASSWORD_HASH=${hashPassword(password)}`);
