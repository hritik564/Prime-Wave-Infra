import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";

const decodeMock = vi.hoisted(() => vi.fn());
vi.mock("jsqr", () => ({ default: decodeMock }));

import { QrValidationError, validateQrBytes } from "../company-wallet-qr";

const address = "0x1111111111111111111111111111111111111111";

function validPng(): Buffer {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  return PNG.sync.write(png);
}

describe("company wallet QR validation", () => {
  it("rejects invalid PNG bytes", () => {
    expect(() => validateQrBytes(Buffer.from("not-a-png"), address)).toThrowError(
      new QrValidationError("The selected file is not a valid PNG.", "INVALID_PNG"),
    );
  });

  it("accepts a decoded BEP20 address that matches", () => {
    decodeMock.mockReturnValueOnce({ data: address });

    expect(() => validateQrBytes(validPng(), address)).not.toThrow();
  });

  it("rejects a QR/address mismatch", () => {
    decodeMock.mockReturnValueOnce({ data: "0x2222222222222222222222222222222222222222" });

    expect(() => validateQrBytes(validPng(), address)).toThrowError(
      new QrValidationError("QR address does not match the wallet address.", "QR_ADDRESS_MISMATCH"),
    );
  });

  it("rejects an image without a readable QR address", () => {
    decodeMock.mockReturnValueOnce(null);

    expect(() => validateQrBytes(validPng(), address)).toThrowError(
      new QrValidationError("Could not read a QR code from this image.", "QR_NOT_FOUND"),
    );
  });
});