import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ScannerView from "@/components/ScannerView";
import ReceiptDrawer from "@/components/ReceiptDrawer";
import QueueIndicator from "@/components/QueueIndicator";
import WalletView from "@/components/WalletView";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { analyzeReceiptImage } from "@/lib/receipt-analysis";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

interface ReceiptData {
  receiptNumber: string;
  clientName: string;
  date: string;
  totalArea: number;
  commission: number;
  analysisPath?: string;
  notes?: string;
  items?: Array<{ description?: string; area_m2?: number; quantity?: number; total_area_m2?: number }>;
}

export interface QueueItem {
  id: string;
  imageData: string;
  status: "queued" | "analyzing" | "analyzed" | "saving" | "done" | "error" | "duplicate";
  receiptData?: ReceiptData;
  error?: string;
}

const Index = () => {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"scanner" | "wallet" | "profile">("scanner");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  // Keep queueRef in sync
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const selectedQueueItem = selectedId ? queue.find(item => item.id === selectedId) ?? null : null;

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    console.log("[Index] 📝 updateItem:", id, "→", JSON.stringify(updates).slice(0, 200));
    setQueue(q => q.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  // Process queue items one at a time
  const processNextItem = useCallback(async () => {
    if (processingRef.current || !user) return;

    const nextItem = queueRef.current.find(i => i.status === "queued");
    if (!nextItem) return;

    processingRef.current = true;
    const itemId = nextItem.id;
    const imageData = nextItem.imageData;
    console.log("[Index] ▶ START processing:", itemId, "image length:", imageData.length);

    // Update to analyzing immediately
    updateItem(itemId, { status: "analyzing" });
    setSelectedId(itemId);

    try {
      // ---- STEP 1: Call AI analysis ----
      console.log("[Index] 📤 Calling analyzeReceiptImage...");
      const data = await analyzeReceiptImage(imageData);
      console.log("[Index] ✅ Analysis returned:", JSON.stringify(data).slice(0, 400));

      // Check if unreadable
      if ((!data.receipt_number || data.receipt_number === "N/A") && Number(data.total_area ?? 0) === 0) {
        const errMsg = data.notes || "تعذر قراءة الإيصال بوضوح، أعد التصوير بإضاءة أفضل.";
        updateItem(itemId, { status: "error", error: errMsg });
        toast.error(errMsg);
        return;
      }

      // Build receipt data
      const receiptData: ReceiptData = {
        receiptNumber: data.receipt_number || `RC-${Date.now()}`,
        clientName: data.client_name || "غير محدد",
        date: data.date || new Date().toLocaleDateString("ar-SD"),
        totalArea: data.total_area || 0,
        commission: data.total_commission || 0,
        analysisPath: data.analysis_path,
        notes: data.notes,
        items: data.items,
      };

      // ---- STEP 2: Show results IMMEDIATELY ----
      console.log("[Index] ✅ Showing results NOW:", receiptData.receiptNumber);
      updateItem(itemId, { status: "analyzed", receiptData });
      if (navigator.vibrate) navigator.vibrate(100);
      toast.success(`تم تحليل الإيصال: ${receiptData.totalArea} م²`);

      // ---- STEP 3: Non-blocking duplicate check (just warn, don't block) ----
      if (data.receipt_number) {
        try {
          const { data: existing } = await supabase
            .from("receipts")
            .select("id")
            .eq("receipt_number", data.receipt_number)
            .maybeSingle();
          if (existing) {
            console.warn("[Index] ⚠ Duplicate found:", data.receipt_number);
            updateItem(itemId, { status: "duplicate", receiptData });
            toast.error(`إيصال مكرر: ${data.receipt_number}`);
          }
        } catch (dupErr) {
          console.warn("[Index] ⚠ Duplicate check failed (ignoring):", dupErr);
          // Don't change status - keep showing results
        }
      }
    } catch (e) {
      console.error("[Index] ❌ Processing error:", e);
      const errMsg = e instanceof Error ? e.message : "حدث خطأ أثناء المعالجة";
      updateItem(itemId, { status: "error", error: errMsg });
      toast.error(errMsg);
    } finally {
      processingRef.current = false;
      console.log("[Index] ■ DONE processing:", itemId);
      // Check for more items
      setTimeout(() => {
        if (queueRef.current.some(i => i.status === "queued")) {
          processNextItem();
        }
      }, 200);
    }
  }, [user, updateItem]);

  // Trigger processing when queue changes
  useEffect(() => {
    if (queue.some(i => i.status === "queued") && !processingRef.current) {
      const t = setTimeout(processNextItem, 200);
      return () => clearTimeout(t);
    }
  }, [queue, processNextItem]);

  const handleCapture = (imageData: string) => {
    console.log("[Index] 📸 Captured image, length:", imageData.length);
    const newItem: QueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageData,
      status: "queued",
    };
    setQueue(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
  };

  const handleReviewItem = (item: QueueItem) => {
    setSelectedId(item.id);
  };

  const handleManualConfirm = async (data: ReceiptData) => {
    if (!user || !selectedQueueItem) return;

    const itemId = selectedQueueItem.id;
    const imageData = selectedQueueItem.imageData;
    console.log("[Index] 💾 Saving receipt:", data.receiptNumber);
    updateItem(itemId, { status: "saving" });

    try {
      // Upload image
      let imageUrl: string | null = null;
      const fileName = `${user.id}/${data.receiptNumber}-${Date.now()}.jpg`;
      const base64Data = imageData.includes(",") ? imageData.split(",")[1] : imageData;
      if (base64Data) {
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j);

        const { data: uploadData } = await supabase.storage
          .from("receipt-images")
          .upload(fileName, bytes, { contentType: "image/jpeg" });
        if (uploadData) {
          const { data: urlData } = supabase.storage.from("receipt-images").getPublicUrl(uploadData.path);
          imageUrl = urlData.publicUrl;
        }
      }

      // Save to DB
      const { error } = await supabase.from("receipts").insert({
        receipt_number: data.receiptNumber,
        designer_id: user.id,
        client_name: data.clientName,
        total_area: data.totalArea,
        commission_amount: data.commission,
        image_url: imageUrl,
        receipt_date: new Date().toISOString().split("T")[0],
      });

      if (error) {
        console.error("[Index] ❌ Save error:", error);
        if (error.code === "23505") {
          updateItem(itemId, { status: "duplicate" });
          toast.error("إيصال مكرر!");
        } else {
          updateItem(itemId, { status: "error", error: `خطأ في الحفظ: ${error.message}` });
          toast.error(`خطأ في الحفظ: ${error.message}`);
        }
        return;
      }

      updateItem(itemId, { status: "done", receiptData: data });
      toast.success("تم حفظ الإيصال بنجاح ✅");
      setSelectedId(null);
    } catch (err) {
      console.error("[Index] ❌ Save exception:", err);
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ";
      updateItem(itemId, { status: "error", error: msg });
      toast.error(msg);
    }
  };

  const handleRetry = useCallback(() => {
    if (!selectedId) return;
    console.log("[Index] 🔄 Retrying:", selectedId);
    updateItem(selectedId, { status: "queued", error: undefined, receiptData: undefined });
  }, [selectedId, updateItem]);

  // Clean done items after 15s
  useEffect(() => {
    const timer = setInterval(() => {
      setQueue(prev => prev.filter(i => {
        if (i.status === "done" || i.status === "duplicate") {
          const ts = parseInt(i.id.split("-")[1]);
          return Date.now() - ts < 15000;
        }
        return true;
      }));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {activeTab === "scanner" && (
        <>
          <ScannerView onCapture={handleCapture} />
          {queue.length > 0 && (
            <QueueIndicator queue={queue} onReview={handleReviewItem} />
          )}
        </>
      )}
      {activeTab === "wallet" && <WalletView />}
      {activeTab === "profile" && (
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)] px-6">
          <div className="glass-card rounded-3xl p-8 text-center max-w-sm w-full">
            <div className="w-20 h-20 rounded-full gradient-primary mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-primary-foreground">
              {profile?.full_name?.charAt(0) || "م"}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">{profile?.full_name}</h2>
            <p className="text-sm text-muted-foreground mb-2">{profile?.phone}</p>
            <p className="text-sm text-muted-foreground mb-6">مصمم - فيوتشر للطباعة</p>
            <button onClick={signOut}
              className="w-full py-3 rounded-xl glass-card text-muted-foreground font-medium hover:text-foreground transition-colors border border-border flex items-center justify-center gap-2">
              <LogOut className="h-4 w-4" /> تسجيل خروج
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {selectedQueueItem && (
        <ReceiptDrawer
          isOpen={true}
          onClose={() => setSelectedId(null)}
          onConfirm={handleManualConfirm}
          onRetry={handleRetry}
          data={selectedQueueItem.receiptData || null}
          isProcessing={selectedQueueItem.status === "queued" || selectedQueueItem.status === "analyzing"}
          isSaving={selectedQueueItem.status === "saving"}
          isDuplicate={selectedQueueItem.status === "duplicate"}
          errorMessage={selectedQueueItem.status === "error" ? (selectedQueueItem.error || "حدث خطأ") : null}
          capturedImage={selectedQueueItem.imageData}
        />
      )}
    </div>
  );
};

export default Index;
