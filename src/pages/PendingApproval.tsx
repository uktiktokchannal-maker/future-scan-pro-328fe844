import { Clock } from "lucide-react";
import futureLogo from "@/assets/future-logo.png";
import { useAuth } from "@/hooks/useAuth";

const PendingApproval = () => {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />
      <img src={futureLogo} alt="Future" className="h-20 object-contain mb-8 animate-float" />
      <div className="glass-card rounded-3xl p-8 text-center max-w-sm w-full">
        <div className="w-16 h-16 rounded-full bg-warning/20 mx-auto mb-4 flex items-center justify-center">
          <Clock className="h-8 w-8 text-warning" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">بانتظار التفعيل</h2>
        <p className="text-sm text-muted-foreground mb-2">أهلاً {profile?.full_name}</p>
        <p className="text-sm text-muted-foreground mb-6">
          حسابك قيد المراجعة من قبل الإدارة. سيتم إشعارك فور التفعيل.
        </p>
        <button onClick={signOut}
          className="w-full py-3 rounded-xl glass-card text-muted-foreground font-medium hover:text-foreground transition-colors border border-border">
          تسجيل خروج
        </button>
      </div>
    </div>
  );
};

export default PendingApproval;
