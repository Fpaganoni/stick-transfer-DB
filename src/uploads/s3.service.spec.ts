import { S3Service } from "./s3.service";

// Mock AWS SDK modules — never hit the network
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://presigned.s3.amazonaws.com/uploads/uuid.jpg?sig=abc"),
}));

jest.mock("uuid", () => ({
  v4: jest.fn().mockReturnValue("fixed-uuid-1234"),
}));

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("S3Service", () => {
  let service: S3Service;

  beforeEach(() => {
    process.env.AWS_S3_BUCKET = "test-hockey-bucket";
    process.env.AWS_REGION = "eu-west-1";
    service = new S3Service();
    jest.clearAllMocks();
  });

  // ── uploadBuffer ──────────────────────────────────────────────────────────
  describe("uploadBuffer", () => {
    it("should upload buffer and return the S3 key", async () => {
      const buffer = Buffer.from("fake-image-data");

      const result = await service.uploadBuffer(buffer, "avatars");

      expect(result).toBe("avatars/fixed-uuid-1234");
      // Verifies PutObjectCommand was constructed with correct Bucket and Key
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: "test-hockey-bucket",
          Key: "avatars/fixed-uuid-1234",
          Body: buffer,
        })
      );
    });

    it("should use 'uploads' as default key prefix", async () => {
      await service.uploadBuffer(Buffer.from("data"));

      const callArg = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
      expect(callArg.Key).toBe("uploads/fixed-uuid-1234");
    });
  });

  // ── getPresignedUrl ───────────────────────────────────────────────────────
  describe("getPresignedUrl", () => {
    it("should return uploadUrl and finalUrl with correct structure", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue("https://signed-url.example.com");

      const result = await service.getPresignedUrl("photo.jpg", "image/jpeg", "profiles");

      expect(result.uploadUrl).toBe("https://signed-url.example.com");
      // finalUrl must point to the correct S3 region and bucket
      expect(result.finalUrl).toBe(
        "https://test-hockey-bucket.s3.eu-west-1.amazonaws.com/profiles/fixed-uuid-1234.jpg"
      );
    });

    it("should extract file extension correctly from filename", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue("https://signed.url");

      await service.getPresignedUrl("my-cv-document.pdf", "application/pdf", "cvs");

      // Key must end with .pdf — extension extraction from complex filenames
      const commandArg = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
      expect(commandArg.Key).toMatch(/\.pdf$/);
    });

    it("should pass ContentType to the PutObjectCommand", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue("https://x");

      await service.getPresignedUrl("video.mp4", "video/mp4");

      const commandArg = (PutObjectCommand as unknown as jest.Mock).mock.calls[0][0];
      expect(commandArg.ContentType).toBe("video/mp4");
    });

    it("should pass expiresIn to getSignedUrl", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue("https://x");

      await service.getPresignedUrl("img.jpg", "image/jpeg", "uploads", 300);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 }
      );
    });
  });
});
