import { Module, Global } from "@nestjs/common";
import { CloudinaryService } from "./cloudinary.service";
import { S3Service } from "./s3.service";

@Global()
@Module({
  providers: [CloudinaryService, S3Service],
  exports: [CloudinaryService, S3Service],
})
export class UploadsModule {}
