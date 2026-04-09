import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import PendingApproval from "./pages/PendingApproval.tsx";
import AdminPanel from "./pages/AdminPanel.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, profile, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full gradient-primary animate-spin" style={{
          mask: "conic-gradient(transparent 30%, black)",
          WebkitMask: "conic-gradient(transparent 30%, black)",
        }} />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (profile?.approval_status === "pending") return <PendingApproval />;

  if (isAdmin) return <AdminPanel />;

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
