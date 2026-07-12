import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Search,
  PenSquare,
  BarChart3,
  Mail,
  MessageCircleQuestion,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Command", icon: LayoutDashboard, testId: "nav-command" },
  { to: "/leads", label: "Leads", icon: Users, testId: "nav-leads" },
  { to: "/research", label: "Research", icon: Search, testId: "nav-research" },
  { to: "/posts", label: "Posts", icon: PenSquare, testId: "nav-posts" },
  { to: "/insights", label: "Insights", icon: BarChart3, testId: "nav-insights" },
  { to: "/emails", label: "Emails", icon: Mail, testId: "nav-emails" },
  { to: "/voice", label: "Voice", icon: MessageCircleQuestion, testId: "nav-voice" },
  { to: "/onboarding", label: "Positioning", icon: Sparkles, testId: "nav-onboarding" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testId: "nav-settings" },
];

export default function Layout() {
  const location = useLocation();
  const active = NAV.find((n) => n.to === location.pathname)?.label || "Command";
  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-[240px] flex-col border-r border-white/8 bg-[#070707] sticky top-0 h-screen">
        <div className="px-5 py-6 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyber flex items-center justify-center" data-testid="brand-mark">
              <Zap size={16} className="text-black" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-extrabold text-lg leading-none">VIRALLEAD</div>
              <div className="text-[10px] tracking-[0.2em] text-white/40 font-mono mt-1">AUTOMATOR/V1</div>
            </div>
          </div>
        </div>
        <nav className="p-3 flex-1 space-y-0.5" data-testid="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={item.testId}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200 ${
                    isActive
                      ? "bg-cyber text-black font-semibold"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className="tracking-wide">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/8 text-[10px] font-mono text-white/40">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 bg-emerald-400" />
            GEMINI 3 FLASH · ONLINE
          </div>
          <div>MODEL/EMERGENT.LLM.KEY</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="glass-header sticky top-0 z-30 px-6 md:px-10 py-4 flex items-center justify-between" data-testid="app-header">
          <div>
            <div className="text-[10px] font-mono text-white/40 tracking-[0.25em]">// COMMAND CENTER</div>
            <h1 className="font-display font-extrabold text-2xl md:text-3xl leading-tight" data-testid="active-page-title">
              {active}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] font-mono text-white/40 tracking-widest">POSITIONING</div>
              <div className="text-xs text-white/80 font-medium">Consumer-behavior brand strategist</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center font-mono text-xs">
              CB
            </div>
          </div>
        </header>

        {/* Mobile nav strip */}
        <div className="md:hidden overflow-x-auto border-b border-white/8 bg-[#070707]" data-testid="mobile-nav">
          <div className="flex gap-1 p-2 min-w-max">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`${item.testId}-mobile`}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                    isActive ? "bg-cyber text-black font-semibold" : "text-white/60"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="flex-1 p-6 md:p-10">
          <Outlet />
        </main>

        <footer className="border-t border-white/8 px-6 md:px-10 py-4 flex items-center justify-between text-[10px] font-mono text-white/40">
          <div>VIRALLEAD // BUILT FOR SOLO OPERATORS</div>
          <div>NO LOGIN · NO OAUTH · JUST OUTPUT</div>
        </footer>
      </div>
    </div>
  );
}
