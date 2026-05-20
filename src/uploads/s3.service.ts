import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || "";
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async uploadBuffer(buffer: Buffer, keyPrefix = "uploads"): Promise<string> {
    const Key = `${keyPrefix}/${uuidv4()}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key,
      Body: buffer,
    });

    await this.s3Client.send(command);
    return Key;
  }

  async getPresignedUrl(
    fileName: string,
    contentType: string,
    keyPrefix = "uploads",
    expiresIn = 3600,
  ): Promise<{ uploadUrl: string; finalUrl: string }> {
    const extension = fileName.split(".").pop() || "";
    const uniqueFileName = `${uuidv4()}.${extension}`;
    const key = `${keyPrefix}/${uniqueFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    const finalUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

    return { uploadUrl, finalUrl };
  }
}
