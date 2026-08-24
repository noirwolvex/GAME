import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env"), override: true });

import("./index").catch((error) => {
  console.error("[GAME] server bootstrap failed:", error);
  process.exitCode = 1;
});
