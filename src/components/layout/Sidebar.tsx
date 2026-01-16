import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Box,
  Code2,
  Database,
  FolderOpen,
  Globe,
  Key,
  LayoutDashboard,
  Monitor,
  Moon,
  ScrollText,
  Server,
  Sun,
  Terminal,
  Users,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface SidebarProps {
  activeItem:
    | "dashboard"
    | "servers"
    | "groups"
    | "files"
    | "terminal"
    | "scripts"
    | "snippets"
    | "ssh-keys"
    | "nginx"
    | "database"
    | "docker";
  onItemSelect: (
    item:
      | "dashboard"
      | "servers"
      | "groups"
      | "files"
      | "terminal"
      | "scripts"
      | "snippets"
      | "ssh-keys"
      | "nginx"
      | "database"
      | "docker"
  ) => void;
}

const navItems = [
  {
    id: "dashboard" as const,
    label: "Dashboard",
    icon: LayoutDashboard,
    shortcut: "D",
  },
  { id: "servers" as const, label: "Servers", icon: Server, shortcut: "S" },
  { id: "groups" as const, label: "Groups", icon: Users, shortcut: "G" },
  { id: "files" as const, label: "Files", icon: FolderOpen, shortcut: "F" },
  { id: "terminal" as const, label: "Terminal", icon: Terminal, shortcut: "T" },
  { id: "scripts" as const, label: "Scripts", icon: ScrollText, shortcut: "R" },
  { id: "snippets" as const, label: "Snippets", icon: Code2, shortcut: "N" },
  { id: "ssh-keys" as const, label: "SSH Keys", icon: Key, shortcut: "K" },
  { id: "nginx" as const, label: "Nginx", icon: Globe, shortcut: "X" },
  { id: "database" as const, label: "Database", icon: Database, shortcut: "B" },
  { id: "docker" as const, label: "Docker", icon: Box, shortcut: "O" },
];

interface NavButtonProps {
  item: (typeof navItems)[0];
  isActive: boolean;
  onClick: () => void;
}

function NavButton({ item, isActive, onClick }: NavButtonProps) {
  const Icon = item.icon;

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "relative w-11 h-11 rounded-lg flex items-center justify-center cursor-pointer",
              "transition-all duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary",
              isActive
                ? "bg-primary text-primary-foreground shadow-md glow-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}>
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary-foreground rounded-r" />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium",
              "bg-popover text-popover-foreground border border-border shadow-lg",
              "animate-scale-in z-50"
            )}>
            <span>{item.label}</span>
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              Alt+{item.shortcut}
            </span>
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function ThemeToggle() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const themeLabel =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer",
            "transition-all duration-200 ease-out",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
          )}
          aria-label={`Theme: ${themeLabel}. Click to change.`}>
          <ThemeIcon className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            "min-w-[140px] bg-popover border border-border rounded-lg p-1.5 shadow-xl z-50",
            "animate-scale-in"
          )}
          sideOffset={8}
          side="right">
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Theme
          </DropdownMenu.Label>
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer outline-none",
              "transition-colors duration-150",
              theme === "light"
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent"
            )}
            onClick={() => setTheme("light")}>
            <Sun className="w-4 h-4" />
            <span>Light</span>
            {theme === "light" && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer outline-none",
              "transition-colors duration-150",
              theme === "dark"
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent"
            )}
            onClick={() => setTheme("dark")}>
            <Moon className="w-4 h-4" />
            <span>Dark</span>
            {theme === "dark" && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer outline-none",
              "transition-colors duration-150",
              theme === "system"
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent"
            )}
            onClick={() => setTheme("system")}>
            <Monitor className="w-4 h-4" />
            <span>System</span>
            {theme === "system" && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Sidebar({ activeItem, onItemSelect }: SidebarProps) {
  return (
    <aside
      className="w-16 bg-secondary/50 border-r border-border flex flex-col items-center py-4"
      role="navigation"
      aria-label="Main navigation">
      {/* Logo */}
      <div className="mb-6 pb-4 border-b border-border/50">
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg">
          <img src="/logo.png" alt="CargoShip" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex flex-col items-center gap-1.5 flex-1 overflow-y-auto px-1.5">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => onItemSelect(item.id)}
          />
        ))}
      </nav>

      {/* Theme Toggle at bottom */}
      <div className="mt-auto pt-4 border-t border-border/50">
        <ThemeToggle />
      </div>
    </aside>
  );
}
