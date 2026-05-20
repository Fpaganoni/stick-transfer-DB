import { Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

@Injectable()
export class CloudinaryService {
  constructor() {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config({ secure: true });
    }
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
