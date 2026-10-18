import React, { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Radio, LayoutDashboard, Server, BookOpen, Users, Settings as SettingsIcon, Siren, FileText, Menu, X, LogOut, RadioTower, ScrollText } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";

// The frame around every signed-in screen: sidebar menu plus page area (<Outlet />).
// Each menu item lists who sees it. `roles` uses the app's two levels (admin / user);
// `volunteerRoles` narrows "user" further to operators, hiding the radio screens
// from watch-only people. Hiding a menu item is cosmetic: the server enforces access.
const navItems = [
{ label: "Dashboard", path: "/", icon: LayoutDashboard, roles: ["admin", "user", "limited"] },
{ label: "Reports", path: "/reports", icon: FileText, roles: ["admin", "user", "limited"] },
{ label: "Repeater Control", path: "/dtmf", icon: RadioTower, roles: ["admin", "user"], volunteerRoles: ["admin", "operator"] },
{ label: "Command Log", path: "/dtmf-log", icon: ScrollText, roles: ["admin", "user"], volunteerRoles: ["admin", "operator"] },
{ label: "Repeaters", path: "/repeaters", icon: Server, roles: ["admin"] },
{ label: "Guidance", path: "/guidance", icon: BookOpen, roles: ["admin"] },
{ label: "Volunteers", path: "/volunteers", icon: Users, roles: ["admin"] },
{ label: "Settings", path: "/settings", icon: SettingsIcon, roles: ["admin"] }];


export default function Layout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { accessLevel, user, volunteer, logout } = useAuth();

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) =>
  <>
      <div className="px-5 py-5 border-b border-gray-700 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center">
          <Siren className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide text-gray-100">GMRS Priority Watch</div>
          <div className="text-[11px] text-gray-400 uppercase tracking-wider">Control Center</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.filter((item) => item.roles.includes(accessLevel) && (!item.volunteerRoles || volunteer && item.volunteerRoles.includes(volunteer.role))).map((item) => {
        const Icon = item.icon;
        const active = location.pathname === item.path || item.path !== "/" && location.pathname.startsWith(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            active ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-100 hover:bg-gray-700/50"}`
            }>
            
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>);

      })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-700 space-y-3">
        {user &&
      <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-gray-200 truncate">{volunteer?.name || user.full_name || user.email}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{accessLevel} access</div>
            </div>
            <button onClick={() => logout()} aria-label="Sign out" className="text-gray-400 hover:text-gray-100 shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
      }
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Radio className="w-3.5 h-3.5" />
          <span>ASL3 BASED INCIDENT MANAGEMENT</span>
        </div>
      </div>
    </>;


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-gray-800 border-r border-gray-700 flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile overlay drawer */}
      {open &&
      <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-gray-800 border-r border-gray-700 flex flex-col animate-in slide-in-from-left duration-200">
            <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-3 text-gray-400 hover:text-gray-100"
            aria-label="Close menu">
            
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      }

      {/* Main */}
      <main className="flex-1 overflow-auto w-full">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 py-3">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-gray-300 hover:text-gray-100">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-400" />
            <span className="text-sm font-semibold text-gray-100">Priority Watch</span>
          </div>
          <div className="w-6" />
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto"><Outlet /></div>
      </main>
    </div>);

}