import { Camera, Wallet, User } from "lucide-react";

interface BottomNavProps {
  activeTab: "scanner" | "wallet" | "profile";
  onTabChange: (tab: "scanner" | "wallet" | "profile") => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const tabs = [
    { id: "profile" as const, icon: User, label: "حسابي" },
    { id: "scanner" as const, icon: Camera, label: "المسح" },
    { id: "wallet" as const, icon: Wallet, label: "المحفظة" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-border">
      <div className="flex items-center justify-around py-2 px-4 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all duration-300 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.id === "scanner" ? (
                <div className={`p-3 rounded-full gradient-primary shadow-glow ${isActive ? "animate-pulse-glow" : ""}`}>
                  <tab.icon className="h-6 w-6 text-primary-foreground" />
                </div>
              ) : (
                <tab.icon className="h-5 w-5" />
              )}
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
