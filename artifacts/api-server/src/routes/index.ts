import { Router, type IRouter } from "express";
import healthRouter from "./health";
import patientsRouter from "./patients";
import screeningCasesRouter from "./screening-cases";
import referredCasesRouter from "./referred-cases";
import followUpsRouter from "./follow-ups";
import datasetsRouter from "./datasets";
import uploadsRouter from "./uploads";
import chatCompletionsRouter from "./chat-completions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/patients", patientsRouter);
router.use("/screening-cases", screeningCasesRouter);
router.use("/referred-cases", referredCasesRouter);
router.use("/follow-ups", followUpsRouter);
router.use("/datasets", datasetsRouter);
router.use("/uploads", uploadsRouter);
router.use(chatCompletionsRouter);

export default router;
