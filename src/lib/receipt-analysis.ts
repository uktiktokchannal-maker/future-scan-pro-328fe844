import { supabase } from "@/integrations/supabase/client";

const ANALYZE_RECEIPT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-receipt`;
const ANALYSIS_TIMEOUT_MS = 45_000; // 45 seconds
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
    if (!imageBase64) throw new Error("لم يتم إرسال صورة الإيصال للتحليل");
    if (!PUBLISHABLE_KEY) throw new Error("تعذر تهيئة الاتصال بخدمة التحليل");

    // Strip data URL prefix
    let rawBase64 = imageBase64;
    if (rawBase64.includes(",")) rawBase64 = rawBase64.split(",")[1];
    if (!rawBase64 || rawBase64.length < 100) throw new Error("الصورة فارغة أو تالفة، أعد التصوير");

    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token || PUBLISHABLE_KEY;

    console.log("[receipt-analysis] Sending to analyze-receipt, base64 length:", rawBase64.length);
    const startTime = Date.now();

    const response = await fetch(ANALYZE_RECEIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ image_base64: rawBase64 }),
      signal: controller.signal,
    });

    const elapsed = Date.now() - startTime;
    console.log("[receipt-analysis] Response in", elapsed, "ms, status:", response.status);

    const payload = await response.json().catch(() => ({ error: "تعذر قراءة نتيجة التحليل" }));
    console.log("[receipt-analysis] Payload:", JSON.stringify(payload).slice(0, 400));

    if (!response.ok) throw new Error((payload as any).error || `خطأ من الخادم: ${response.status}`);
    if ((payload as any).error) throw new Error((payload as any).error);

    return payload as AnalyzeReceiptResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("استغرق التحليل وقتاً أطول من المتوقع (45 ثانية)، حاول بصورة أوضح.");
    }
    throw error instanceof Error ? error : new Error("تعذر تحليل الإيصال");
  } finally {
    window.clearTimeout(timeoutId);
  }
};
