import type {
  BBox,
  Document,
  Field,
  LineItem,
  QAResponse,
  UploadResponse,
} from "@ledgerlens/shared";

export type { BBox, Document, Field, LineItem, QAResponse, UploadResponse };

export interface DocumentDetail {
  id: string;
  image_path: string;
  original_filename: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  status: string;
  ocr_json: unknown;
  vision_json: Record<string, unknown> | null;
  fused_json: {
    fields?: unknown[];
    checks?: {
      key: string;
      vision_value: string;
      ocr_value: string | null;
      agree: boolean;
      ocr_support: boolean;
      note: string;
    }[];
    ocr_support_rate?: number;
    layout?: {
      zones: { kind: string; bbox: BBox; confidence: number }[];
      table_bbox: BBox;
      method: string;
    };
  } | null;
  created_at: string;
  updated_at: string;
  fields: {
    id: string;
    key: string;
    value: string;
    bbox: BBox | null;
    confidence: number;
    source: string;
  }[];
}

export interface OverlayBox {
  id: string;
  key: string;
  label: string;
  bbox: BBox;
  color: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  value?: string;
  citations?: { key: string; bbox: BBox; label: string }[];
  verified?: boolean;
}
