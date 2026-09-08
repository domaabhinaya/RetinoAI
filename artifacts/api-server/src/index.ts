try {
  // Automatically loads .env in Node 20+
  // @ts-ignore
  process.loadEnvFile?.();
} catch {}

import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);


app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
