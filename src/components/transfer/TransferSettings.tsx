import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { Gauge, Infinity, RotateCcw, Save, Settings, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface TransferSettingsProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
}

// Speed limit presets in KB/s
const SPEED_PRESETS = [
  { label: "Unlimited", value: null },
  { label: "128 KB/s", value: 128 * 1024 },
  { label: "256 KB/s", value: 256 * 1024 },
  { label: "512 KB/s", value: 512 * 1024 },
  { label: "1 MB/s", value: 1024 * 1024 },
  { label: "2 MB/s", value: 2 * 1024 * 1024 },
  { label: "5 MB/s", value: 5 * 1024 * 1024 },
  { label: "10 MB/s", value: 10 * 1024 * 1024 },
];

// Max speed for slider (10 MB/s)
const MAX_SPEED = 10 * 1024 * 1024;

/**
 * TransferSettings component - Configure transfer speed limits
 * Requirements: 3.8
 */
export function TransferSettings({
  open,
  onOpenChange,
}: TransferSettingsProps) {
  const setTransferSpeedLimit = useAppStore(
    (state) => state.setTransferSpeedLimit,
  );
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [isLimited, setIsLimited] = useState(false);
  const [speedLimit, setSpeedLimit] = useState<number>(1024 * 1024); // Default 1 MB/s
  const [isSaving, setIsSaving] = useState(false);

  // Format bytes to human readable
  const formatSpeed = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${Math.round(bytes / 1024)} KB/s`;
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const limit = isLimited ? speedLimit : null;
      await setTransferSpeedLimit(limit);
      showSuccess(
        "Settings saved",
        isLimited
          ? `Speed limit set to ${formatSpeed(speedLimit)}`
          : "Speed limit disabled",
      );
      onOpenChange(false);
    } catch (error) {
      showError(
        "Failed to save settings",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle preset selection
  const handlePresetSelect = (value: number | null) => {
    if (value === null) {
      setIsLimited(false);
    } else {
      setIsLimited(true);
      setSpeedLimit(value);
    }
  };

  // Handle slider change
  const handleSliderChange = (values: number[]) => {
    setSpeedLimit(values[0]);
  };

  // Reset to defaults
  const handleReset = () => {
    setIsLimited(false);
    setSpeedLimit(1024 * 1024);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background text-foreground border border-border rounded-lg shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold">
                  Transfer Settings
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Configure file transfer options
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Speed Limit Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gauge className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Speed Limit</p>
                  <p className="text-sm text-muted-foreground">
                    Limit upload and download speed
                  </p>
                </div>
              </div>
              <Switch.Root
                checked={isLimited}
                onCheckedChange={setIsLimited}
                className={cn(
                  "w-11 h-6 rounded-full relative transition-colors",
                  isLimited ? "bg-primary" : "bg-secondary",
                )}>
                <Switch.Thumb
                  className={cn(
                    "block w-5 h-5 bg-white rounded-full shadow transition-transform",
                    isLimited ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </Switch.Root>
            </div>

            {/* Speed Limit Configuration */}
            {isLimited && (
              <div className="space-y-4 pl-8">
                {/* Current Speed Display */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">
                    Current limit:
                  </span>
                  <span className="font-mono font-medium">
                    {formatSpeed(speedLimit)}
                  </span>
                </div>

                {/* Speed Slider */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Adjust speed limit
                  </label>
                  <Slider.Root
                    value={[speedLimit]}
                    onValueChange={handleSliderChange}
                    min={64 * 1024} // 64 KB/s minimum
                    max={MAX_SPEED}
                    step={64 * 1024} // 64 KB steps
                    className="relative flex items-center w-full h-5 select-none touch-none">
                    <Slider.Track className="relative h-2 grow rounded-full bg-secondary">
                      <Slider.Range className="absolute h-full rounded-full bg-primary" />
                    </Slider.Track>
                    <Slider.Thumb
                      className="block w-5 h-5 bg-primary rounded-full shadow-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      aria-label="Speed limit"
                    />
                  </Slider.Root>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>64 KB/s</span>
                    <span>10 MB/s</span>
                  </div>
                </div>

                {/* Presets */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Quick presets
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SPEED_PRESETS.filter((p) => p.value !== null).map(
                      (preset) => (
                        <button
                          key={preset.label}
                          onClick={() => handlePresetSelect(preset.value)}
                          className={cn(
                            "px-2 py-1.5 text-xs rounded-md border transition-colors",
                            speedLimit === preset.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-accent",
                          )}>
                          {preset.label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Unlimited Info */}
            {!isLimited && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-muted-foreground">
                <Infinity className="w-5 h-5" />
                <span className="text-sm">
                  Transfers will use maximum available bandwidth
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent">
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default TransferSettings;
