import React from "react";
import { Settings, X, AlertTriangle } from "lucide-react";
import { Switch } from "../ui/Switch";
import {
  canConfirmInstall,
  downloadPercent,
  type AppUpdateStatus,
} from "../../lib/appUpdate";

interface SettingsModalProps {
  isOpen: boolean;
  keychainEnabled: boolean;
  appVersion: string;
  updateStatus: AppUpdateStatus;
  onClose: () => void;
  onToggleKeychain: (enabled: boolean) => Promise<void> | void;
  onCheckForUpdates: () => Promise<void> | void;
  onInstallUpdate: () => Promise<void> | void;
}

function updateStatusCopy(status: AppUpdateStatus): string {
  switch (status.phase) {
    case "idle":
      return "Check for updates when you want them. Installs never run until you confirm.";
    case "checking":
      return "Checking for updates…";
    case "upToDate":
      return "You're on the latest version.";
    case "available":
      return `Version ${status.version} is available.`;
    case "downloading": {
      const percent = downloadPercent(status.received, status.total);
      return percent == null
        ? "Downloading update…"
        : `Downloading update… ${percent}%`;
    }
    case "installing":
      return "Installing update. The app will restart.";
    case "error":
      return status.message;
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  keychainEnabled,
  appVersion,
  updateStatus,
  onClose,
  onToggleKeychain,
  onCheckForUpdates,
  onInstallUpdate,
}) => {
  if (!isOpen) return null;

  const checking = updateStatus.phase === "checking";
  const installing =
    updateStatus.phase === "downloading" || updateStatus.phase === "installing";
  const canInstall = canConfirmInstall(updateStatus);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans select-none text-foreground">
      <div className="w-full max-w-lg bg-popover border border-border rounded-2xl shadow-2xl flex flex-col text-popover-foreground">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60 rounded-t-2xl">
          <div className="flex items-center gap-2.5 font-mono">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 font-mono text-xs">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-keychain"
              className="text-[10px] font-bold uppercase text-muted-foreground"
            >
              System keychain
            </label>
            <div className="h-9 px-3 flex items-center gap-2 bg-background border border-border rounded-xl">
              <Switch
                id="settings-keychain"
                checked={keychainEnabled}
                onCheckedChange={(enabled) => {
                  void onToggleKeychain(enabled);
                }}
              />
              <span
                className={`font-bold uppercase text-[10px] ${
                  keychainEnabled ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {keychainEnabled ? "On" : "Off"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              When on, passwords and SSH secrets are stored in the operating system
              keychain. When off, they are stored locally in an owner-only file.
            </p>
          </div>

          {!keychainEnabled && (
            <div className="p-2.5 rounded-xl border text-xs flex items-center gap-2 bg-amber-500/10 border-amber-500/30 text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Local secret storage is less secure. Enable the system keychain to
                protect credentials with the OS.
              </span>
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              Updates
            </span>
            <p className="text-[10px] text-muted-foreground">
              Version {appVersion}
            </p>
            <p
              className={`text-[10px] ${
                updateStatus.phase === "error"
                  ? "text-amber-200"
                  : "text-muted-foreground"
              }`}
            >
              {updateStatusCopy(updateStatus)}
            </p>
            {updateStatus.phase === "available" && updateStatus.notes ? (
              <p className="text-[10px] text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">
                {updateStatus.notes}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={checking || installing}
                onClick={() => {
                  void onCheckForUpdates();
                }}
                className="h-9 px-3 rounded-xl border border-border bg-background font-bold uppercase text-[10px] hover:bg-accent disabled:opacity-50"
              >
                Check for updates
              </button>
              <button
                type="button"
                disabled={!canInstall}
                onClick={() => {
                  void onInstallUpdate();
                }}
                className="h-9 px-3 rounded-xl border border-border bg-primary text-primary-foreground font-bold uppercase text-[10px] hover:opacity-90 disabled:opacity-50 disabled:bg-background disabled:text-muted-foreground"
              >
                Install and restart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
