import React from "react";
import { OverlayPresence } from "../ui/OverlayPresence";
import { Modal, ModalPanel } from "../ui/Modal";
import { Settings, X, AlertTriangle } from "lucide-react";
import { currentPlatform } from "../../lib/commands/shortcutLabel";
import { secretStoreLongName, secretStoreName } from "../../lib/platformCopy";
import { Switch } from "../ui/Switch";
import { Select, type SelectOption } from "../ui/Select";
import type { MotionPreference } from "../../lib/motionPreference";
import {
  canRestartToUpdate,
  downloadPercent,
  type AppUpdateStatus,
} from "../../lib/appUpdate";

interface SettingsModalProps {
  isOpen: boolean;
  keychainEnabled: boolean;
  keychainAvailable: boolean;
  appVersion: string;
  updateStatus: AppUpdateStatus;
  motionPreference: MotionPreference;
  onChangeMotionPreference: (pref: MotionPreference) => void;
  onClose: () => void;
  onToggleKeychain: (enabled: boolean) => Promise<void> | void;
  onCheckForUpdates: () => Promise<void> | void;
  onRestartToUpdate: () => Promise<void> | void;
}

const MOTION_OPTIONS: SelectOption<MotionPreference>[] = [
  { value: "on", label: "On" },
  { value: "system", label: "Match system" },
  { value: "reduced", label: "Reduced" },
];

function updateStatusCopy(status: AppUpdateStatus): string {
  switch (status.phase) {
    case "idle":
      return "Bizzi DB checks for updates automatically and downloads them in the background.";
    case "checking":
      return "Checking for updates…";
    case "upToDate":
      return "You're on the latest version.";
    case "available":
      return `Version ${status.version} is available.`;
    case "ready":
      return `Version ${status.version} is downloaded. Restart to finish updating.`;
    case "downloading": {
      const percent = downloadPercent(status.received, status.total);
      return percent == null
        ? "Downloading update…"
        : `Downloading update… ${percent}%`;
    }
    case "installing":
      return "Installing update. The app will restart.";
    case "error":
      return `${
        status.stage === "check"
          ? "Couldn't check for updates"
          : status.stage === "download"
            ? "Couldn't download the update"
            : "Couldn't install the update"
      }: ${status.message}`;
  }
}

const SettingsModalBody: React.FC<SettingsModalProps> = ({
  isOpen,
  keychainEnabled,
  keychainAvailable,
  appVersion,
  updateStatus,
  motionPreference,
  onChangeMotionPreference,
  onClose,
  onToggleKeychain,
  onCheckForUpdates,
  onRestartToUpdate,
}) => {
  if (!isOpen) return null;

  const platform = currentPlatform();
  const secretStore = secretStoreName(platform);
  const storeLabel = secretStore.charAt(0).toUpperCase() + secretStore.slice(1);
  // An enabled toggle stays usable so the user can turn it off when the keyring disappears.
  const toggleDisabled = !keychainAvailable && !keychainEnabled;

  const checking = updateStatus.phase === "checking";
  const busy =
    checking ||
    updateStatus.phase === "available" ||
    updateStatus.phase === "downloading" ||
    updateStatus.phase === "ready" ||
    updateStatus.phase === "installing";
  const canRestart = canRestartToUpdate(updateStatus);

  return (
    <Modal className="font-sans select-none text-foreground">
      <ModalPanel className="w-full max-w-lg bg-popover border border-border rounded-2xl shadow-2xl flex flex-col text-popover-foreground">
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
              {storeLabel}
            </label>
            <div className="h-9 px-3 flex items-center gap-2 bg-background border border-border rounded-xl">
              <Switch
                id="settings-keychain"
                checked={keychainEnabled}
                disabled={toggleDisabled}
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
              When on, passwords and SSH secrets are stored in the{" "}
              {secretStoreLongName(platform)}. When off, they are stored locally in
              an owner-only file.
            </p>
            {toggleDisabled && (
              <p className="text-[10px] text-muted-foreground">
                No {secretStoreLongName(platform)} was found. Passwords are
                stored in a local file only you can read.
              </p>
            )}
          </div>

          {!keychainEnabled && (
            <div className="p-2.5 rounded-xl border text-xs flex items-center gap-2 bg-amber-500/10 border-amber-500/30 text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Local secret storage is less secure. Enable the {secretStore} to
                protect credentials with the OS.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="settings-motion"
              className="text-[10px] font-bold uppercase text-muted-foreground"
            >
              Motion
            </label>
            <Select
              id="settings-motion"
              size="sm"
              value={motionPreference}
              options={MOTION_OPTIONS}
              onChange={onChangeMotionPreference}
            />
            <p className="text-[10px] text-muted-foreground">
              Animations are on by default. Choose Match system to follow your
              operating system's reduce-motion setting, or Reduced to turn most
              animation off.
            </p>
          </div>

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
            {(updateStatus.phase === "available" ||
              updateStatus.phase === "downloading" ||
              updateStatus.phase === "ready") &&
            updateStatus.notes ? (
              <p className="text-[10px] text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">
                {updateStatus.notes}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onCheckForUpdates();
                }}
                className="pressable h-9 px-3 rounded-xl border border-border bg-background font-bold uppercase text-[10px] hover:bg-accent disabled:opacity-50"
              >
                {updateStatus.phase === "error" ? "Retry" : "Check for updates"}
              </button>
              <button
                type="button"
                disabled={!canRestart}
                onClick={() => {
                  void onRestartToUpdate();
                }}
                className="pressable h-9 px-3 rounded-xl border border-border bg-primary text-primary-foreground font-bold uppercase text-[10px] hover:opacity-90 disabled:opacity-50 disabled:bg-background disabled:text-muted-foreground"
              >
                Restart to update
              </button>
            </div>
          </div>
        </div>
      </ModalPanel>
    </Modal>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = (props) => (
  <OverlayPresence isOpen={props.isOpen}>
    <SettingsModalBody {...props} />
  </OverlayPresence>
);
