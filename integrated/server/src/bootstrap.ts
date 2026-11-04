/**
 * Membuat aplikasi Nest dari konfigurasi. Dipakai `main.ts` (proses nyata), tes, dan demo.
 */
import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import type { AppConfig } from "./config/config.js";

export async function createApp(config: AppConfig, opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: opts.logger === false ? false : ["log", "warn", "error"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: config.corsOrigin.split(",").map((s) => s.trim()), credentials: false });

  const doc = new DocumentBuilder()
    .setTitle("DecPub terintegrasi")
    .setDescription(
      "Backend publikasi ilmiah triple-blind. P01-P04 (M3). Simulasi: ZK, storage publik, plagiarisme. " +
        "Auth: POST /auth/login lalu tombol Authorize.",
    )
    .setVersion("0.3.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api", app, () => SwaggerModule.createDocument(app, doc));
  return app;
}
