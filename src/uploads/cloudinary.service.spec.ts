import { CloudinaryService } from "./cloudinary.service";

// Mock cloudinary at module level — prevents any real HTTP calls
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      upload_stream: jest.fn(),
    },
  },
}));

import { v2 as cloudinary } from "cloudinary";

describe("CloudinaryService", () => {
  let service: CloudinaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLOUDINARY_URL = "cloudinary://test:secret@cloud";
    service = new CloudinaryService();
  });

  // ── uploadBase64 ──────────────────────────────────────────────────────────
  describe("uploadBase64", () => {
    it("should call cloudinary upload with base64 string and folder", async () => {
      const mockResult = {
        public_id: "app/abc123",
        secure_url: "https://cdn.com/img.jpg",
      };
      (cloudinary.uploader.upload as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.uploadBase64(
        "data:image/jpeg;base64,abc123==",
        "avatars",
      );

      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
        "data:image/jpeg;base64,abc123==",
        { folder: "avatars" },
      );
      expect(result).toEqual(mockResult);
    });

    it("should use 'app' as default folder", async () => {
      (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({});

      await service.uploadBase64("data:image/png;base64,xyz==");

      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
        expect.any(String),
        { folder: "app" },
      );
    });
  });

  // ── uploadPdf ─────────────────────────────────────────────────────────────
  describe("uploadPdf", () => {
    it("should strip base64 data URI prefix and upload via stream", async () => {
      // Simulate a successful stream upload
      const mockResult = {
        public_id: "cvs/cv123",
        secure_url: "https://cdn.com/cv.pdf",
      };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts, callback) => {
          callback(null, mockResult);
          return { end: jest.fn() };
        },
      );

      const base64WithPrefix = "data:application/pdf;base64,JVBERi0x";
      const result = await service.uploadPdf(base64WithPrefix, "cvs");

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        { folder: "cvs", resource_type: "auto", format: "pdf" },
        expect.any(Function),
      );
      expect(result).toEqual(mockResult);
    });

    it("should reject the promise when cloudinary stream returns an error", async () => {
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts, callback) => {
          callback(new Error("Upload failed: file too large"), null);
          return { end: jest.fn() };
        },
      );

      await expect(
        service.uploadPdf("data:application/pdf;base64,JVBERi0x", "cvs"),
      ).rejects.toThrow("Upload failed: file too large");
    });

    it("should strip various PDF MIME type prefixes before decoding", async () => {
      // Some browsers send 'data:application/octet-stream;base64,...' for PDFs
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts, callback) => {
          callback(null, { public_id: "test" });
          return { end: jest.fn() };
        },
      );

      // Should not throw — regex must handle alternate MIME types
      await expect(
        service.uploadPdf(
          "data:application/octet-stream;base64,JVBERi0x",
          "cvs",
        ),
      ).resolves.toBeDefined();
    });
  });
});
