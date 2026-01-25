import {
  createContext,
  KeyboardEvent,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";

/**
 * Tabs Context
 */
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  orientation: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

/**
 * Tabs - Root container for tab navigation
 */
export interface TabsProps {
  children: ReactNode;
  /** Default active tab (controlled via value/onChange for controlled mode) */
  defaultValue?: string;
  /** Controlled value */
  value?: string;
  /** Change handler for controlled mode */
  onChange?: (value: string) => void;
  /** Tab orientation */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Tabs({
  children,
  defaultValue,
  value,
  onChange,
  orientation = "horizontal",
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  const activeTab = value !== undefined ? value : internalValue;
  const setActiveTab = (newValue: string) => {
    if (onChange) {
      onChange(newValue);
    } else {
      setInternalValue(newValue);
    }
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, orientation }}>
      <div
        className={cn(orientation === "vertical" && "flex gap-4", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

/**
 * TabsList - Container for tab triggers
 */
export interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  const { orientation } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    const tabs = listRef.current?.querySelectorAll(
      '[role="tab"]:not([disabled])'
    );
    if (!tabs) return;

    const tabArray = Array.from(tabs) as HTMLElement[];
    const currentIndex = tabArray.findIndex(
      (tab) => tab === document.activeElement
    );

    let nextIndex = currentIndex;
    const isHorizontal = orientation === "horizontal";

    switch (e.key) {
      case isHorizontal ? "ArrowRight" : "ArrowDown":
        e.preventDefault();
        nextIndex = currentIndex < tabArray.length - 1 ? currentIndex + 1 : 0;
        break;
      case isHorizontal ? "ArrowLeft" : "ArrowUp":
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabArray.length - 1;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = tabArray.length - 1;
        break;
    }

    if (nextIndex !== currentIndex) {
      tabArray[nextIndex]?.focus();
      tabArray[nextIndex]?.click();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex",
        orientation === "horizontal"
          ? "flex-row border-b border-border"
          : "flex-col border-r border-border pr-4",
        className
      )}>
      {children}
    </div>
  );
}

/**
 * TabsTrigger - Individual tab button
 */
export interface TabsTriggerProps {
  children: ReactNode;
  /** Unique tab value */
  value: string;
  /** Disabled state */
  disabled?: boolean;
  /** Optional icon */
  icon?: ReactNode;
  className?: string;
}

export function TabsTrigger({
  children,
  value,
  disabled = false,
  icon,
  className,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab, orientation } = useTabsContext();
  const isActive = activeTab === value;
  const panelId = `tabpanel-${value}`;

  return (
    <button
      role="tab"
      type="button"
      id={`tab-${value}`}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={cn(
        // Base styles
        "relative inline-flex items-center gap-2 px-4 py-2.5",
        "text-sm font-medium cursor-pointer",
        "transition-colors duration-200",
        // Focus styles
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        // Default state
        "text-muted-foreground hover:text-foreground",
        // Active state
        isActive && "text-foreground",
        // Disabled
        disabled && "opacity-50 cursor-not-allowed",
        // Orientation-specific active indicator
        orientation === "horizontal" && [
          "border-b-2 -mb-px",
          isActive
            ? "border-primary"
            : "border-transparent hover:border-border",
        ],
        orientation === "vertical" && [
          "border-r-2 -mr-px w-full justify-start",
          isActive
            ? "border-primary bg-accent"
            : "border-transparent hover:bg-accent/50",
        ],
        className
      )}>
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * TabsContent - Tab panel content
 */
export interface TabsContentProps {
  children: ReactNode;
  /** Tab value this content belongs to */
  value: string;
  /** Force mount (keep in DOM when not active) */
  forceMount?: boolean;
  className?: string;
}

export function TabsContent({
  children,
  value,
  forceMount = false,
  className,
}: TabsContentProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive && !forceMount) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!isActive}
      tabIndex={0}
      className={cn(
        "flex-1",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded",
        isActive ? "animate-fade-in" : "hidden",
        className
      )}>
      {children}
    </div>
  );
}

/**
 * SegmentedControl - iOS-style segmented control (tab variant)
 */
export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

const segmentSizeStyles = {
  sm: "text-xs px-2.5 py-1",
  md: "text-sm px-3 py-1.5",
  lg: "text-sm px-4 py-2",
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((opt) => opt.value === value);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (containerRef.current) {
      const buttons = containerRef.current.querySelectorAll("button");
      if (buttons[activeIndex]) {
        const button = buttons[activeIndex];
        setIndicatorStyle({
          left: button.offsetLeft,
          width: button.offsetWidth,
        });
      }
    }
  }, [activeIndex]);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      className={cn(
        "relative inline-flex p-1 rounded-lg bg-muted",
        fullWidth && "w-full",
        disabled && "opacity-50",
        className
      )}>
      {/* Sliding indicator */}
      <div
        className={cn(
          "absolute top-1 bottom-1 rounded-md",
          "bg-background shadow-sm",
          "transition-all duration-200 ease-out"
        )}
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        aria-hidden="true"
      />

      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => !disabled && onChange(option.value)}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5",
            "font-medium rounded-md cursor-pointer",
            "transition-colors duration-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            segmentSizeStyles[size],
            fullWidth && "flex-1",
            option.value === value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed"
          )}>
          {option.icon && (
            <span className="shrink-0" aria-hidden="true">
              {option.icon}
            </span>
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
