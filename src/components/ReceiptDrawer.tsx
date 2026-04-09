import { X, Check, Pencil, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";

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

interface ReceiptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReceiptData) => void;
  data: ReceiptData | null;
  isProcessing: boolean;
  isDuplicate?: boolean;
  capturedImage?: string | null;
}

const ReceiptDrawer = ({ isOpen, onClose, onConfirm, data, isProcessing, isDuplicate, capturedImage }: ReceiptDrawerProps) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<ReceiptData | null>(null);
  const [progress, setProgress] = useState(0);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState<number | null>(null);

  const currentData = editedData || data;

  // Progress bar animation during processing
  useEffect(() => {
    if (!isProcessing) {
      setProgress(100);
      return;
    }
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Auto-save countdown (3 seconds)
  useEffect(() => {
    if (!currentData || isProcessing || isDuplicate) {
      setAutoSaveCountdown(null);
      return;
    }
    setAutoSaveCountdown(3);
    const interval = setInterval(() => {
      setAutoSaveCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentData, isProcessing, isDuplicate]);

  // Auto-save when countdown reaches 0
  const handleConfirm = useCallback(() => {
    if (currentData) {
      // Haptic feedback on confirm
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      onConfirm(currentData);
    }
  }, [currentData, onConfirm]);

  useEffect(() => {
    if (autoSaveCountdown === 0 && currentData && !isProcessing && !isDuplicate) {
      handleConfirm();
    }
  }, [autoSaveCountdown, currentData, isProcessing, isDuplicate, handleConfirm]);

  // Haptic on successful read
  useEffect(() => {
    if (data && !isProcessing && !isDuplicate) {
      if (navigator.vibrate) navigator.vibrate(100);
    }
  }, [data, isProcessing, isDuplicate]);

  if (!isOpen) return null;

  const handleEditField = (field: string, value: number) => {
    const base = currentData || data;
    if (!base) return;
    const updated = { ...base };
    if (field === "area") {
      updated.totalArea = value;
      updated.commission = value * 300;
    } else if (field === "commission") {
      updated.commission = value;
    }
    setEditedData(updated);
    setEditingField(null);
    // Reset auto-save
    setAutoSaveCountdown(3);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      {/* Gold progress bar at top */}
      {isProcessing && (
        <div className="fixed top-0 left-0 right-0 z-[60]">
          <Progress value={progress} className="h-1 rounded-none bg-transparent [&>div]:bg-accent" />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="glass-card rounded-t-3xl border-t border-border max-w-lg mx-auto">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 rounded-full bg-muted" />
          </div>
          <div className="px-6 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">نتائج التحليل</h3>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {isProcessing ? (
              <div className="flex flex-col items-center py-8 gap-4">
                {/* Show captured image while processing */}
                {capturedImage && (
                  <div className="w-full max-h-40 rounded-2xl overflow-hidden mb-2">
                    <img src={capturedImage} alt="الإيصال" className="w-full h-full object-cover opacity-70" />
                  </div>
                )}
                <div className="w-12 h-12 rounded-full gradient-primary animate-spin opacity-70" style={{
                  mask: "conic-gradient(transparent 30%, black)",
                  WebkitMask: "conic-gradient(transparent 30%, black)",
                }} />
                <p className="text-muted-foreground text-sm">المحاسب الذكي يحلل الإيصال...</p>
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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">
                    رقم الإيصال: <span className="text-foreground font-medium">{currentData.receiptNumber}</span>
                  </p>
                  {currentData.analysisPath && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent">
                      سيناريو {currentData.analysisPath}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">الأمتار</p>
                    {editingField === "area" ? (
                      <input
                        type="number"
                        defaultValue={currentData.totalArea}
                        className="w-full text-center text-xl font-bold bg-transparent border-b border-primary outline-none text-primary"
                        autoFocus
                        onBlur={(e) => handleEditField("area", parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => e.key === "Enter" && handleEditField("area", parseFloat((e.target as HTMLInputElement).value) || 0)}
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-2xl font-bold text-primary">{currentData.totalArea}</p>
                        <button onClick={() => { setEditingField("area"); setAutoSaveCountdown(null); }} className="p-1 hover:bg-muted rounded">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">م²</p>
                  </div>
                  <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">العمولة</p>
                    {editingField === "commission" ? (
                      <input
                        type="number"
                        defaultValue={currentData.commission}
                        className="w-full text-center text-xl font-bold bg-transparent border-b border-success outline-none text-success"
                        autoFocus
                        onBlur={(e) => handleEditField("commission", parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => e.key === "Enter" && handleEditField("commission", parseFloat((e.target as HTMLInputElement).value) || 0)}
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-2xl font-bold text-success">{currentData.commission.toLocaleString()}</p>
                        <button onClick={() => { setEditingField("commission"); setAutoSaveCountdown(null); }} className="p-1 hover:bg-muted rounded">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">ج</p>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">العميل</span>
                    <span className="text-foreground">{currentData.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التاريخ</span>
                    <span className="text-foreground">{currentData.date}</span>
                  </div>
                  {currentData.notes && (
                    <div className="mt-2 p-2 rounded-lg bg-warning/10 text-warning text-xs">
                      ⚠️ {currentData.notes}
                    </div>
                  )}
                </div>

                {/* Items detail (collapsed) */}
                {currentData.items && currentData.items.length > 0 && (
                  <details className="mb-4">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      عرض تفاصيل الأصناف ({currentData.items.length})
                    </summary>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {currentData.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-muted/30">
                          <span className="text-muted-foreground">{item.description || `صنف ${i + 1}`}</span>
                          <span className="text-foreground">{item.total_area_m2 || item.area_m2} م²</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <button onClick={handleConfirm}
                  className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow transition-all hover:shadow-glow-strong active:scale-[0.98] relative overflow-hidden">
                  <Check className="h-5 w-5 inline-block ml-2" />
                  {autoSaveCountdown !== null && autoSaveCountdown > 0
                    ? `حفظ تلقائي خلال ${autoSaveCountdown}...`
                    : "تأكيد وحفظ"
                  }
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
