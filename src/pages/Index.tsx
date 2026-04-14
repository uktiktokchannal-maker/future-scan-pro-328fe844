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
import type { QueueItem, ReceiptData } from "@/types/receipt-queue";

const IMAGE_UPLOAD_TIMEOUT_MS = 20_000;
const RECEIPT_INSERT_TIMEOUT_MS = 15_000;
const CLEANUP_AFTER_MS = 15_000;

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });

const Index = () => {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"scanner" | "wallet" | "profile">("scanner");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const processingRunRef = useRef<string | null>(null);

  const selectedQueueItem = selectedId ? queue.find(item => item.id === selectedId) ?? null : null;
  const hasBlockingQueueItem = queue.some(item => ["analyzing", "ready", "saving"].includes(item.status));

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    console.log("[Index] 📝 updateItem:", id, "→", JSON.stringify(updates).slice(0, 200));
    setQueue(q => q.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (!queue.some(item => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [queue, selectedId]);

  useEffect(() => {
    if (!user || processingId || hasBlockingQueueItem) return;

    const nextItem = queue.find(item => item.status === "queued");
    if (!nextItem) return;

    console.log("[Index] ▶ START processing:", nextItem.id, "queue size:", queue.length);
    updateItem(nextItem.id, { status: "analyzing", error: undefined });
    setSelectedId(nextItem.id);
    setProcessingId(nextItem.id);
  }, [hasBlockingQueueItem, processingId, queue, updateItem, user]);

  useEffect(() => {
    if (!processingId || processingRunRef.current === processingId) return;

    const currentItem = queue.find(item => item.id === processingId);
    if (!currentItem || currentItem.status !== "analyzing") return;

    processingRunRef.current = processingId;
    let cancelled = false;

    const runAnalysis = async () => {
      try {
        console.log("[Index] 📤 Calling analyzeReceiptImage for:", processingId);
        const data = await analyzeReceiptImage(currentItem.imageData);
        if (cancelled) return;

        console.log("[Index] ✅ Analysis returned:", JSON.stringify(data).slice(0, 400));

        if ((!data.receipt_number || data.receipt_number === "N/A") && Number(data.total_area ?? 0) === 0) {
          const errMsg = data.notes || "تعذر قراءة الإيصال بوضوح، أعد التصوير بإضاءة أفضل.";
          updateItem(processingId, { status: "error", error: errMsg });
          toast.error(errMsg);
          return;
        }

        const receiptData: ReceiptData = {
          receiptNumber: data.receipt_number || `RC-${Date.now()}`,
          clientName: data.client_name || "غير محدد",
          date: data.date || new Date().toLocaleDateString("ar-SD"),
          totalArea: Number(data.total_area || 0),
          commission: Number(data.total_commission || 0),
          analysisPath: data.analysis_path,
          notes: data.notes,
          items: data.items,
        };

        updateItem(processingId, { status: "ready", receiptData, error: undefined });
        setSelectedId(processingId);

        if (navigator.vibrate) navigator.vibrate(100);
        toast.success(`تم تحليل الإيصال: ${receiptData.totalArea} م²`);
      } catch (error) {
        if (cancelled) return;
        console.error("[Index] ❌ Processing error:", error);
        const errMsg = error instanceof Error ? error.message : "حدث خطأ أثناء المعالجة";
        updateItem(processingId, { status: "error", error: errMsg });
        toast.error(errMsg);
      } finally {
        if (!cancelled) {
          console.log("[Index] ■ DONE processing:", processingId);
          processingRunRef.current = null;
          setProcessingId(current => current === processingId ? null : current);
        }
      }
    };

    void runAnalysis();

    return () => {
      cancelled = true;
    };
  }, [processingId, queue, updateItem]);

  const handleCapture = useCallback((imageData: string) => {
    console.log("[Index] 📸 Captured image, length:", imageData.length);
    const createdAt = Date.now();
    const newItem: QueueItem = {
      id: `q-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt,
      imageData,
      status: "queued",
    };
    setQueue(prev => [...prev, newItem]);
    setSelectedId(current => current ?? newItem.id);
  }, []);

  const handleReviewItem = useCallback((item: QueueItem) => {
    setSelectedId(item.id);
  }, []);

  const handleManualConfirm = useCallback(async (data: ReceiptData) => {
    if (!user || !selectedQueueItem) return;

    const itemId = selectedQueueItem.id;
    const imageData = selectedQueueItem.imageData;
    console.log("[Index] 💾 Saving receipt:", data.receiptNumber);
    updateItem(itemId, { status: "saving", receiptData: data, error: undefined });

    try {
      let imageUrl: string | null = null;
      const fileName = `${user.id}/${data.receiptNumber}-${Date.now()}.jpg`;
      const base64Data = imageData.includes(",") ? imageData.split(",")[1] : imageData;

      if (base64Data) {
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j);

        const uploadTask = async () =>
          await supabase.storage.from("receipt-images").upload(fileName, bytes, { contentType: "image/jpeg" });

        const { data: uploadData, error: uploadError } = await withTimeout(
          uploadTask(),
          IMAGE_UPLOAD_TIMEOUT_MS,
          "استغرق رفع صورة الإيصال وقتاً أطول من المتوقع"
        );

        if (uploadError) throw uploadError;

        if (uploadData) {
          const { data: urlData } = supabase.storage.from("receipt-images").getPublicUrl(uploadData.path);
          imageUrl = urlData.publicUrl;
        }
      }

      const insertTask = async () =>
        await supabase.from("receipts").insert({
          receipt_number: data.receiptNumber,
          designer_id: user.id,
          client_name: data.clientName,
          total_area: data.totalArea,
          commission_amount: data.commission,
          image_url: imageUrl,
          receipt_date: new Date().toISOString().split("T")[0],
        });

      const { error } = await withTimeout(
        insertTask(),
        RECEIPT_INSERT_TIMEOUT_MS,
        "استغرق حفظ الإيصال وقتاً أطول من المتوقع"
      );

      if (error) {
        console.error("[Index] ❌ Save error:", error);
        if (error.code === "23505") {
          updateItem(itemId, { status: "duplicate", receiptData: data });
          toast.error("إيصال مكرر!");
        } else {
          updateItem(itemId, { status: "error", error: `خطأ في الحفظ: ${error.message}` });
          toast.error(`خطأ في الحفظ: ${error.message}`);
        }
        return;
      }

      updateItem(itemId, { status: "done", receiptData: data });
      toast.success("تم حفظ الإيصال بنجاح ✅");
      setSelectedId(current => current === itemId ? null : current);
    } catch (err) {
      console.error("[Index] ❌ Save exception:", err);
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ";
      updateItem(itemId, { status: "error", error: msg });
      toast.error(msg);
    }
  }, [selectedQueueItem, updateItem, user]);

  const handleRetry = useCallback(() => {
    if (!selectedId) return;
    console.log("[Index] 🔄 Retrying:", selectedId);
    updateItem(selectedId, { status: "queued", error: undefined, receiptData: undefined });
  }, [selectedId, updateItem]);

  const handleCloseDrawer = useCallback(() => {
    if (selectedQueueItem?.status === "ready" && selectedQueueItem.receiptData) {
      void handleManualConfirm(selectedQueueItem.receiptData);
      return;
    }

    setSelectedId(null);
  }, [handleManualConfirm, selectedQueueItem]);

  // Clean done items after 15s
  useEffect(() => {
    const timer = setInterval(() => {
      setQueue(prev => prev.filter(i => {
        if (i.status === "done" || i.status === "duplicate") {
          return Date.now() - i.createdAt < CLEANUP_AFTER_MS;
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
          onClose={handleCloseDrawer}
          onConfirm={handleManualConfirm}
          onRetry={handleRetry}
          data={selectedQueueItem.receiptData || null}
          isProcessing={selectedQueueItem.status === "queued" || selectedQueueItem.status === "analyzing"}
          isSaving={selectedQueueItem.status === "saving"}
          isDuplicate={selectedQueueItem.status === "duplicate"}
          errorMessage={selectedQueueItem.status === "error" ? (selectedQueueItem.error || "حدث خطأ") : null}
          capturedImage={selectedQueueItem.imageData}
          processingLabel={selectedQueueItem.status === "queued" ? "الطلب في الطابور وسيبدأ التحليل تلقائياً" : "جاري تحليل الإيصال..."}
        />
      )}
    </div>
  );
};

export default Index;
