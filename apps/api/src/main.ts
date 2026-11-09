import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule, configureApp } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
