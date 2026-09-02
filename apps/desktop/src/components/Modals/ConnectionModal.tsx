import React, { useEffect, useMemo, useState } from "react";
import {
  ConnectionFolder,
  ConnectionProfile,
  Environment,
  SaveConnectionInput,
  SshAuthMethod,
  SslMode,
} from "../../types";
import { SUPPORTED_DIALECTS } from "@db/database";
import { ShieldCheck, X, AlertCircle, AlertTriangle, FolderOpen } from "lucide-react";
import { Select, SelectOption } from "../ui/Select";
import { PostgresLogo } from "../icons/PostgresLogo";
import {
  defaultSslForHost,
  warnInsecureConnection,
} from "../../lib/connectionSecurity";
import {
  connectionFormErrors,
  connectionFormFromProfile,
  connectionFormToInput,
  connectionModalCopy,
  defaultConnectionForm,
  firstTabWithErrors,
  type ConnectionFormField,
  type ConnectionFormValues,
  type ConnectionModalTab,
} from "../../lib/connectionForm";
import {
  applyParsedConnection,
  parseConnectionString,
} from "../../lib/connectionString";
import { invokeErrorMessage } from "../../lib/invokeError";

interface ConnectionModalProps {
  isOpen: boolean;
  editingProfile?: ConnectionProfile | null;
  folders: ConnectionFolder[];
  defaultFolderId?: string | null;
  keychainEnabled: boolean;
  onClose: () => void;
  onSave: (input: SaveConnectionInput) => Promise<void>;
  onTest: (
    input: SaveConnectionInput,
  ) => Promise<{ ok: boolean; message: string }>;
  onEnableKeychain: () => Promise<void>;
  onPickPrivateKey: () => Promise<string | null>;
}

const ENVIRONMENT_OPTIONS: SelectOption<Environment>[] = [
  { value: "development", label: "Development", dotClassName: "bg-blue-400" },
  { value: "staging", label: "Staging", dotClassName: "bg-amber-400" },
  { value: "production", label: "Production", dotClassName: "bg-emerald-400" },
];

const SSL_OPTIONS: SelectOption<SslMode>[] = [
  { value: "disabled", label: "Disabled" },
  { value: "require", label: "Require" },
  { value: "enabled", label: "Enabled" },
];

const SSH_MODE_OPTIONS: SelectOption<"off" | "on">[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "Over SSH" },
];

const SSH_AUTH_OPTIONS: SelectOption<SshAuthMethod>[] = [
  { value: "password", label: "Password" },
  { value: "privateKey", label: "Private Key" },
];

