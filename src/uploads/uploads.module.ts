import { Module, Global } from "@nestjs/common";
import { CloudinaryService } from "./cloudinary.service";
import { S3Service } from "./s3.service";
import { UploadsResolver } from "./uploads.resolver";
import { AuthModule } from "../auth/auth.module";

@Global()
@Module({
  imports: [AuthModule],
  providers: [CloudinaryService, S3Service, UploadsResolver],
  exports: [CloudinaryService, S3Service],
})
export class UploadsModule {}
