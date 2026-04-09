import { useState } from "react";
import { ArrowRight, UserPlus, LogIn } from "lucide-react";
import futureLogo from "@/assets/future-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Mode = "welcome" | "login" | "register";

const AuthPage = () => {
  const [mode, setMode] = useState<Mode>("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error);
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("الاسم مطلوب"); return; }
    setLoading(true);
    const { error } = await signUp(email, password, fullName, phone);
    if (error) {
      toast.error(error);
    } else {
      toast.success("تم إنشاء الحساب! بانتظار تفعيل الإدارة");
      setMode("login");
    }
    setLoading(false);
  };

  if (mode === "welcome") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full bg-secondary/10 blur-[80px]" />
        <div className="relative mb-12 animate-float">
          <img src={futureLogo} alt="Future" className="h-32 object-contain drop-shadow-2xl" />
        </div>
        <div className="text-center mb-12 relative">
          <h1 className="text-3xl font-black text-foreground mb-3">Future Scan Pro</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            حوّل إيصالاتك الورقية إلى عمولات رقمية بلمسة واحدة
          </p>
        </div>
        <div className="w-full max-w-sm space-y-4 relative">
          <button onClick={() => setMode("login")}
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow transition-all hover:shadow-glow-strong active:scale-[0.98] flex items-center justify-center gap-2">
            <LogIn className="h-5 w-5" /> تسجيل دخول الموظفين
          </button>
          <button onClick={() => setMode("register")}
            className="w-full py-4 rounded-2xl glass-card text-foreground font-bold text-lg border border-border hover:border-primary/30 transition-all flex items-center justify-center gap-2">
            <UserPlus className="h-5 w-5" /> طلب انضمام
          </button>
        </div>
        <p className="absolute bottom-8 text-xs text-muted-foreground">فيوتشر للطباعة والإعلان © 2026</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />
      <button onClick={() => setMode("welcome")} className="absolute top-6 right-6 p-2 rounded-full glass-card">
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
      </button>
      <img src={futureLogo} alt="Future" className="h-16 object-contain mb-8" />
      <div className="glass-card rounded-3xl p-8 w-full max-w-sm relative">
        <h2 className="text-xl font-bold text-foreground mb-6 text-center">
          {mode === "login" ? "تسجيل الدخول" : "طلب انضمام"}
        </h2>
        <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
          {mode === "register" && (
            <>
              <input type="text" placeholder="الاسم الكامل" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
              <input type="tel" placeholder="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
            </>
          )}
          <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" dir="ltr" />
          <input type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" dir="ltr" />
          <button type="submit" disabled={loading}
            className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow disabled:opacity-50 transition-all">
            {loading ? "جاري..." : mode === "login" ? "دخول" : "إرسال الطلب"}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === "login" ? (
            <button onClick={() => setMode("register")} className="text-primary hover:underline">إنشاء حساب جديد</button>
          ) : (
            <button onClick={() => setMode("login")} className="text-primary hover:underline">لديك حساب؟ سجل دخول</button>
          )}
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
