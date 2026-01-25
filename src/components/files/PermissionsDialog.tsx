import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Shield } from "lucide-react";
import { cn } from "../../lib/utils";

interface PermissionsDialogProps {
  isOpen: boolean;
  fileName: string;
  currentPermissions: string;
  isLoading?: boolean;
  error?: string | null;
  onSubmit: (permissions: string) => void;
  onClose: () => void;
}

interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

/**
 * Dialog for changing file/folder permissions
 * Supports both octal (e.g., 755) and symbolic (rwxr-xr-x) formats
 */
export function PermissionsDialog({
  isOpen,
  fileName,
  currentPermissions,
  isLoading = false,
  error,
  onSubmit,
  onClose,
}: PermissionsDialogProps) {
  const [owner, setOwner] = useState<PermissionSet>({ read: false, write: false, execute: false });
  const [group, setGroup] = useState<PermissionSet>({ read: false, write: false, execute: false });
  const [others, setOthers] = useState<PermissionSet>({ read: false, write: false, execute: false });
  const [octalValue, setOctalValue] = useState("");

  // Parse current permissions on open
  useEffect(() => {
    if (isOpen && currentPermissions) {
      parsePermissions(currentPermissions);
    }
  }, [isOpen, currentPermissions]);

  // Update octal value when checkboxes change
  useEffect(() => {
    const ownerOctal = (owner.read ? 4 : 0) + (owner.write ? 2 : 0) + (owner.execute ? 1 : 0);
    const groupOctal = (group.read ? 4 : 0) + (group.write ? 2 : 0) + (group.execute ? 1 : 0);
    const othersOctal = (others.read ? 4 : 0) + (others.write ? 2 : 0) + (others.execute ? 1 : 0);
    setOctalValue(`${ownerOctal}${groupOctal}${othersOctal}`);
  }, [owner, group, others]);

  const parsePermissions = (perms: string) => {
    // Handle symbolic format like "rwxr-xr-x" or "-rwxr-xr-x"
    const symbolic = perms.replace(/^[-dlbcps]/, ""); // Remove file type indicator
    
    if (symbolic.length >= 9) {
      setOwner({
        read: symbolic[0] === "r",
        write: symbolic[1] === "w",
        execute: symbolic[2] === "x" || symbolic[2] === "s",
      });
      setGroup({
        read: symbolic[3] === "r",
        write: symbolic[4] === "w",
        execute: symbolic[5] === "x" || symbolic[5] === "s",
      });
      setOthers({
        read: symbolic[6] === "r",
        write: symbolic[7] === "w",
        execute: symbolic[8] === "x" || symbolic[8] === "t",
      });
    }
  };

  const handleOctalChange = (value: string) => {
    // Only allow digits 0-7
    const filtered = value.replace(/[^0-7]/g, "").slice(0, 3);
    setOctalValue(filtered);

    if (filtered.length === 3) {
      const ownerOctal = parseInt(filtered[0], 10);
      const groupOctal = parseInt(filtered[1], 10);
      const othersOctal = parseInt(filtered[2], 10);

      setOwner({
        read: (ownerOctal & 4) !== 0,
        write: (ownerOctal & 2) !== 0,
        execute: (ownerOctal & 1) !== 0,
      });
      setGroup({
        read: (groupOctal & 4) !== 0,
        write: (groupOctal & 2) !== 0,
        execute: (groupOctal & 1) !== 0,
      });
      setOthers({
        read: (othersOctal & 4) !== 0,
        write: (othersOctal & 2) !== 0,
        execute: (othersOctal & 1) !== 0,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (octalValue.length === 3) {
      onSubmit(octalValue);
    }
  };

  const PermissionCheckbox = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border"
        disabled={isLoading}
      />
      <span className="text-sm">{label}</span>
    </label>
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md bg-background border border-border rounded-lg shadow-lg z-50",
            "p-6"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Change Permissions
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-secondary"
                disabled={isLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Change permissions for "{fileName}"
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            {/* Octal input */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Octal (e.g., 755)
              </label>
              <input
                type="text"
                value={octalValue}
                onChange={(e) => handleOctalChange(e.target.value)}
                placeholder="755"
                maxLength={3}
                className={cn(
                  "w-24 px-3 py-2 rounded-md border border-input bg-background text-center font-mono text-lg",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
                disabled={isLoading}
              />
            </div>

            {/* Permission checkboxes */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-sm font-medium text-muted-foreground"></div>
              <div className="text-sm font-medium text-center">Read</div>
              <div className="text-sm font-medium text-center">Write</div>
              <div className="text-sm font-medium text-center">Execute</div>

              {/* Owner */}
              <div className="text-sm font-medium">Owner</div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={owner.read}
                  onChange={(checked) => setOwner({ ...owner, read: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={owner.write}
                  onChange={(checked) => setOwner({ ...owner, write: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={owner.execute}
                  onChange={(checked) => setOwner({ ...owner, execute: checked })}
                />
              </div>

              {/* Group */}
              <div className="text-sm font-medium">Group</div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={group.read}
                  onChange={(checked) => setGroup({ ...group, read: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={group.write}
                  onChange={(checked) => setGroup({ ...group, write: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={group.execute}
                  onChange={(checked) => setGroup({ ...group, execute: checked })}
                />
              </div>

              {/* Others */}
              <div className="text-sm font-medium">Others</div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={others.read}
                  onChange={(checked) => setOthers({ ...others, read: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={others.write}
                  onChange={(checked) => setOthers({ ...others, write: checked })}
                />
              </div>
              <div className="flex justify-center">
                <PermissionCheckbox
                  label=""
                  checked={others.execute}
                  onChange={(checked) => setOthers({ ...others, execute: checked })}
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md border border-border hover:bg-secondary text-sm"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={cn(
                  "px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm",
                  "hover:bg-primary/90 disabled:opacity-50"
                )}
                disabled={isLoading || octalValue.length !== 3}
              >
                {isLoading ? "Applying..." : "Apply"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
