import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_MODELS = ["google/gemini-3-flash-preview", "openai/gpt-5-mini"] as const;

const isPlaceholderReceiptNumber = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || ["n/a", "na", "0", "0000", "unknown", "غير متوفر"].includes(normalized);
};

const isWeakAnalysis = (receiptData: Record<string, unknown>) => {
  const totalArea = Number(receiptData.total_area ?? 0);
  const notes = String(receiptData.notes ?? "").trim();
  const clientName = String(receiptData.client_name ?? "").trim().toLowerCase();

  return totalArea <= 0 && (
    isPlaceholderReceiptNumber(receiptData.receipt_number) ||
    clientName === "غير متوفر في الصورة" ||
    notes.includes("ليست صورة") ||
    notes.includes("يرجى إرسال صورة الإيصال")
  );
};

const normalizeImagePayload = (value: unknown) => {
  const input = String(value ?? "").trim();
  if (!input) {
    throw new Error("No image provided");
  }

  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  let rawBase64 = (match?.[2] ?? input).replace(/\s/g, "");

  const padding = rawBase64.length % 4;
  if (padding) {
    rawBase64 += "=".repeat(4 - padding);
  }

  try {
    rawBase64 = btoa(atob(rawBase64));
  } catch {
    throw new Error("صيغة صورة الإيصال غير صالحة");
  }

  return {
    dataUrl: `data:${mimeType};base64,${rawBase64}`,
  };
};

const buildAiRequestBody = (model: string, systemPrompt: string, imageDataUrl: string) => ({
  model,
  temperature: 0,
  messages: [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: imageDataUrl },
        },
        {
          type: "text",
          text: "حلل هذا الإيصال واستخرج البيانات بدقة. اذكر أي سيناريو استخدمت (أ، ب، أو ج).",
        },
      ],
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "extract_receipt_data",
        description: "Extract structured data from a Sudanese printing receipt image",
        parameters: {
          type: "object",
          properties: {
            receipt_number: { type: "string", description: "رقم الإيصال أو الفاتورة" },
            client_name: { type: "string", description: "اسم العميل/الزبون" },
            date: { type: "string", description: "تاريخ الإيصال بصيغة YYYY-MM-DD" },
            items: {
              type: "array",
              description: "بنود الطباعة المستخرجة",
              items: {
                type: "object",
                properties: {
                  description: { type: "string", description: "وصف الصنف" },
                  width_cm: { type: "number", description: "العرض بالسنتيمتر كما مكتوب" },
                  height_cm: { type: "number", description: "الطول بالسنتيمتر كما مكتوب" },
                  width_m: { type: "number", description: "العرض بالمتر بعد التحويل" },
                  height_m: { type: "number", description: "الطول بالمتر بعد التحويل" },
                  area_m2: { type: "number", description: "المساحة بالمتر المربع" },
                  quantity: { type: "number", description: "الكمية" },
                  total_area_m2: { type: "number", description: "المساحة الكلية = area_m2 × quantity" },
                },
                required: ["area_m2"],
              },
            },
            total_area: { type: "number", description: "إجمالي الأمتار المربعة" },
            commission_rate: { type: "number", description: "سعر العمولة لكل متر = 300" },
            total_commission: { type: "number", description: "إجمالي العمولة = total_area × 300" },
            analysis_path: { type: "string", enum: ["أ", "ب", "ج"], description: "أي سيناريو تحليل تم استخدامه" },
            notes: { type: "string", description: "ملاحظات حول أرقام غير واضحة أو مشطوبة" },
          },
          required: ["receipt_number", "total_area", "total_commission", "analysis_path"],
        },
      },
    },
  ],
  tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
});

