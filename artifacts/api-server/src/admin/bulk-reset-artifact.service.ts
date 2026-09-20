import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ARTIFACT_PATH_RE = /^\/objects\/bulk-password-reset\/[a-zA-Z0-9-]+\.jsonl$/;

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

export interface BulkResetArtifactRecord {
  state: "prepared" | "committed";
  userId: string;
  username: string;
  email: string;
  password: string;
}

export interface BulkResetArtifact {
  version: 1;
  runId: string;
  records: BulkResetArtifactRecord[];
}

export interface BulkResetArtifactStore {
  write(objectPath: string, artifact: BulkResetArtifact): Promise<void>;
  read(objectPath: string): Promise<BulkResetArtifact>;
  delete(objectPath: string): Promise<void>;
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
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

function toStoragePath(objectPath: string): string {
  if (!ARTIFACT_PATH_RE.test(objectPath)) {
    throw new Error("Invalid bulk reset artifact path");
  }
  return `${getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
}

export function createBulkResetArtifactPath(): string {
  return `/objects/bulk-password-reset/${randomUUID()}.jsonl`;
}

export function serializeBulkResetArtifact(artifact: BulkResetArtifact): Buffer {
  return Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8");
}

export function parseBulkResetArtifact(bytes: Buffer): BulkResetArtifact {
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { runId?: unknown }).runId !== "string" ||
    !Array.isArray((parsed as { records?: unknown }).records)
  ) {
    throw new Error("Invalid bulk reset artifact");
  }
  return parsed as BulkResetArtifact;
}

export const productionBulkResetArtifactStore: BulkResetArtifactStore = {
  async write(objectPath, artifact) {
    const { bucketName, objectName } = parseStoragePath(toStoragePath(objectPath));
    await objectStorageClient.bucket(bucketName).file(objectName).save(
      serializeBulkResetArtifact(artifact),
      {
        resumable: false,
        contentType: "application/jsonl",
        validation: "md5",
      },
    );
  },

  async read(objectPath) {
    const { bucketName, objectName } = parseStoragePath(toStoragePath(objectPath));
    const [bytes] = await objectStorageClient.bucket(bucketName).file(objectName).download();
    return parseBulkResetArtifact(bytes);
  },

  async delete(objectPath) {
    const { bucketName, objectName } = parseStoragePath(toStoragePath(objectPath));
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  },
};