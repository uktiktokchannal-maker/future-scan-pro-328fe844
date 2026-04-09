import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ScannerView from "@/components/ScannerView";
import ReceiptDrawer from "@/components/ReceiptDrawer";
import QueueIndicator from "@/components/QueueIndicator";
import WalletView from "@/components/WalletView";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
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

  // Process queue items one by one
  const processQueue = useCallback(async () => {
    if (processingRef.current || !user) return;

    setQueue(prev => {
      const next = prev.find(i => i.status === "queued");
      if (!next) return prev;
      processingRef.current = true;
      // Start processing async
      (async () => {
        try {
          // Update status to analyzing
          setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "analyzing" as const } : i));

          const { data, error } = await supabase.functions.invoke("analyze-receipt", {
            body: { image_base64: next.imageData },
          });

          if (error || data?.error) {
            setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "error" as const, error: data?.error || "خطأ في التحليل" } : i));
            toast.error(data?.error || "خطأ في تحليل الإيصال");
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
              setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "duplicate" as const } : i));
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

          setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "analyzed" as const, receiptData } : i));
          if (navigator.vibrate) navigator.vibrate(100);

          // Auto-save
          setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "saving" as const } : i));

          let imageUrl = null;
          const fileName = `${user.id}/${receiptData.receiptNumber}-${Date.now()}.jpg`;
          const base64Data = next.imageData.split(",")[1];
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
              setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "duplicate" as const } : i));
              toast.error("إيصال مكرر!");
            } else {
              setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "error" as const, error: "خطأ في الحفظ" } : i));
              toast.error("خطأ في حفظ الإيصال");
            }
          } else {
            setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "done" as const } : i));
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
            toast.success(`✅ تم حفظ إيصال ${receiptData.receiptNumber}`);
          }
        } catch {
          setQueue(q => q.map(i => i.id === next.id ? { ...i, status: "error" as const, error: "خطأ غير متوقع" } : i));
          toast.error("حدث خطأ أثناء المعالجة");
        }
        processingRef.current = false;
      })();
      return prev;
    });
  }, [user]);

  // Trigger queue processing whenever queue changes
  useEffect(() => {
    const hasQueued = queue.some(i => i.status === "queued");
    if (hasQueued && !processingRef.current) {
      processQueue();
    }
  }, [queue, processQueue]);

  // Re-trigger after an item finishes
  useEffect(() => {
    if (!processingRef.current) {
      const hasQueued = queue.some(i => i.status === "queued");
      if (hasQueued) {
        const timer = setTimeout(processQueue, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [queue, processQueue]);

  const handleCapture = (imageData: string) => {
    const newItem: QueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageData,
      status: "queued",
    };
    setQueue(prev => [...prev, newItem]);
    // Camera stays open - no drawer blocking
  };

  // Allow manual review of a queue item
  const handleReviewItem = (item: QueueItem) => {
    if (item.receiptData) {
      setSelectedItem(item);
    }
  };

  const handleManualConfirm = async (data: ReceiptData) => {
    // For manual edits on analyzed items that haven't been saved yet
    if (!user || !selectedItem) return;

    try {
      let imageUrl = null;
      const fileName = `${user.id}/${data.receiptNumber}-${Date.now()}.jpg`;
      const base64Data = selectedItem.imageData.split(",")[1];
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

  // Clean done items after 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setQueue(prev => prev.filter(i => {
        if (i.status === "done") {
          // Keep for 10s
          const age = Date.now() - parseInt(i.id.split("-")[1]);
          return age < 15000;
        }
        return true;
      }));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const drawerItem = selectedItem;

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

      {/* Manual review drawer for items that need editing */}
      {drawerItem && (
        <ReceiptDrawer
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          onConfirm={handleManualConfirm}
          data={drawerItem.receiptData || null}
          isProcessing={false}
          isDuplicate={drawerItem.status === "duplicate"}
          capturedImage={drawerItem.imageData}
        />
      )}
    </div>
  );
};

export default Index;
