import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { BarChart3, Table2, Settings, Database, Activity } from "lucide-react";

const navItems = [
  { path: "/", label: "Signal Monitor", icon: Activity },
  { path: "/model", label: "Model Output", icon: BarChart3 },
  { path: "/data", label: "Data Entry", icon: Database },
  { path: "/parameters", label: "Parameters", icon: Settings },
];

export default function Sidebar() {
  const [location] = useHashLocation();

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card h-full overflow-y-auto overscroll-contain">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <svg aria-label="InvestDEFY" viewBox="0 0 32 32" width="28" height="28" fill="none">
            <rect width="32" height="32" rx="6" fill="hsl(188 72% 48% / 0.15)" />
            <path d="M8 24L16 8L24 24" stroke="hsl(188 72% 48%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11 19H21" stroke="hsl(188 72% 48%)" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          </svg>
          <div>
            <div className="text-sm font-bold text-foreground tracking-tight leading-none">InvestDEFY</div>
            <div className="text-xs text-muted-foreground mt-0.5">Macro Signal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path || (path === "/" && location === "");
          return (
            <Link
              key={path}
              href={path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground leading-tight">
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
            Created with Perplexity Computer
          </a>
        </p>
      </div>
    </aside>
  );
}
