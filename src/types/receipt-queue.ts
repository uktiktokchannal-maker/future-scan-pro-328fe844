export interface ReceiptItem {
  description?: string;
  area_m2?: number;
  quantity?: number;
  total_area_m2?: number;
}

export interface ReceiptData {
  receiptNumber: string;
  clientName: string;
  date: string;
  totalArea: number;
  commission: number;
  analysisPath?: string;
  notes?: string;
  items?: ReceiptItem[];
}

export type QueueStatus = "queued" | "analyzing" | "ready" | "saving" | "done" | "error" | "duplicate";

export interface QueueItem {
  id: string;
  imageData: string;
  status: QueueStatus;
  createdAt: number;
  receiptData?: ReceiptData;
  error?: string;
}