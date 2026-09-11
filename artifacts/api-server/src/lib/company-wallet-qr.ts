import { randomUUID } from "node:crypto";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { Storage } from "@google-cloud/storage";

export const LEGACY_QR_OBJECT_PATH = "/legacy/deposit-wallet-qr";
export const QR_CONTENT_TYPE = "image/png";
export const QR_MAX_BYTES = 2 * 1024 * 1024;

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const OBJECT_PATH_RE = /^\/objects\/company-wallet-qr\/[a-zA-Z0-9-]+\.png$/;
const BEP20_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type QrValidationCode =
  | "INVALID_PNG"
  | "QR_NOT_FOUND"
  | "QR_ADDRESS_MISMATCH"
  | "QR_OBJECT_READ_FAILED";

export class QrValidationError extends Error {
  constructor(
    message: string,
    public readonly code: QrValidationCode,
  ) {
    super(message);
    this.name = "QrValidationError";
  }
}

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR is not configured");
  }
  return dir.replace(/\/+$/, "");
}

function parseStoragePath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectUrl(
  path: string,
  method: "GET",
  ttlSeconds: number,
): Promise<string> {
  const { bucketName, objectName } = parseStoragePath(path);
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSeconds * 1_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Object storage signing failed with status ${response.status}`);
  }

  const body = (await response.json()) as { signed_url?: unknown };
  if (typeof body.signed_url !== "string" || !body.signed_url) {
    throw new Error("Object storage did not return a signed URL");
  }
  return body.signed_url;
}

function objectEntityToStoragePath(objectPath: string): string {
  if (!OBJECT_PATH_RE.test(objectPath)) {
    throw new Error("Invalid QR object path");
  }
  return `${getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
}

export function isStoredQrObjectPath(value: string): boolean {
  return OBJECT_PATH_RE.test(value);
}

export function createStoredQrObjectPath(): string {
  return `/objects/company-wallet-qr/${randomUUID()}.png`;
}

export async function uploadQrObject(objectPath: string, bytes: Buffer): Promise<void> {
  if (!isStoredQrObjectPath(objectPath)) {
    throw new Error("Invalid QR object path");
  }
  if (bytes.length === 0 || bytes.length > QR_MAX_BYTES) {
    throw new Error("QR image is empty or exceeds the 2 MB limit");
  }

  const storagePath = `${getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
  const { bucketName, objectName } = parseStoragePath(storagePath);
  await objectStorageClient.bucket(bucketName).file(objectName).save(bytes, {
    resumable: false,
    contentType: QR_CONTENT_TYPE,
    validation: "md5",
  });
}

function decodeQrAddress(bytes: Buffer): string {
  if (bytes.length === 0 || bytes.length > QR_MAX_BYTES) {
    throw new QrValidationError(
      "QR image is empty or exceeds the 2 MB limit",
      "INVALID_PNG",
    );
  }

  let png: PNG;
  try {
    png = PNG.sync.read(bytes);
  } catch {
    throw new QrValidationError("The selected file is not a valid PNG.", "INVALID_PNG");
  }

  const decoded = jsQR(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height,
    { inversionAttempts: "attemptBoth" },
  );
  const payload = decoded?.data?.trim() ?? "";
  const address = payload.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (!address || !BEP20_ADDRESS_RE.test(address)) {
    throw new QrValidationError(
      "Could not read a QR code from this image.",
      "QR_NOT_FOUND",
    );
  }
  return address;
}

export function validateQrBytes(bytes: Buffer, walletAddress: string): void {
  const decodedAddress = decodeQrAddress(bytes);
  if (decodedAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new QrValidationError(
      "QR address does not match the wallet address.",
      "QR_ADDRESS_MISMATCH",
    );
  }
}

export async function getQrReadUrl(objectPath: string): Promise<string | null> {
  if (objectPath === LEGACY_QR_OBJECT_PATH) return null;
  return signObjectUrl(objectEntityToStoragePath(objectPath), "GET", 15 * 60);
}

export async function verifyQrMatchesAddress(
  objectPath: string,
  walletAddress: string,
): Promise<void> {
  if (objectPath === LEGACY_QR_OBJECT_PATH) {
    return;
  }

  const readUrl = await getQrReadUrl(objectPath);
  if (!readUrl) {
    throw new QrValidationError("QR image could not be read from object storage.", "QR_OBJECT_READ_FAILED");
  }
  try {
    const response = await fetch(readUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`object storage returned ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    validateQrBytes(bytes, walletAddress);
  } catch (error) {
    if (error instanceof QrValidationError) throw error;
    throw new QrValidationError(
      "QR image could not be read from object storage.",
      "QR_OBJECT_READ_FAILED",
    );
  }
}