import { z } from "zod";

// Normalized bbox: 0-1000 coordinates, source of truth across web/api/worker.
export const bboxSchema = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  w: z.number().min(0).max(1000),
  h: z.number().min(0).max(1000),
});
export type BBox = z.infer<typeof bboxSchema>;

export const fieldSchema = z.object({
  key: z.string(),
  value: z.string(),
  bbox: bboxSchema.optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["ocr", "vision", "fusion"]),
});
export type Field = z.infer<typeof fieldSchema>;

export const lineItemSchema = z.object({
  desc: z.string(),
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

export const qaResponseSchema = z.object({
  answer: z.string(),
  value: z.string().optional(),
  citations: z.array(
    z.object({ key: z.string(), bbox: bboxSchema, label: z.string() }),
  ),
  verified: z.boolean().default(false),
});
export type QAResponse = z.infer<typeof qaResponseSchema>;
