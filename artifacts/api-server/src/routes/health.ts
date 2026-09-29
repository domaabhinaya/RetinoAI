import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { aiService } from "../lib/ai-service";
import { flaskBaseUrl } from "../lib/flask-ai-client";

const router: IRouter = Router();

/**
 * Express backend health + real reachability of the verified Flask AI engine.
 * The response NEVER claims the AI engine is healthy when Flask is unreachable.
 */
router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  const engine = await aiService.health();

  if (engine.reachable) {
    res.json({
      ...data,
      aiEngine: {
        reachable: true,
        url: flaskBaseUrl(),
        device: engine.health.device,
        gpu: engine.health.gpu,
        modelsLoaded: engine.health.models_loaded,
        primaryDr: {
          status: engine.health.primary_dr.status,
          modelName: engine.health.primary_dr.model_name,
          modelVersion: engine.health.primary_dr.model_version,
        },
        secondaryOcular: {
          status: engine.health.secondary_ocular.status,
          modelName: engine.health.secondary_ocular.model_name,
          modelVersion: engine.health.secondary_ocular.model_version,
        },
        qualityGate: engine.health.quality_gate.status,
      },
    });
    return;
  }

  // Flask is down: report it honestly rather than claiming AI readiness.
  res.status(503).json({
    ...data,
    status: "degraded",
    aiEngine: { reachable: false, url: flaskBaseUrl(), error: engine.error },
  });
});

export default router;
