import { execSync } from "node:child_process";

/** Removes the throwaway database started by scripts/e2e-server.sh. */
export default function globalTeardown() {
  execSync("docker rm -f cabas-e2e-db", { stdio: "ignore" });
}
