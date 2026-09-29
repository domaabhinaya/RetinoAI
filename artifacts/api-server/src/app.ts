import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Retinal fundus images arrive as base64 data URLs, which exceed the 100kb
// express.json() default. 30mb comfortably covers the Flask engine's own 25 MB
// upload ceiling (RETINOAI_MAX_UPLOAD_BYTES) so the two layers stay consistent.
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

app.use("/api", router);
app.use("/v1", router);
app.use("/", router);

export default app;
