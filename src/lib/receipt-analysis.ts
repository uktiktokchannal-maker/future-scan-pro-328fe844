const ANALYZE_RECEIPT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-receipt`;
const ANALYSIS_TIMEOUT_MS = 6500;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface AnalyzeReceiptResponse {
  receipt_number?: string;
  client_name?: string;
  date?: string;
  total_area?: number;
  total_commission?: number;
  analysis_path?: string;
  notes?: string;
  error?: string;
  items?: Array<{
    description?: string;
    area_m2?: number;
    quantity?: number;
    total_area_m2?: number;
  }>;
}

export const analyzeReceiptImage = async (imageBase64: string): Promise<AnalyzeReceiptResponse> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    if (!imageBase64) {
      throw new Error("لم يتم إرسال صورة الإيصال للتحليل");
    }

    const response = await fetch(ANALYZE_RECEIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({ error: "تعذر قراءة نتيجة التحليل" }));

    if (!response.ok) {
      throw new Error((payload as { error?: string }).error || "تعذر تحليل الإيصال");
    }

    if ((payload as { error?: string }).error) {
      throw new Error((payload as { error: string }).error);
    }

    return payload as AnalyzeReceiptResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("انتهت مهلة التحليل، أعد تصوير الإيصال بإضاءة أوضح.");
    }

    throw error instanceof Error ? error : new Error("تعذر تحليل الإيصال");
  } finally {
    window.clearTimeout(timeoutId);
  }
};