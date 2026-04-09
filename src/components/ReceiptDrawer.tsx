import { X, Check, Pencil, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface ReceiptData {
  receiptNumber: string;
  clientName: string;
  date: string;
  totalArea: number;
  commission: number;
}

interface ReceiptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReceiptData) => void;
  data: ReceiptData | null;
  isProcessing: boolean;
  isDuplicate?: boolean;
}

const ReceiptDrawer = ({ isOpen, onClose, onConfirm, data, isProcessing, isDuplicate }: ReceiptDrawerProps) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<ReceiptData | null>(null);

  const currentData = editedData || data;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="glass-card rounded-t-3xl border-t border-border max-w-lg mx-auto">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 rounded-full bg-muted" />
          </div>
          <div className="px-6 pb-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-foreground">نتائج التحليل</h3>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {isProcessing ? (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="w-16 h-16 rounded-full gradient-primary animate-spin opacity-70" style={{
                  mask: "conic-gradient(transparent 30%, black)",
                  WebkitMask: "conic-gradient(transparent 30%, black)",
                }} />
                <p className="text-muted-foreground">جاري تحليل الإيصال...</p>
              </div>
            ) : isDuplicate ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <h4 className="text-lg font-bold text-destructive">إيصال مكرر!</h4>
                <p className="text-sm text-muted-foreground text-center">
                  هذا الإيصال مسجل مسبقاً في النظام. لا يمكن احتسابه مرة أخرى.
                </p>
                <button onClick={onClose} className="w-full py-3 rounded-xl bg-muted text-foreground font-bold mt-4">إغلاق</button>
              </div>
            ) : currentData ? (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  رقم الإيصال: <span className="text-foreground">{currentData.receiptNumber}</span>
                </p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي الأمتار</p>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-2xl font-bold text-primary">{currentData.totalArea}</p>
                      <button onClick={() => setEditingField("area")} className="p-1 hover:bg-muted rounded">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">م²</p>
                  </div>
                  <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">العمولة المستحقة</p>
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-2xl font-bold text-success">{currentData.commission.toLocaleString()}</p>
                      <button onClick={() => setEditingField("commission")} className="p-1 hover:bg-muted rounded">
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">ج</p>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">العميل</span>
                    <span className="text-foreground">{currentData.clientName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">التاريخ</span>
                    <span className="text-foreground">{currentData.date}</span>
                  </div>
                </div>
                <button onClick={() => onConfirm(currentData)}
                  className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow transition-all hover:shadow-glow-strong active:scale-[0.98]">
                  <Check className="h-5 w-5 inline-block ml-2" />
                  تأكيد وحفظ
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

export default ReceiptDrawer;
