import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

export const LEGACY_QR_OBJECT_PATH = "/legacy/deposit-wallet-qr";
export const QR_CONTENT_TYPE = "image/png";
export const QR_MAX_BYTES = 2 * 1024 * 1024;

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const OBJECT_PATH_RE = /^\/objects\/company-wallet-qr\/[a-zA-Z0-9-]+\.png$/;
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

/**
 * Reads the private QR object through the API server. The browser should not
 * receive a direct GCS URL: private signed URLs can fail in the proxied app
 * preview and make the same image unreliable across dashboards.
 */
export async function downloadQrObject(objectPath: string): Promise<Buffer> {
  const storagePath = objectEntityToStoragePath(objectPath);
  const { bucketName, objectName } = parseStoragePath(storagePath);
  const [bytes] = await objectStorageClient.bucket(bucketName).file(objectName).download();
  if (bytes.length === 0 || bytes.length > QR_MAX_BYTES) {
    throw new Error("Stored QR image is empty or exceeds the 2 MB limit");
  }
  return bytes;
}