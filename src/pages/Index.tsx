import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ScannerView from "@/components/ScannerView";
import ReceiptDrawer from "@/components/ReceiptDrawer";
import QueueIndicator from "@/components/QueueIndicator";
import WalletView from "@/components/WalletView";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, Camera as CameraIcon } from "lucide-react";
// استيراد الكاميرا من Capacitor
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

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

  // --- وظيفة تشغيل الكاميرا والتخزين المؤقت ---
  const handleCapture = async () => {
    try {
      const permissions = await Camera.requestPermissions();
      
      if (permissions.camera === 'granted') {
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera
        });

        if (photo.base64String) {
          const imageData = `data:image/jpeg;base64,${photo.base64String}`;
          const newItem: QueueItem = {
            id: `q-${Date.now()}`,
            imageData,
            status: "queued",
          };

          setQueue(prev => [...prev, newItem]);

          if (!navigator.onLine) {
            toast.warning("لا يوجد اتصال. تم حفظ الإيصال في قائمة الانتظار وسيتم رفعه تلقائياً عند عودة الإنترنت.");
          }
        }
      } else {
        toast.error("صلاحية الكاميرا مرفوضة. يرجى تفعيلها من إعدادات الهاتف.");
      }
    } catch (error) {
      console.log("User cancelled camera or error occurred");
    }
  };

  // --- معالجة القائمة (Queue Processing) ---
  const processQueue = useCallback(async () => {
    if (processingRef.current || !user || !navigator.onLine) return;

    const nextItem = queue.find(i => i.status === "queued");
    if (!nextItem) return;

    processingRef.current = true;
    
    try {
      setQueue(q => q.map(i => i.id === nextItem.id ? { ...i, status: "analyzing" } : i));

      const { data, error } = await supabase.functions.invoke("analyze-receipt", {
        body: { image_base64: nextItem.imageData },
      });

      if (error || data?.error) throw new Error(data?.error || "Analysis failed");

      const receiptData: ReceiptData = {
        receiptNumber: data.receipt_number || `RC-${Date.now()}`,
        clientName: data.client_name || "غير محدد",
        date: data.date || new Date().toLocaleDateString("ar-SD"),
        totalArea: data.total_area || 0,
        commission: data.total_commission || 0,
        items: data.items,
      };

      setQueue(q => q.map(i => i.id === nextItem.id ? { ...i, status: "saving", receiptData } : i));

      // تحويل الصورة للرفع
      const base64Data = nextItem.imageData.split(",")[1];
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j);

      const fileName = `${user.id}/${receiptData.receiptNumber}-${Date.now()}.jpg`;
      const { data: uploadData } = await supabase.storage
        .from("receipt-images")
        .upload(fileName, bytes, { contentType: "image/jpeg" });

      let imageUrl = uploadData ? supabase.storage.from("receipt-images").getPublicUrl(uploadData.path).data.publicUrl : null;

      const { error: insertError } = await supabase.from("receipts").insert({
        receipt_number: receiptData.receiptNumber,
        designer_id: user.id,
        client_name: receiptData.clientName,
        total_area: receiptData.totalArea,
        commission_amount: receiptData.commission,
        image_url: imageUrl,
        receipt_date: new Date().toISOString().split("T")[0],
      });

      if (insertError) throw insertError;

      setQueue(q => q.map(i => i.id === nextItem.id ? { ...i, status: "done" } : i));
      toast.success(`تم حفظ إيصال ${receiptData.receiptNumber}`);

    } catch (err: any) {
      const isDuplicate = err.code === "23505" || err.message?.includes("duplicate");
      setQueue(q => q.map(i => i.id === nextItem.id ? { ...i, status: isDuplicate ? "duplicate" : "error" } : i));
      toast.error(isDuplicate ? "إيصال مكرر" : "خطأ أثناء المعالجة");
    } finally {
      processingRef.current = false;
      // محاولة معالجة العنصر التالي بعد فترة قصيرة
      setTimeout(processQueue, 500);
    }
  }, [user, queue]);

  // مراقبة عودة الإنترنت والبدء في المعالجة
  useEffect(() => {
    const handleOnline = () => {
      toast.info("عادت الشبكة، جاري رفع الإيصالات المعلقة...");
      processQueue();
    };
    window.addEventListener('online', handleOnline);
    if (queue.some(i => i.status === "queued")) processQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, [queue, processQueue]);

  const handleReviewItem = (item: QueueItem) => {
    if (item.receiptData) setSelectedItem(item);
  };

  return (
    <div className="min-h-screen bg-background text-right" dir="rtl">
      {activeTab === "scanner" && (
        <div className="relative h-screen flex flex-col items-center justify-center p-6">
          <div className="glass-card w-full max-w-sm p-8 rounded-[2.5rem] text-center space-y-6 border-2 border-primary/20 animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CameraIcon className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-foreground">الماسح الرقمي</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              قم بتصوير الإيصالات الورقية لتحويلها إلى عمولات رقمية فوراً
            </p>
            <button 
              onClick={handleCapture}
              className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow hover:scale-[1.02] active:scale-95 transition-all"
            >
              تشغيل الكاميرا والمسح
            </button>
          </div>

          {queue.length > 0 && (
            <QueueIndicator queue={queue} onReview={handleReviewItem} />
          )}
        </div>
      )}

      {activeTab === "wallet" && <WalletView />}

      {activeTab === "profile" && (
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)] px-6">
          <div className="glass-card rounded-3xl p-8 text-center max-w-sm w-full">
            <div className="w-20 h-20 rounded-full gradient-primary mx-auto mb-4 flex items-center justify-center text-3xl font-bold text-primary-foreground">
              {profile?.full_name?.charAt(0) || "م"}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">{profile?.full_name}</h2>
            <p className="text-sm text-muted-foreground mb-6">{profile?.phone}</p>
            <button onClick={signOut} className="w-full py-3 rounded-xl glass-card text-destructive font-medium border border-destructive/20 flex items-center justify-center gap-2">
              <LogOut className="h-4 w-4" /> تسجيل خروج
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {selectedItem && (
        <ReceiptDrawer
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          onConfirm={async (data) => {
             // دالة التأكيد اليدوي إذا لزم الأمر
             setSelectedItem(null);
          }}
          data={selectedItem.receiptData || null}
          isProcessing={false}
          isDuplicate={selectedItem.status === "duplicate"}
          capturedImage={selectedItem.imageData}
        />
      )}
    </div>
  );
};

export default Index;
