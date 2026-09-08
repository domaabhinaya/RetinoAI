import { Router, type Request, type Response } from "express";
import { getFileStream } from "../lib/storage";

const router = Router();

// GET /api/uploads/:filename
router.get("/:filename", (req: Request, res: Response): void => {
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  if (!filename) {
    res.status(400).json({ error: "Filename required" });
    return;
  }

  const result = getFileStream(filename);
  if (!result) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.setHeader("Content-Length", result.size);
  result.stream.pipe(res);
  return;
});

export default router;
