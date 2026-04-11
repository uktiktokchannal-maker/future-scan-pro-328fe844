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
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const selectedQueueItem = selectedItem ? queue.find(item => item.id === selectedItem.id) ?? null : null;

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueue(q => q.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const processNextItem = useCallback(async () => {
    if (processingRef.current || !user) return;

    const nextItem = queueRef.current.find(i => i.status === "queued");
    if (!nextItem) return;

    processingRef.current = true;
    const itemId = nextItem.id;

    try {
      setSelectedItem(nextItem);
      updateItem(itemId, { status: "analyzing" });

      const data = await analyzeReceiptImage(nextItem.imageData);

      const isUnreadableReceipt =
        (!data.receipt_number || data.receipt_number === "N/A") && Number(data.total_area ?? 0) === 0;

      if (isUnreadableReceipt) {
        const errMsg = data.notes || "تعذر قراءة الإيصال بوضوح، أعد التصوير بإضاءة أفضل.";
        updateItem(itemId, { status: "error", error: errMsg });
        setSelectedItem(current => current?.id === itemId ? { ...current, status: "error", error: errMsg } : current);
        toast.error(errMsg);
        processingRef.current = false;
        return;
      }

      // Check duplicate
      if (data.receipt_number) {
        const { data: existing } = await supabase
          .from("receipts")
          .select("id")
          .eq("receipt_number", data.receipt_number)
          .maybeSingle();

        if (existing) {
          updateItem(itemId, { status: "duplicate" });
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          toast.error(`إيصال مكرر: ${data.receipt_number}`);
          processingRef.current = false;
          return;
        }
      }

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

      updateItem(itemId, { status: "analyzed", receiptData });
      if (navigator.vibrate) navigator.vibrate(100);

      // Auto-save
      updateItem(itemId, { status: "saving" });

      let imageUrl = null;
      const fileName = `${user.id}/${receiptData.receiptNumber}-${Date.now()}.jpg`;
      const base64Data = nextItem.imageData.split(",")[1];
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

      const { error: insertError } = await supabase.from("receipts").insert({
        receipt_number: receiptData.receiptNumber,
        designer_id: user.id,
        client_name: receiptData.clientName,
        total_area: receiptData.totalArea,
        commission_amount: receiptData.commission,
        image_url: imageUrl,
        receipt_date: new Date().toISOString().split("T")[0],
      });

      if (insertError) {
        if (insertError.code === "23505") {
          updateItem(itemId, { status: "duplicate" });
          toast.error("إيصال مكرر!");
        } else {
          updateItem(itemId, { status: "error", error: "خطأ في الحفظ" });
          setSelectedItem(current => current?.id === itemId ? { ...current, status: "error", error: "خطأ في الحفظ" } : current);
          toast.error("خطأ في حفظ الإيصال");
        }
      } else {
        updateItem(itemId, { status: "done", receiptData });
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        toast.success(`✅ تم حفظ إيصال ${receiptData.receiptNumber}`);
      }
    } catch (e) {
      console.error("Processing error:", e);
      const errMsg = e instanceof Error ? e.message : "حدث خطأ أثناء المعالجة";
      updateItem(itemId, { status: "error", error: errMsg });
      setSelectedItem(current => current?.id === itemId ? { ...current, status: "error", error: errMsg } : current);
      toast.error(errMsg);
    }
    processingRef.current = false;
  }, [user, updateItem]);

  // Trigger processing when queue changes
  useEffect(() => {
    const hasQueued = queue.some(i => i.status === "queued");
    if (hasQueued && !processingRef.current) {
      const timer = setTimeout(processNextItem, 200);
      return () => clearTimeout(timer);
    }
  }, [queue, processNextItem]);

  const handleCapture = (imageData: string) => {
    const newItem: QueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageData,
      status: "queued",
    };
    setQueue(prev => [...prev, newItem]);
  };

  const handleReviewItem = (item: QueueItem) => {
    if (item.receiptData) {
      setSelectedItem(item);
    }
  };

  const handleManualConfirm = async (data: ReceiptData) => {
    if (!user || !selectedItem) return;

    try {
      let imageUrl = null;
      const fileName = `${user.id}/${data.receiptNumber}-${Date.now()}.jpg`;
      const base64Data = selectedItem.imageData.split(",")[1];
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
        toast.error(error.code === "23505" ? "إيصال مكرر!" : "خطأ في الحفظ");
        return;
      }

      setQueue(q => q.map(i => i.id === selectedItem.id ? { ...i, status: "done" as const, receiptData: data } : i));
      toast.success("تم حفظ الإيصال بنجاح ✅");
      setSelectedItem(null);
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  // Clean done items after 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setQueue(prev => prev.filter(i => {
        if (i.status === "done" || i.status === "duplicate" || i.status === "error") {
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
          onClose={() => setSelectedItem(null)}
          onConfirm={handleManualConfirm}
          data={selectedQueueItem.receiptData || null}
          isProcessing={["queued", "analyzing", "saving"].includes(selectedQueueItem.status)}
          isDuplicate={selectedQueueItem.status === "duplicate"}
          errorMessage={selectedQueueItem.error || null}
          capturedImage={selectedQueueItem.imageData}
        />
      )}
    </div>
  );
};

export default Index;