const fieldClass =
  "h-9 w-full px-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary";

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function formFromOpenState(
  profile: ConnectionProfile | null | undefined,
  defaultFolderId?: string | null,
): ConnectionFormValues {
  if (profile) return connectionFormFromProfile(profile);
  const form = defaultConnectionForm();
  return defaultFolderId ? { ...form, folderId: defaultFolderId } : form;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  editingProfile,
  folders,
  defaultFolderId,
  keychainEnabled,
  onClose,
  onSave,
  onTest,
  onEnableKeychain,
  onPickPrivateKey,
}) => {
  const isEdit = Boolean(editingProfile);
  const copy = connectionModalCopy(isEdit);
  const [form, setForm] = useState<ConnectionFormValues>(defaultConnectionForm);
  const [connectionString, setConnectionString] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [tab, setTab] = useState<ConnectionModalTab>("connection");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [touched, setTouched] = useState<
    Partial<Record<ConnectionFormField, boolean>>
  >({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(formFromOpenState(editingProfile, defaultFolderId));
    setConnectionString("");
    setParseError(null);
    setTab("connection");
    setTouched({});
    setAttempted(false);
    setTestOk(null);
    setTestResult(null);
    setIsTesting(false);
    setIsSaving(false);
  }, [isOpen, editingProfile, defaultFolderId]);

  const errors = useMemo(
    () =>
      connectionFormErrors(form, {
        passwordRequired: !isEdit,
        keychainEnabled,
      }),
    [form, isEdit, keychainEnabled],
  );
  const isValid = Object.keys(errors).length === 0;
  const sslWarning = warnInsecureConnection(
    form.host,
    form.sslMode,
    form.environment,
  );
  const showError = (field: ConnectionFormField) =>
    (touched[field] || attempted) && errors[field];
  const markTouched = (field: ConnectionFormField) =>
    setTouched((current) => ({ ...current, [field]: true }));
  const patchForm = (patch: Partial<ConnectionFormValues>) =>
    setForm((current) => ({ ...current, ...patch }));

  const handleConnectionStringChange = (raw: string) => {
    setConnectionString(raw);
    const result = parseConnectionString(raw);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    if (result.empty) {
      setParseError(null);
      return;
    }
    setParseError(null);
    setForm((current) => applyParsedConnection(current, result.value));
  };

  if (!isOpen) return null;

  const input = (): SaveConnectionInput =>
    connectionFormToInput(form, editingProfile?.id);

  const revealInvalidTab = () => {
    const next = firstTabWithErrors(errors);
    if (next) setTab(next);
  };

  const handleTestConnection = async () => {
    setAttempted(true);
    if (!isValid) {
      revealInvalidTab();
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setTestOk(null);
    try {
      const res = await onTest(input());
      setTestOk(res.ok);
      setTestResult(res.message);
    } catch (e: unknown) {
      setTestOk(false);
      setTestResult(invokeErrorMessage(e, "Test failed"));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!isValid) {
      revealInvalidTab();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(input());
      onClose();
    } catch (err: unknown) {
      setTestOk(false);
      setTestResult(invokeErrorMessage(err, "Failed to save connection"));
    } finally {
      setIsSaving(false);
    }
  };

  const tabClass = (id: ConnectionModalTab) =>
    `flex-1 py-2.5 px-4 font-semibold border-b-2 transition-colors ${
      tab === id
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  const fieldErrorClass = (field: ConnectionFormField) =>
    `${fieldClass} ${showError(field) ? "border-destructive focus:border-destructive" : ""}`;

  return (
    <div className="connection-modal fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans select-none text-foreground">
      <div className="w-full max-w-xl bg-popover border border-border rounded-2xl shadow-2xl flex flex-col text-popover-foreground max-h-[90vh]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60 rounded-t-2xl">
          <div className="flex items-center gap-2.5 font-mono">
            <PostgresLogo className="w-5 h-5" />
            <span className="text-sm font-bold text-foreground">
              {copy.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex w-full border-b border-border bg-background font-mono text-xs">
          <button
            type="button"
            onClick={() => setTab("connection")}
            className={tabClass("connection")}
          >
            Connection
          </button>
          <button
            type="button"
            onClick={() => setTab("security")}
            className={tabClass("security")}
          >
            SSH / SSL
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="flex flex-col min-h-0 font-mono text-xs"
          noValidate
        >
          <div className="p-5 space-y-4 overflow-y-auto max-h-[min(70vh,32rem)]">
            {tab === "connection" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Connection string
                  </label>
                  <textarea
                    value={connectionString}
                    onChange={(e) => handleConnectionStringChange(e.target.value)}
                    placeholder="Paste your connection string here..."
                    rows={3}
                    aria-invalid={Boolean(parseError)}
                    className={`min-h-18 w-full px-3 py-2 bg-background border rounded-xl text-foreground font-mono text-xs resize-y focus:outline-none ${
                      parseError
                        ? "border-destructive focus:border-destructive"
                        : "border-border focus:border-primary"
                    }`}
                  />
                  {parseError && (
                    <p className="text-[10px] text-destructive">{parseError}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0">
                    or fill in manually
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Database Engine
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {SUPPORTED_DIALECTS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-label={d.label}
                        title={d.label}
                        className="p-2.5 rounded-xl border font-bold bg-primary/20 border-primary text-primary flex items-center justify-center gap-2"
                      >
                        <PostgresLogo className="w-5 h-5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Connection Display Name
                    <RequiredMark />
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      patchForm({ name: e.target.value });
                      markTouched("name");
                    }}
                    onBlur={() => markTouched("name")}
                    aria-invalid={Boolean(showError("name"))}
                    className={fieldErrorClass("name")}
                  />
                  {showError("name") && (
                    <p className="text-[10px] text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Folder
                  </label>
                  <Select
                    value={form.folderId}
                    options={[
                      { value: "", label: "Ungrouped" },
                      ...folders.map((folder) => ({
                        value: folder.id,
                        label: folder.name,
                      })),
                    ]}
                    onChange={(folderId) => patchForm({ folderId })}
                    placement="bottom"
                    aria-label="Folder"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Host / Endpoint
                      <RequiredMark />
                    </label>
                    <input
                      type="text"
                      value={form.host}
                      onChange={(e) => {
                        const next = e.target.value;
                        patchForm({
                          host: next,
                          sslMode: defaultSslForHost(next),
                        });
                        markTouched("host");
                      }}
                      onBlur={() => markTouched("host")}
                      aria-invalid={Boolean(showError("host"))}
                      className={fieldErrorClass("host")}
                    />
                    {showError("host") && (
                      <p className="text-[10px] text-destructive">{errors.host}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Port
                      <RequiredMark />
                    </label>
                    <input
                      type="number"
                      value={Number.isFinite(form.port) ? form.port : ""}
                      onChange={(e) => {
                        patchForm({
                          port:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        });
                        markTouched("port");
                      }}
                      onBlur={() => markTouched("port")}
                      aria-invalid={Boolean(showError("port"))}
                      className={fieldErrorClass("port")}
                    />
                    {showError("port") && (
                      <p className="text-[10px] text-destructive">{errors.port}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Database Name
                      <RequiredMark />
                    </label>
                    <input
                      type="text"
                      value={form.databaseName}
                      onChange={(e) => {
                        patchForm({ databaseName: e.target.value });
                        markTouched("databaseName");
                      }}
                      onBlur={() => markTouched("databaseName")}
                      aria-invalid={Boolean(showError("databaseName"))}
                      className={fieldErrorClass("databaseName")}
                    />
                    {showError("databaseName") && (
                      <p className="text-[10px] text-destructive">
                        {errors.databaseName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Username
                      <RequiredMark />
                    </label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => {
                        patchForm({ username: e.target.value });
                        markTouched("username");
                      }}
                      onBlur={() => markTouched("username")}
                      aria-invalid={Boolean(showError("username"))}
                      className={fieldErrorClass("username")}
                    />
                    {showError("username") && (
                      <p className="text-[10px] text-destructive">
                        {errors.username}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Password
                    {!isEdit && <RequiredMark />}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    placeholder={copy.passwordHint}
                    onChange={(e) => {
                      patchForm({ password: e.target.value });
                      markTouched("password");
                    }}
                    onBlur={() => markTouched("password")}
                    aria-invalid={Boolean(showError("password"))}
                    className={fieldErrorClass("password")}
                  />
                  {showError("password") && (
                    <p className="text-[10px] text-destructive">
                      {errors.password}
                    </p>
                  )}
                  {isEdit && copy.passwordHint && !showError("password") && (
                    <p className="text-[10px] text-muted-foreground">
                      {copy.passwordHint}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Environment
                    </label>
                    <Select
                      value={form.environment}
                      options={ENVIRONMENT_OPTIONS}
                      onChange={(environment) => patchForm({ environment })}
                      placement="top"
                      aria-label="Environment"
                    />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">
                      Pool Size
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={Number.isFinite(form.poolSize) ? form.poolSize : ""}
                      onChange={(e) => {
                        patchForm({
                          poolSize:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        });
                        markTouched("poolSize");
                      }}
                      onBlur={() => markTouched("poolSize")}
                      aria-invalid={Boolean(showError("poolSize"))}
                      className={fieldErrorClass("poolSize")}
                    />
                    {showError("poolSize") && (
                      <p className="text-[10px] text-destructive">
                        {errors.poolSize}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === "security" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    SSL mode
                  </label>
                  <Select
                    value={form.sslMode}
                    options={SSL_OPTIONS}
                    onChange={(sslMode) => patchForm({ sslMode })}
                    aria-label="SSL mode"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Disabled skips encryption. Require encrypts and accepts any
                    certificate. Enabled encrypts and verifies the certificate
                    chain.
                  </p>
                </div>

                {sslWarning && (
                  <div className="p-2.5 rounded-xl border text-xs flex items-center gap-2 bg-amber-500/10 border-amber-500/30 text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{sslWarning}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    SSH tunnel
                  </label>
                  <Select
                    value={form.sshEnabled ? "on" : "off"}
                    options={SSH_MODE_OPTIONS}
                    onChange={(mode) => patchForm({ sshEnabled: mode === "on" })}
                    aria-label="SSH tunnel"
                  />
                </div>

                {form.sshEnabled && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">
                          SSH Server
                          <RequiredMark />
                        </label>
                        <input
                          type="text"
                          value={form.sshHost}
                          onChange={(e) => {
                            patchForm({ sshHost: e.target.value });
                            markTouched("sshHost");
                          }}
                          onBlur={() => markTouched("sshHost")}
                          aria-invalid={Boolean(showError("sshHost"))}
                          className={fieldErrorClass("sshHost")}
                        />
                        {showError("sshHost") && (
                          <p className="text-[10px] text-destructive">
                            {errors.sshHost}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">
                          Port
                          <RequiredMark />
                        </label>
                        <input
                          type="number"
                          value={Number.isFinite(form.sshPort) ? form.sshPort : ""}
                          onChange={(e) => {
                            patchForm({
                              sshPort:
                                e.target.value === ""
                                  ? Number.NaN
                                  : Number(e.target.value),
                            });
                            markTouched("sshPort");
                          }}
                          onBlur={() => markTouched("sshPort")}
                          aria-invalid={Boolean(showError("sshPort"))}
                          className={fieldErrorClass("sshPort")}
                        />
                        {showError("sshPort") && (
                          <p className="text-[10px] text-destructive">
                            {errors.sshPort}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">
                        Username
                        <RequiredMark />
                      </label>
                      <input
                        type="text"
                        value={form.sshUser}
                        onChange={(e) => {
                          patchForm({ sshUser: e.target.value });
                          markTouched("sshUser");
                        }}
                        onBlur={() => markTouched("sshUser")}
                        aria-invalid={Boolean(showError("sshUser"))}
                        className={fieldErrorClass("sshUser")}
                      />
                      {showError("sshUser") && (
                        <p className="text-[10px] text-destructive">
                          {errors.sshUser}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">
                        Authentication
                      </label>
                      <Select
                        value={form.sshAuth}
                        options={SSH_AUTH_OPTIONS}
                        onChange={(sshAuth) => patchForm({ sshAuth })}
                        aria-label="SSH authentication"
                      />
                    </div>

                    {form.sshAuth === "password" ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">
                          SSH Password
                          {!isEdit && <RequiredMark />}
                        </label>
                        <input
                          type="password"
                          value={form.sshPassword}
                          placeholder={
                            isEdit
                              ? "Leave blank to keep the current password"
                              : undefined
                          }
                          onChange={(e) => {
                            patchForm({ sshPassword: e.target.value });
                            markTouched("sshPassword");
                          }}
                          onBlur={() => markTouched("sshPassword")}
                          aria-invalid={Boolean(showError("sshPassword"))}
                          className={fieldErrorClass("sshPassword")}
                        />
                        {showError("sshPassword") && (
                          <p className="text-[10px] text-destructive">
                            {errors.sshPassword}
                          </p>
                        )}
                        {!keychainEnabled && (
                          <div className="p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 bg-amber-500/10 border-amber-500/30 text-amber-200">
                            <span>
                              SSH password authentication requires the system
                              keychain.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                void onEnableKeychain();
                              }}
                              className="px-2 py-1 rounded-lg bg-primary text-primary-foreground font-bold shrink-0"
                            >
                              Enable keychain
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Private Key
                            <RequiredMark />
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={form.sshKeyPath}
                              onChange={(e) => {
                                patchForm({ sshKeyPath: e.target.value });
                                markTouched("sshKeyPath");
                              }}
                              onBlur={() => markTouched("sshKeyPath")}
                              aria-invalid={Boolean(showError("sshKeyPath"))}
                              className={fieldErrorClass("sshKeyPath")}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const path = await onPickPrivateKey();
                                if (path) {
                                  patchForm({ sshKeyPath: path });
                                  markTouched("sshKeyPath");
                                }
                              }}
                              className="h-9 px-3 rounded-xl bg-muted hover:bg-accent text-foreground font-bold border border-border shrink-0 inline-flex items-center gap-1.5"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              Import
                            </button>
                          </div>
                          {showError("sshKeyPath") && (
                            <p className="text-[10px] text-destructive">
                              {errors.sshKeyPath}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Passphrase
                          </label>
                          <input
                            type="password"
                            value={form.sshPassphrase}
                            placeholder={
                              isEdit
                                ? "Leave blank to keep the current passphrase"
                                : undefined
                            }
                            onChange={(e) => {
                              patchForm({ sshPassphrase: e.target.value });
                              markTouched("sshPassphrase");
                            }}
                            onBlur={() => markTouched("sshPassphrase")}
                            className={fieldClass}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {testResult && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                  testOk
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
              >
                {testOk ? (
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult}</span>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !isValid}
              title={!isValid ? "Fill in all required fields" : undefined}
              className="px-3 py-2 rounded-xl bg-muted hover:bg-accent text-foreground font-bold border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isTesting ? "Testing..." : "Test Connection"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !isValid}
                title={!isValid ? "Fill in all required fields" : undefined}
                className="px-4 py-2 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold shadow-md transition-colors disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isSaving ? copy.submitting : copy.submit}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
