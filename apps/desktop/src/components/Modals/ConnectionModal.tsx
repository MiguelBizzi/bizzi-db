import React, { useMemo, useState } from "react";
import { Environment, SaveConnectionInput } from "../../types";
import { SUPPORTED_DIALECTS } from "@db/database";
import { ShieldCheck, X, AlertCircle } from "lucide-react";
import { Select, SelectOption } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { PostgresLogo } from "../icons/PostgresLogo";

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: SaveConnectionInput) => Promise<void>;
  onTest: (
    input: SaveConnectionInput,
  ) => Promise<{ ok: boolean; message: string }>;
}

const ENVIRONMENT_OPTIONS: SelectOption<Environment>[] = [
  { value: "development", label: "Development", dotClassName: "bg-blue-400" },
  { value: "staging", label: "Staging", dotClassName: "bg-amber-400" },
  { value: "production", label: "Production", dotClassName: "bg-emerald-400" },
];

const fieldClass =
  "h-9 w-full px-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary";

type FieldName =
  | "name"
  | "host"
  | "port"
  | "databaseName"
  | "username"
  | "password"
  | "poolSize";

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onTest,
}) => {
  const [name, setName] = useState("Local PostgreSQL");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5432);
  const [username, setUsername] = useState("postgres");
  const [databaseName, setDatabaseName] = useState("postgres");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [poolSize, setPoolSize] = useState(8);
  const [environment, setEnvironment] = useState<Environment>("development");
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [attempted, setAttempted] = useState(false);

  const errors = useMemo(() => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!name.trim()) next.name = "Required";
    if (!host.trim()) next.host = "Required";
    if (!Number.isFinite(port) || port < 1 || port > 65535)
      next.port = "Enter a port from 1 to 65535";
    if (!databaseName.trim()) next.databaseName = "Required";
    if (!username.trim()) next.username = "Required";
    if (!password) next.password = "Required";
    if (!Number.isFinite(poolSize) || poolSize < 1 || poolSize > 32) {
      next.poolSize = "Enter a pool size from 1 to 32";
    }
    return next;
  }, [name, host, port, databaseName, username, password, poolSize]);

  const isValid = Object.keys(errors).length === 0;
  const showError = (field: FieldName) =>
    (touched[field] || attempted) && errors[field];
  const markTouched = (field: FieldName) =>
    setTouched((current) => ({ ...current, [field]: true }));

  if (!isOpen) return null;

  const input = (): SaveConnectionInput => ({
    name: name.trim(),
    dialect: "PostgreSQL",
    host: host.trim(),
    port,
    database: databaseName.trim(),
    user: username.trim(),
    password,
    ssl,
    poolSize,
    environment,
  });

  const handleTestConnection = async () => {
    setAttempted(true);
    if (!isValid) return;
    setIsTesting(true);
    setTestResult(null);
    setTestOk(null);
    try {
      const res = await onTest(input());
      setTestOk(res.ok);
      setTestResult(res.message);
    } catch (e: unknown) {
      setTestOk(false);
      setTestResult(e instanceof Error ? e.message : "Test failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!isValid) return;
    setIsSaving(true);
    try {
      await onSave(input());
      onClose();
    } catch (err: unknown) {
      setTestOk(false);
      setTestResult(
        err instanceof Error ? err.message : "Failed to save connection",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans select-none text-foreground">
      <div className="w-full max-w-lg bg-popover border border-border rounded-2xl shadow-2xl flex flex-col text-popover-foreground">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60 rounded-t-2xl">
          <div className="flex items-center gap-2.5 font-mono">
            <PostgresLogo className="w-5 h-5" />
            <span className="text-sm font-bold text-foreground">
              New Database Connection Profile
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="p-5 space-y-4 font-mono text-xs"
          noValidate
        >
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
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markTouched("name");
              }}
              onBlur={() => markTouched("name")}
              aria-invalid={Boolean(showError("name"))}
              className={`${fieldClass} ${showError("name") ? "border-destructive focus:border-destructive" : ""}`}
            />
            {showError("name") && (
              <p className="text-[10px] text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Host / Endpoint
                <RequiredMark />
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => {
                  setHost(e.target.value);
                  markTouched("host");
                }}
                onBlur={() => markTouched("host")}
                aria-invalid={Boolean(showError("host"))}
                className={`${fieldClass} ${showError("host") ? "border-destructive focus:border-destructive" : ""}`}
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
                value={Number.isFinite(port) ? port : ""}
                onChange={(e) => {
                  setPort(
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                  );
                  markTouched("port");
                }}
                onBlur={() => markTouched("port")}
                aria-invalid={Boolean(showError("port"))}
                className={`${fieldClass} ${showError("port") ? "border-destructive focus:border-destructive" : ""}`}
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
                value={databaseName}
                onChange={(e) => {
                  setDatabaseName(e.target.value);
                  markTouched("databaseName");
                }}
                onBlur={() => markTouched("databaseName")}
                aria-invalid={Boolean(showError("databaseName"))}
                className={`${fieldClass} ${showError("databaseName") ? "border-destructive focus:border-destructive" : ""}`}
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
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  markTouched("username");
                }}
                onBlur={() => markTouched("username")}
                aria-invalid={Boolean(showError("username"))}
                className={`${fieldClass} ${showError("username") ? "border-destructive focus:border-destructive" : ""}`}
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
              <RequiredMark />
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                markTouched("password");
              }}
              onBlur={() => markTouched("password")}
              aria-invalid={Boolean(showError("password"))}
              className={`${fieldClass} ${showError("password") ? "border-destructive focus:border-destructive" : ""}`}
            />
            {showError("password") && (
              <p className="text-[10px] text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_auto] gap-3">
            <div className="space-y-1.5 min-w-0">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Environment
              </label>
              <Select
                value={environment}
                options={ENVIRONMENT_OPTIONS}
                onChange={setEnvironment}
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
                value={Number.isFinite(poolSize) ? poolSize : ""}
                onChange={(e) => {
                  setPoolSize(
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                  );
                  markTouched("poolSize");
                }}
                onBlur={() => markTouched("poolSize")}
                aria-invalid={Boolean(showError("poolSize"))}
                className={`${fieldClass} ${showError("poolSize") ? "border-destructive focus:border-destructive" : ""}`}
              />
              {showError("poolSize") && (
                <p className="text-[10px] text-destructive">
                  {errors.poolSize}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="connection-ssl"
                className="text-[10px] font-bold uppercase text-muted-foreground"
              >
                SSL
              </label>
              <div className="h-9 px-3 flex items-center gap-2 bg-background border border-border rounded-xl">
                <Switch
                  id="connection-ssl"
                  checked={ssl}
                  onCheckedChange={setSsl}
                />
                <span
                  className={`font-bold uppercase text-[10px] ${
                    ssl ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {ssl ? "On" : "Off"}
                </span>
              </div>
            </div>
          </div>

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

          <div className="pt-2 flex items-center justify-between">
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
                {isSaving ? "Connecting..." : "Connect Database"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
