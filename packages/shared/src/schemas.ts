import { z } from "zod";

// Normalized bbox: 0-1000 coordinates, source of truth across web/api/worker.
export const bboxSchema = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  w: z.number().min(0).max(1000),
  h: z.number().min(0).max(1000),
});
export type BBox = z.infer<typeof bboxSchema>;

export const fieldSourceSchema = z.enum(["ocr", "vision", "fusion"]);
export type FieldSource = z.infer<typeof fieldSourceSchema>;

export const fieldSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string().max(4096),
  bbox: bboxSchema.optional(),
  confidence: z.number().min(0).max(1),
  source: fieldSourceSchema,
});
export type Field = z.infer<typeof fieldSchema>;

export const lineItemSchema = z.object({
  desc: z.string().max(512),
  qty: z.number(),
  rate: z.number(),
  amount: z.number(),
  bbox: bboxSchema.optional(),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const invoiceSchema = z.object({
  vendor: z.string(),
  invoice_no: z.string(),
  date: z.string(),
  line_items: z.array(lineItemSchema),
  subtotal: z.number(),
  gst: z.number(),
  total: z.number(),
  fields: z.array(fieldSchema).default([]),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const documentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "ready",
  "failed",
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  image_path: z.string(),
  original_filename: z.string().nullable(),
  mime: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  status: documentStatusSchema,
  ocr_json: z.unknown().nullable(),
  vision_json: z.unknown().nullable(),
  fused_json: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Document = z.infer<typeof documentSchema>;

export const uploadResponseSchema = z.object({
  id: z.string().uuid(),
  status: documentStatusSchema,
  image_path: z.string(),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const qaRequestSchema = z.object({
  doc_id: z.string().uuid(),
  question: z.string().min(1).max(500),
});
export type QARequest = z.infer<typeof qaRequestSchema>;

export const qaResponseSchema = z.object({
  answer: z.string(),
  value: z.string().optional(),
  citations: z.array(
    z.object({ key: z.string(), bbox: bboxSchema, label: z.string() }),
  ),
  verified: z.boolean().default(false),
});
export type QAResponse = z.infer<typeof qaResponseSchema>;

export const SUPPORTED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
