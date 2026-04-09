import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ScannerView from "@/components/ScannerView";
import ReceiptDrawer from "@/components/ReceiptDrawer";
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
}

const Index = () => {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"scanner" | "wallet" | "profile">("scanner");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const handleCapture = async (imageData: string) => {
    setCapturedImage(imageData);
    setDrawerOpen(true);
    setIsProcessing(true);
    setIsDuplicate(false);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-receipt", {
        body: { image_base64: imageData },
      });

      if (error) {
        toast.error("خطأ في تحليل الإيصال");
        setDrawerOpen(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setDrawerOpen(false);
        return;
      }

      if (data.receipt_number) {
        const { data: existing } = await supabase
          .from("receipts")
          .select("id")
          .eq("receipt_number", data.receipt_number)
          .maybeSingle();

        if (existing) {
          setIsDuplicate(true);
          setIsProcessing(false);
          return;
        }
      }

      setReceiptData({
        receiptNumber: data.receipt_number || `RC-${Date.now()}`,
        clientName: data.client_name || "غير محدد",
        date: data.date || new Date().toLocaleDateString("ar-SD"),
        totalArea: data.total_area || 0,
        commission: data.total_commission || 0,
      });
    } catch (e) {
      toast.error("حدث خطأ أثناء التحليل");
      setDrawerOpen(false);
    }
    setIsProcessing(false);
  };

  const handleConfirm = async (data: ReceiptData) => {
    if (!user) return;

    try {
      let imageUrl = null;
      if (capturedImage) {
        const fileName = `${user.id}/${data.receiptNumber}-${Date.now()}.jpg`;
        const base64Data = capturedImage.split(",")[1];
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

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
        if (error.code === "23505") {
          toast.error("هذا الإيصال مسجل مسبقاً!");
        } else {
          toast.error("خطأ في حفظ الإيصال");
        }
        return;
      }

      toast.success("تم حفظ الإيصال بنجاح ✅");
      setDrawerOpen(false);
      setReceiptData(null);
      setCapturedImage(null);
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {activeTab === "scanner" && <ScannerView onCapture={handleCapture} />}
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

      <ReceiptDrawer
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setReceiptData(null); setIsDuplicate(false); }}
        onConfirm={handleConfirm}
        data={receiptData}
        isProcessing={isProcessing}
        isDuplicate={isDuplicate}
      />
    </div>
  );
};

export default Index;
