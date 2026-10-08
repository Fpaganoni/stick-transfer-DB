import { Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";
import {
  IMAGE_UPLOAD_TARGETS,
  ImageUploadTarget,
  ownerImageFolder,
} from "./image-url";

export interface ImageUploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

@Injectable()
export class CloudinaryService {
  constructor() {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config({ secure: true });
    }
  }

  /**
   * Signs a direct browser -> Cloudinary image upload. The signature covers
   * EXACTLY these parameters, and the client must send exactly these (plus
   * file, api_key and signature) and nothing else:
   *
   *   timestamp, public_id, overwrite=true, invalidate=true,
   *   allowed_formats=jpg,png,webp
   *
   * `public_id` is the FULL path (owner folder + name) and `folder` is NOT
   * signed nor sent: with Cloudinary dynamic folders `folder` is not prepended
   * to the public id, so a bare "avatar" would be shared by every tenant and
   * `overwrite` would let one user replace another's image. The returned
   * `folder` is informational only.
   *
   * If the client sends an extra or different parameter, Cloudinary rejects
   * the upload with "Invalid Signature". The api secret never leaves the back.
   */
  signImageUpload(target: ImageUploadTarget, ownerId: string): ImageUploadSignature {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    if (!cloud_name || !api_key || !api_secret) {
      throw new Error("Cloudinary is not configured");
    }

    const { owner, publicId: name } = IMAGE_UPLOAD_TARGETS[target];
    const folder = ownerImageFolder(owner, ownerId);
    const publicId = `${folder}/${name}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        allowed_formats: "jpg,png,webp",
      },
      api_secret,
    );

    return {
      cloudName: cloud_name,
      apiKey: api_key,
      timestamp,
      signature,
      folder,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
    };
  }

  async uploadBase64(base64: string, folder = "app") {
    const result = await cloudinary.uploader.upload(base64, { folder });
    return result;
  }

  async uploadPdf(base64: string, folder = "cvs") {
    const base64Data = base64.replace(
      /^data:application\/[a-zA-Z0-9.-]+;base64,/,
      "",
    );
    const buffer = Buffer.from(base64Data, "base64");

    return new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "auto", format: "pdf" },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );
      stream.end(buffer);
    });
  }
}
