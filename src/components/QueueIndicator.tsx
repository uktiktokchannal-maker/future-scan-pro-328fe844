import { CheckCircle, Loader2, AlertTriangle, XCircle, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { QueueItem } from "@/pages/Index";

interface QueueIndicatorProps {
  queue: QueueItem[];
  onReview: (item: QueueItem) => void;
}

const statusConfig = {
  queued: { icon: Loader2, color: "text-muted-foreground", label: "في الانتظار", spin: false },
  analyzing: { icon: Loader2, color: "text-primary", label: "جاري التحليل", spin: true },
  analyzed: { icon: CheckCircle, color: "text-primary", label: "تم التحليل", spin: false },
  saving: { icon: Loader2, color: "text-accent", label: "جاري الحفظ", spin: true },
  done: { icon: CheckCircle, color: "text-success", label: "تم ✅", spin: false },
  error: { icon: XCircle, color: "text-destructive", label: "خطأ", spin: false },
  duplicate: { icon: AlertTriangle, color: "text-warning", label: "مكرر", spin: false },
};

const QueueIndicator = ({ queue, onReview }: QueueIndicatorProps) => {
  const [expanded, setExpanded] = useState(false);

  const activeCount = queue.filter(i => ["queued", "analyzing", "saving"].includes(i.status)).length;
  const doneCount = queue.filter(i => i.status === "done").length;
  const errorCount = queue.filter(i => ["error", "duplicate"].includes(i.status)).length;

  return (
    <div className="fixed top-16 left-4 right-4 z-30 max-w-sm mx-auto">
      {/* Summary badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass-card rounded-2xl px-4 py-2.5 flex items-center justify-between transition-all"
      >
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
              <span className="text-xs font-medium text-primary">{activeCount} قيد المعالجة</span>
            </div>
          )}
          {doneCount > 0 && (
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-success">{doneCount}</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">{errorCount}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="text-[10px]">{queue.length} إيصال</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="mt-2 glass-card rounded-2xl overflow-hidden max-h-60 overflow-y-auto animate-slide-up">
          {queue.map((item) => {
            const cfg = statusConfig[item.status];
            const Icon = cfg.icon;
            return (
              <button
                key={item.id}
                onClick={() => item.receiptData && onReview(item)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors text-right"
              >
                <Icon className={`h-4 w-4 ${cfg.color} flex-shrink-0 ${cfg.spin ? "animate-spin" : ""}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {item.receiptData?.receiptNumber || "إيصال جديد"}
                  </p>
                  <p className={`text-[10px] ${cfg.color}`}>{cfg.label}</p>
                </div>
                {item.receiptData && (
                  <span className="text-xs font-bold text-success flex-shrink-0">
                    {item.receiptData.commission.toLocaleString()} ج
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QueueIndicator;
