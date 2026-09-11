import type { Request } from "express";
import Busboy, { type Busboy as BusboyInstance } from "busboy";
import { QR_CONTENT_TYPE, QR_MAX_BYTES } from "../lib/company-wallet-qr";

export interface CompanyWalletQrUpload {
  walletAddress: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

export function parseCompanyWalletQrUpload(req: Request): Promise<CompanyWalletQrUpload> {
  return new Promise((resolve, reject) => {
    let walletAddress = "";
    let fileName = "";
    let contentType = "";
    let fileBytes: Buffer | null = null;
    let fileTooLarge = false;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let busboy: BusboyInstance;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 1, parts: 2, fileSize: QR_MAX_BYTES + 1 },
      });
    } catch {
      fail(new Error("QR upload failed. Please try again."));
      return;
    }

    busboy.on("field", (fieldName, value) => {
      if (fieldName === "walletAddress") walletAddress = value.trim();
    });

    busboy.on("file", (fieldName, file, info) => {
      fileName = info.filename;
      contentType = info.mimeType;
      const chunks: Buffer[] = [];

      if (fieldName !== "qrImage" || contentType !== QR_CONTENT_TYPE || !fileName.toLowerCase().endsWith(".png")) {
        file.resume();
        fail(new Error("Upload a PNG QR image."));
        return;
      }

      file.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on("limit", () => {
        fileTooLarge = true;
      });
      file.on("end", () => {
        fileBytes = Buffer.concat(chunks);
      });
    });

    busboy.on("filesLimit", () => fail(new Error("Upload one QR image at a time.")));
    busboy.on("partsLimit", () => fail(new Error("QR upload request is invalid.")));
    busboy.on("error", () => fail(new Error("QR upload failed. Please try again.")));
    busboy.on("finish", () => {
      if (settled) return;
      if (fileTooLarge || !fileBytes || fileBytes.length > QR_MAX_BYTES) {
        fail(new Error("QR image must be between 1 byte and 2 MB."));
        return;
      }
      if (!walletAddress) {
        fail(new Error("Wallet address is required."));
        return;
      }
      settled = true;
      resolve({ walletAddress, fileName, contentType, bytes: fileBytes });
    });

    req.pipe(busboy);
  });
}