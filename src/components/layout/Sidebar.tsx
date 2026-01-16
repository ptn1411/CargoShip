import { Server, FolderOpen, Terminal, Sun, Moon, Monitor, ScrollText, LayoutDashboard, Code2, Key, Globe, Database, Users, Box } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface SidebarProps {
  activeItem: "dashboard" | "servers" | "groups" | "files" | "terminal" | "scripts" | "snippets" | "ssh-keys" | "nginx" | "database" | "docker";
  onItemSelect: (item: "dashboard" | "servers" | "groups" | "files" | "terminal" | "scripts" | "snippets" | "ssh-keys" | "nginx" | "database" | "docker") => void;
}

const navItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "servers" as const, label: "Servers", icon: Server },
  { id: "groups" as const, label: "Groups", icon: Users },
  { id: "files" as const, label: "Files", icon: FolderOpen },
  { id: "terminal" as const, label: "Terminal", icon: Terminal },
  { id: "scripts" as const, label: "Scripts", icon: ScrollText },
  { id: "snippets" as const, label: "Snippets", icon: Code2 },
  { id: "ssh-keys" as const, label: "SSH Keys", icon: Key },
  { id: "nginx" as const, label: "Nginx", icon: Globe },
  { id: "database" as const, label: "Database", icon: Database },
  { id: "docker" as const, label: "Docker", icon: Box },
];

function ThemeToggle() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-accent text-muted-foreground hover:text-accent-foreground"
          title="Toggle theme"
        >
          <ThemeIcon className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[120px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
          sideOffset={5}
          side="right"
        >
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
              theme === "light" ? "bg-accent" : "hover:bg-accent"
            )}
            onClick={() => setTheme("light")}
          >
            <Sun className="w-4 h-4" />
            Light
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
              theme === "dark" ? "bg-accent" : "hover:bg-accent"
            )}
            onClick={() => setTheme("dark")}
          >
            <Moon className="w-4 h-4" />
            Dark
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
              theme === "system" ? "bg-accent" : "hover:bg-accent"
            )}
            onClick={() => setTheme("system")}
          >
            <Monitor className="w-4 h-4" />
            System
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Sidebar({ activeItem, onItemSelect }: SidebarProps) {
  return (
    <aside className="w-16 bg-secondary border-r border-border flex flex-col items-center py-4">
      {/* Logo */}
      <div className="mb-4 pb-4 border-b border-border">
        <img src="/logo.png" alt="CargoShip" className="w-10 h-10 rounded-lg" />
      </div>

      {/* Navigation Items */}
      <nav className="flex flex-col items-center gap-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onItemSelect(item.id)}
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
                activeItem === item.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground hover:text-accent-foreground"
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle at bottom */}
      <div className="mt-auto pt-4 border-t border-border">
        <ThemeToggle />
      </div>
    </aside>
  );
}
