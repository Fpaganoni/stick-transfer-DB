import 'dotenv/config';
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { getAllowedOrigins } from "./common/cors";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy / PaaS load balancer, req.ip is the proxy's IP unless
  // Express is told to trust X-Forwarded-For. Without this, the per-IP throttler
  // would treat ALL users as one client. TRUST_PROXY = number of proxy hops
  // (usually 1). Leave unset when exposed directly (local dev).
  const trustProxyHops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  // Global Exception Filter (Logger & Sanitizer)
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(bodyParser.json({ limit: "2mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());

  // Enable CORS for frontend dynamically (same allow-list as the websocket gateway)
  app.enableCors({
    origin: getAllowedOrigins(),
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
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}/graphql`);
}
bootstrap();
