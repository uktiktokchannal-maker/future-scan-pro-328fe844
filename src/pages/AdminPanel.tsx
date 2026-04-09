import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Users, FileText, CheckCircle, XCircle, LogOut, Shield, Eye } from "lucide-react";

type Tab = "users" | "receipts";

interface ProfileRow {
  user_id: string;
  full_name: string;
  phone: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface ReceiptRow {
  id: string;
  receipt_number: string;
  client_name: string | null;
  total_area: number;
  commission_amount: number;
  status: "pending" | "approved" | "rejected" | "paid";
  created_at: string;
  image_url: string | null;
  designer_id: string;
}

const AdminPanel = () => {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewImage, setViewImage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    if (tab === "users") {
      const { data } = await supabase.from("profiles").select("user_id, full_name, phone, approval_status, created_at").order("created_at", { ascending: false });
      setProfiles((data as ProfileRow[]) || []);
    } else {
      const { data } = await supabase.from("receipts").select("*").order("created_at", { ascending: false });
      setReceipts((data as ReceiptRow[]) || []);
    }
    setLoading(false);
  };

  const updateApproval = async (userId: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("profiles").update({ approval_status: status }).eq("user_id", userId);
    if (error) { toast.error("خطأ في التحديث"); return; }
    toast.success(status === "approved" ? "تم تفعيل الحساب ✅" : "تم رفض الحساب");
    loadData();
  };

  const updateReceiptStatus = async (id: string, status: "approved" | "rejected" | "paid") => {
    const { error } = await supabase.from("receipts").update({ status }).eq("id", id);
    if (error) { toast.error("خطأ في التحديث"); return; }
    toast.success("تم تحديث حالة الإيصال");
    loadData();
  };

  const statusLabels = {
    pending: { label: "معلق", className: "bg-warning/20 text-warning" },
    approved: { label: "مفعّل", className: "bg-success/20 text-success" },
    rejected: { label: "مرفوض", className: "bg-destructive/20 text-destructive" },
    paid: { label: "مصروف", className: "bg-primary/20 text-primary" },
  };

  return (
    <div className="min-h-screen pb-8 px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">لوحة الإدارة</h1>
        </div>
        <button onClick={signOut} className="p-2 rounded-full glass-card">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("users")}
          className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            tab === "users" ? "gradient-primary text-primary-foreground shadow-glow" : "glass-card text-muted-foreground"
          }`}>
          <Users className="h-4 w-4" /> المستخدمون
        </button>
        <button onClick={() => setTab("receipts")}
          className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            tab === "receipts" ? "gradient-primary text-primary-foreground shadow-glow" : "glass-card text-muted-foreground"
          }`}>
          <FileText className="h-4 w-4" /> الإيصالات
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full gradient-primary animate-spin" style={{
            mask: "conic-gradient(transparent 30%, black)", WebkitMask: "conic-gradient(transparent 30%, black)",
          }} />
        </div>
      ) : tab === "users" ? (
        <div className="space-y-3">
          {profiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">لا يوجد مستخدمون</p>
          ) : profiles.map((p) => (
            <div key={p.user_id} className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-foreground">{p.full_name || "بدون اسم"}</p>
                  <p className="text-xs text-muted-foreground">{p.phone || "بدون هاتف"}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusLabels[p.approval_status].className}`}>
                  {statusLabels[p.approval_status].label}
                </span>
              </div>
              {p.approval_status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => updateApproval(p.user_id, "approved")}
                    className="flex-1 py-2 rounded-xl bg-success/20 text-success font-medium text-sm flex items-center justify-center gap-1">
                    <CheckCircle className="h-4 w-4" /> تفعيل
                  </button>
                  <button onClick={() => updateApproval(p.user_id, "rejected")}
                    className="flex-1 py-2 rounded-xl bg-destructive/20 text-destructive font-medium text-sm flex items-center justify-center gap-1">
                    <XCircle className="h-4 w-4" /> رفض
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">لا يوجد إيصالات</p>
          ) : receipts.map((r) => (
            <div key={r.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-bold text-foreground">إيصال #{r.receipt_number}</p>
                  <p className="text-xs text-muted-foreground">{r.client_name || "بدون اسم عميل"}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusLabels[r.status].className}`}>
                  {statusLabels[r.status].label}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">الأمتار: <span className="text-primary font-bold">{r.total_area} م²</span></span>
                <span className="text-muted-foreground">العمولة: <span className="text-success font-bold">{r.commission_amount.toLocaleString()} ج</span></span>
              </div>
              <div className="flex gap-2">
                {r.image_url && (
                  <button onClick={() => setViewImage(r.image_url)}
                    className="py-2 px-3 rounded-xl glass-card text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> عرض الصورة
                  </button>
                )}
                {r.status === "pending" && (
                  <>
                    <button onClick={() => updateReceiptStatus(r.id, "approved")}
                      className="py-2 px-3 rounded-xl bg-success/20 text-success text-xs font-medium">تأكيد</button>
                    <button onClick={() => updateReceiptStatus(r.id, "rejected")}
                      className="py-2 px-3 rounded-xl bg-destructive/20 text-destructive text-xs font-medium">رفض</button>
                  </>
                )}
                {r.status === "approved" && (
                  <button onClick={() => updateReceiptStatus(r.id, "paid")}
                    className="py-2 px-3 rounded-xl bg-primary/20 text-primary text-xs font-medium">صرف</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewImage && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="Receipt" className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
