import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const systemPrompt = `أنت محاسب سوداني متخصص في تحليل إيصالات المطابع. مهمتك هي تحليل صورة الإيصال واستخراج البيانات التالية بدقة.

قواعد الحساب:
- العمولة = إجمالي الأمتار × 300 جنيه سوداني لكل متر مربع
- إذا كان المجموع الكلي مكتوباً بخط اليد، اقرأه مباشرة
- إذا كان هناك جدول قياسات (عرض × طول)، احسب مساحة كل صف واجمعها

استخرج البيانات التالية وأعدها بالضبط بهذا التنسيق.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}` },
              },
              {
                type: "text",
                text: "حلل هذا الإيصال واستخرج البيانات.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description: "Extract structured data from a printing receipt image",
              parameters: {
                type: "object",
                properties: {
                  receipt_number: { type: "string", description: "رقم الإيصال أو الفاتورة" },
                  client_name: { type: "string", description: "اسم العميل" },
                  date: { type: "string", description: "تاريخ الإيصال بصيغة YYYY-MM-DD" },
                  items: {
                    type: "array",
                    description: "بنود الطباعة",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        width: { type: "number", description: "العرض بالمتر" },
                        height: { type: "number", description: "الطول بالمتر" },
                        area: { type: "number", description: "المساحة بالمتر المربع" },
                        quantity: { type: "number", description: "الكمية" },
                      },
                      required: ["area"],
                    },
                  },
                  total_area: { type: "number", description: "إجمالي الأمتار المربعة" },
                  commission_rate: { type: "number", description: "سعر العمولة لكل متر = 300" },
                  total_commission: { type: "number", description: "إجمالي العمولة = total_area × 300" },
                },
                required: ["receipt_number", "total_area", "total_commission"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لحسابك" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "خطأ في تحليل الصورة" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "لم يتمكن الذكاء الاصطناعي من قراءة الإيصال" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const receiptData = JSON.parse(toolCall.function.arguments);
    
    if (receiptData.total_area && !receiptData.total_commission) {
      receiptData.total_commission = receiptData.total_area * 300;
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