const buildAiErrorResponse = (status: number, errorText: string) => {
  if (status === 429) {
    return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (status === 402) {
    return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لحسابك" }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.error("AI error:", status, errorText);
  return new Response(JSON.stringify({ error: "خطأ في تحليل الصورة" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_base64 } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { dataUrl } = normalizeImagePayload(image_base64);

    const systemPrompt = `أنت "المحاسب الرقمي" لشركة فيوتشر للطباعة والإعلان. دورك هو العمل كشريك مالي للمصمم والمدير، وتحليل إيصالات طلبات الطباعة المكتوبة بخط اليد بدقة بشرية متناهية.

أولاً: الشخصية والمهام
أنت محاسب سوداني خبير، تفهم أن الخط قد يكون متداخلاً وأن المحاسب البشري قد يكتب المقاسات بـ (السنتيمتر) أو (المتر).
مهمتك الأساسية: استخراج إجمالي الأمتار المربعة لكل إيصال لحساب عمولة المصمم (300 ج لكل متر مربع).
يجب أن تكون حذراً جداً؛ الخطأ في رقم واحد يعني ضياع مال أو ظلم موظف.

ثانياً: استراتيجية التحليل الذكي (Multi-Scenario Analysis)
اتبع "أقصر مسار ذكي" للوصول للنتيجة عبر السيناريوهات التالية بالترتيب:

السيناريو أ (المجموع الصريح): ابحث فوراً عن خانة "الأمتار" أو "المجموع". إذا وجدتها مكتوبة بوضوح كقيمة نهائية (مثل: 404,000 ج أو 12 متر)، اعتمدها كمرجع أول.

السيناريو ب (تحليل الجدول): إذا لم يوجد مجموع صريح، قم بتحليل كل سطر (القياس × الكمية).
- إذا وجدت 570x100 وكمية 1 -> احسبها 5.7 × 1 = 5.7 متر مربع.
- إذا وجدت 300x200 وكمية 2 -> احسبها (3 × 2) × 2 = 12 متر مربع.

السيناريو ج (التحقق المتقاطع): إذا وجد المحاسب قد كتب "الأمتار" و "المقاسات"، قم بجمع المقاسات سريعاً وقارنها بالمجموع المكتوب. إذا تطابقا، اعتمد النتيجة. إذا اختلفا، أعطِ الأولوية للمجموع المكتوب يدوياً (لأنه يمثل اتفاق المحاسب مع الزبون).

ثالثاً: القواعد الذهبية
- التحويل: المقاسات في المطابع السودانية غالباً بالسنتيمتر. (100 = 1 متر). حول دائماً للمتر قبل حساب المساحة.
- الكسور: قرب النتائج لأقرب منزلتين عشريتين.
- المنع من التكرار: استخرج "رقم الإيصال" أو "اسم الزبون + التاريخ" لإنشاء بصمة فريدة.
- عدم اليقين: إذا وجدت رقماً مشطوباً أو غير واضح نهائياً، ضع قيمة 0 وأشر إلى ذلك في الملاحظات.`;

    let response: Response | null = null;
    let errorText = "";

    for (const model of AI_MODELS) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAiRequestBody(model, systemPrompt, dataUrl)),
      });

      if (response.ok) {
        break;
      }

      errorText = await response.text();
      const shouldFallback =
        model !== AI_MODELS[AI_MODELS.length - 1] &&
        response.status === 400 &&
        errorText.includes("Base64 decoding failed");

      console.error("AI error:", model, response.status, errorText);

      if (!shouldFallback) {
        return buildAiErrorResponse(response.status, errorText);
      }
    }

    if (!response || !response.ok) {
      return buildAiErrorResponse(response?.status ?? 500, errorText || "Unknown AI error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "لم يتمكن الذكاء الاصطناعي من قراءة الإيصال" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const receiptData = JSON.parse(toolCall.function.arguments);

    const invalidReceipt = isWeakAnalysis(receiptData);

    if (invalidReceipt) {
      return new Response(JSON.stringify({
        error: receiptData.notes || "تعذر قراءة الإيصال بوضوح، أعد تصويره بإضاءة أفضل ومن مسافة أقرب",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Ensure commission is calculated
    if (receiptData.total_area && !receiptData.total_commission) {
      receiptData.total_commission = Math.round(receiptData.total_area * 300 * 100) / 100;
    }
    receiptData.commission_rate = 300;

    return new Response(JSON.stringify(receiptData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
