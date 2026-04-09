import { TrendingUp, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface WalletEntry {
  id: string;
  amount: number;
  description: string | null;
  created_at: string;
}

type FilterType = "today" | "week" | "month";

const WalletView = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>("month");
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadWallet();
  }, [user, filter]);

  const loadWallet = async () => {
    if (!user) return;
    setLoading(true);

    const { data: wallet } = await supabase.from("wallets").select("current_balance").eq("user_id", user.id).maybeSingle();
    setBalance(wallet?.current_balance ?? 0);

    const { data: walletRow } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
    if (walletRow) {
      let query = supabase.from("wallet_entries").select("id, amount, description, created_at").eq("wallet_id", walletRow.id).order("created_at", { ascending: false });

      const now = new Date();
      if (filter === "today") {
        query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
      } else if (filter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte("created_at", weekAgo.toISOString());
      } else {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte("created_at", monthStart.toISOString());
      }

      const { data } = await query;
      setEntries((data as WalletEntry[]) || []);
    }
    setLoading(false);
  };

  const filters: { id: FilterType; label: string }[] = [
    { id: "today", label: "اليوم" },
    { id: "week", label: "الأسبوع" },
    { id: "month", label: "الشهر" },
  ];

  return (
    <div className="min-h-[calc(100vh-5rem)] pb-24 px-4 pt-6">
      <div className="gradient-primary rounded-3xl p-6 mb-6 shadow-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-primary-foreground/5 rounded-full -translate-x-8 -translate-y-8" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-primary-foreground/5 rounded-full translate-x-6 translate-y-6" />
        <div className="relative">
          <p className="text-primary-foreground/80 text-sm mb-1">إجمالي عمولات الشهر</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-primary-foreground">{balance.toLocaleString()}</span>
            <span className="text-primary-foreground/70 text-lg">ج</span>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="h-4 w-4 text-primary-foreground/70" />
            <span className="text-xs text-primary-foreground/70">{entries.length} عملية</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.id ? "gradient-primary text-primary-foreground shadow-glow" : "glass-card text-muted-foreground hover:text-foreground"
            }`}>{f.label}</button>
        ))}
      </div>

      <h3 className="text-sm font-bold text-muted-foreground mb-2">سجل العمليات</h3>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full gradient-primary animate-spin" style={{
            mask: "conic-gradient(transparent 30%, black)", WebkitMask: "conic-gradient(transparent 30%, black)",
          }} />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">لا توجد عمليات حتى الآن</p>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.id} className="glass-card rounded-2xl p-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("ar-SD")}</span>
                </div>
                <span className="text-xs text-muted-foreground">{e.description || "عمولة إيصال"}</span>
              </div>
              <span className="font-bold text-foreground">+{e.amount.toLocaleString()} ج</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WalletView;
