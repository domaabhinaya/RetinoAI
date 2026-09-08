import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export interface StoredFileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  filePath: string;
  urlPath: string;
}

export function saveBase64File(
  base64Data: string,
  originalName: string,
  prefix: string = "upload"
): StoredFileMetadata {
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  let buffer: Buffer;
  let mimeType = "image/jpeg";

  if (matches) {
    mimeType = matches[1];
    buffer = Buffer.from(matches[2], "base64");
  } else {
    buffer = Buffer.from(base64Data, "base64");
  }

  const id = `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
  const ext = path.extname(originalName) || (mimeType.includes("png") ? ".png" : mimeType.includes("pdf") ? ".pdf" : ".jpg");
  const fileName = `${id}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, buffer);

  return {
    id,
    originalName,
    mimeType,
    sizeBytes: buffer.length,
    fileName,
    filePath,
    urlPath: `/api/uploads/${fileName}`,
  };
}

export function getFileStream(fileName: string) {
  const safeName = path.basename(fileName);
  const fullPath = path.join(uploadsDir, safeName);
  if (fs.existsSync(fullPath)) {
    return {
      stream: fs.createReadStream(fullPath),
      size: fs.statSync(fullPath).size,
    };
  }
  return null;
}
