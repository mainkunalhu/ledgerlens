import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z
    .string()
    .default("postgresql://ledger:ledgerpw@localhost:5432/ledgerlens"),
  WORKER_URL: z.string().default("http://localhost:8000"),
  GROQ_API_KEY: z.string().default(""),
  GROQ_VISION_MODEL: z.string().default("qwen/qwen3.8-27b"),
  GROQ_STRUCTURE_MODEL: z.string().default("openai/gpt-oss-120b"),
  STORAGE_DIR: z.string().default("./uploads"),
  MAX_IMAGE_MB: z.coerce.number().default(20),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse({
    PORT: process.env.API_PORT ?? process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    WORKER_URL: process.env.WORKER_URL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL,
    GROQ_STRUCTURE_MODEL: process.env.GROQ_STRUCTURE_MODEL,
    STORAGE_DIR: process.env.STORAGE_DIR,
    MAX_IMAGE_MB: process.env.MAX_IMAGE_MB,
  });
}
