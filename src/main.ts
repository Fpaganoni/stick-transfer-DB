import 'dotenv/config';
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as bodyParser from "body-parser";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global Exception Filter (Logger & Sanitizer)
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(bodyParser.json({ limit: "2mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "2mb" }));

  // Enable CORS for frontend dynamically
  const allowedOrigins = process.env.FRONTEND_URL 
    ? [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"]
    : ["http://localhost:3000", "http://localhost:3001"];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades que no estén en el DTO
      forbidNonWhitelisted: true, // Lanza error si envían propiedades no deseadas
      transform: true, // Transforma los payloads a los tipos del DTO
    }),
  );
  await app.listen(4000);
  console.log("Server running on http://localhost:4000/graphql");
}
bootstrap();
