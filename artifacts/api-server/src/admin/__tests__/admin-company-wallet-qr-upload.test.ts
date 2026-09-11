import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseCompanyWalletQrUpload } from "../admin-company-wallet-qr-upload";

const boundary = "wallet-upload-test";
const address = "0x543780EF4cda835F3541A1BdB305f4119f658BDb";

function multipartBody(): Buffer {
  return Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="walletAddress"',
    "",
    address,
    `--${boundary}`,
    'Content-Disposition: form-data; name="clientMetadata"',
    "",
    "browser-added-metadata",
    `--${boundary}`,
    'Content-Disposition: form-data; name="qrImage"; filename="Deposit QR 2.png"',
    "Content-Type: image/png",
    "",
    "not-an-actual-png-but-content-is-not-inspected",
    `--${boundary}--`,
    "",
  ].join("\r\n"));
}

describe("company wallet QR multipart upload parser", () => {
  it("accepts an extra multipart field without triggering a parts-limit failure", async () => {
    const request = Readable.from(multipartBody()) as Readable & {
      headers: Record<string, string>;
    };
    request.headers = {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    };

    await expect(parseCompanyWalletQrUpload(request as never)).resolves.toMatchObject({
      walletAddress: address,
      fileName: "Deposit QR 2.png",
      contentType: "image/png",
      bytes: Buffer.from("not-an-actual-png-but-content-is-not-inspected"),
    });
  });
});