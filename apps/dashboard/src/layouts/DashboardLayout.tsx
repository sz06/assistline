import {
  BookOpen,
  Bot,
  Cpu,
  Database,
  Menu,
  MessageSquare,
  Moon,
  Radio,
  ScrollText,
  Settings,
  Shield,
  Sun,
  Terminal,
  UserCircle,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidedrawer } from "../components/side-drawer";
import { Sidebar } from "../components/sidebar";

const navGroups = [
  {
    title: "General",
    links: [
      {
        label: "Conversations",
        href: "/conversations",
        icon: <MessageSquare className="h-5 w-5" />,
      },
      {
        label: "Chat",
        href: "/chat",
        icon: <Bot className="h-5 w-5" />,
      },
      {
        label: "Contacts",
        href: "/contacts",
        icon: <Users className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Platform",
    links: [
      {
        label: "Channels",
        href: "/channels",
        icon: <Radio className="h-5 w-5" />,
      },
      {
        label: "Artifacts",
        href: "/artifacts",
        icon: <Database className="h-5 w-5" />,
      },
      { label: "Roles", href: "/roles", icon: <Shield className="h-5 w-5" /> },
    ],
  },
  {
    title: "System & AI",
    links: [
      {
        label: "AI Providers",
        href: "/providers",
        icon: <Cpu className="h-5 w-5" />,
      },
      {
        label: "Simulator",
        href: "/simulator",
        icon: <Terminal className="h-5 w-5" />,
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: <ScrollText className="h-5 w-5" />,
      },
      {
        label: "Config",
        href: "/config",
        icon: <Settings className="h-5 w-5" />,
      },
      {
        label: "Profile",
        href: "/profile",
        icon: <UserCircle className="h-5 w-5" />,
      },
    ],
  },
  {
    title: "Help & Resources",
    links: [
      {
        label: "Wiki",
        href: "/wiki",
        icon: <BookOpen className="h-5 w-5" />,
      },
    ],
  },
];

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // Update browser tab title based on current route
  useEffect(() => {
    // Find active link across all groups
    const activeLink = navGroups
      .flatMap((g) => g.links)
      .find((link) => location.pathname.startsWith(link.href));

    document.title = activeLink
      ? `${activeLink.label} | Assistline`
      : "Assistline";
  }, [location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const sidebarProps = {
    groups: navGroups,
    activePath: location.pathname,
    onNavigate: (href: string) => navigate(href),
    onLinkClick: () => setSidebarOpen(false),
    header: (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
          A
        </div>
        <span className="font-semibold text-lg">Assistline</span>
      </div>
    ),
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Mobile Sidebar Overlay */}
      <Sidedrawer isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <Sidebar {...sidebarProps} />
      </Sidedrawer>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 h-14 md:h-16 shrink-0">
          {/* Left: hamburger (mobile only) */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Spacer to push controls right on desktop */}
          <div className="hidden md:block" />

          {/* Right controls */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
