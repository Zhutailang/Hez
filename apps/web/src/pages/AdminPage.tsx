import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, type AdminSettings, type LivekitControlResult, type LivekitEndpoint } from "../api";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";

function formatControl(ctrl: LivekitControlResult | null | undefined): string {
  if (!ctrl) return "";
  const parts: string[] = [];
  if (ctrl.started.length) parts.push(`已启动: ${ctrl.started.join(", ")}`);
  if (ctrl.stopped.length) parts.push(`已停止: ${ctrl.stopped.join(", ")}`);
  if (ctrl.errors.length) parts.push(`异常: ${ctrl.errors.join("；")}`);
  if (!parts.length && ctrl.skipped.length) {
    parts.push("自定义节点不会自动启停内置以外的主机（已尝试停止国内/首尔）");
  }
  return parts.join("。");
}

export default function AdminPage() {
  const { user, token, loading } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [endpoints, setEndpoints] = useState<LivekitEndpoint[]>([]);
  const [livekitUrl, setLivekitUrl] = useState("");
  const [livekitApiKey, setLivekitApiKey] = useState("");
  const [livekitApiSecret, setLivekitApiSecret] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, setPending] = useState(false);

  function applySettings(next: AdminSettings) {
    setSettings(next);
    setEndpoints(next.livekitEndpoints);
    setLivekitUrl(next.livekitUrl);
    setLivekitApiKey(next.livekitApiKey);
  }

  useEffect(() => {
    if (!token || user?.role !== "admin") return;
    api
      .getAdminSettings(token)
      .then((res) => applySettings(res.settings))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [token, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sand-100/70">正在连接 Hez…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    setOk("");
    try {
      const body: {
        livekitUrl?: string;
        livekitApiKey?: string;
        livekitApiSecret?: string;
      } = {
        livekitUrl: livekitUrl.trim(),
        livekitApiKey: livekitApiKey.trim(),
      };
      if (livekitApiSecret.trim()) {
        body.livekitApiSecret = livekitApiSecret.trim();
      }
      const res = await api.updateAdminSettings(token, body);
      applySettings(res.settings);
      setLivekitApiSecret("");
      const ctrlMsg = formatControl(res.livekitControl);
      setOk(
        ctrlMsg
          ? `已保存。${ctrlMsg}`
          : "已保存。新通话将使用所选 LiveKit 接口。",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function onAddEndpoint(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    setOk("");
    try {
      const res = await api.updateAdminSettings(token, {
        addEndpoint: { label: newLabel.trim(), url: newUrl.trim() },
      });
      applySettings(res.settings);
      setNewLabel("");
      setNewUrl("");
      setShowAdd(false);
      setOk("已添加自定义 LiveKit 接口，可在上方列表中选择。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setPending(false);
    }
  }

  async function onRemoveEndpoint(id: string) {
    if (!token) return;
    setPending(true);
    setError("");
    setOk("");
    try {
      const res = await api.updateAdminSettings(token, { removeEndpointId: id });
      applySettings(res.settings);
      setOk("已删除自定义接口。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 md:px-10">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <BrandMark />
        <Link
          to="/"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-sand-100/80 transition hover:border-pulse-400/40 hover:text-pulse-300"
        >
          返回大厅
        </Link>
      </header>

      <main className="mx-auto mt-12 max-w-3xl animate-fadeUp">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-sand-50 md:text-4xl">
          服务器设置
        </h1>
        <p className="mt-3 text-sand-100/65">
          调节后端运行参数。从列表选择 LiveKit 节点并保存后，会自动启动该节点并停止另一边内置节点。
          「国内」信令经首尔证书反代，无需再信任自签 IP。
        </p>

        <form
          onSubmit={onSave}
          className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-ink-900/55 p-6 backdrop-blur"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm text-sand-100/55">LiveKit 服务接口</label>
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="rounded-lg border border-pulse-400/35 px-3 py-1 text-xs text-pulse-300 transition hover:bg-pulse-500/10"
              >
                {showAdd ? "取消添加" : "添加自定义接口"}
              </button>
            </div>

            <div className="mt-3 space-y-2" role="radiogroup" aria-label="LiveKit 接口">
              {endpoints.map((ep) => {
                const selected = livekitUrl.toLowerCase() === ep.url.toLowerCase();
                return (
                  <div
                    key={ep.id}
                    className={`flex items-stretch gap-2 rounded-xl border px-3 py-3 transition ${
                      selected
                        ? "border-pulse-400/50 bg-pulse-500/10"
                        : "border-white/10 bg-ink-950/50 hover:border-white/20"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="radio"
                        name="livekitEndpoint"
                        className="mt-1"
                        checked={selected}
                        onChange={() => setLivekitUrl(ep.url)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sand-50">
                          {ep.label}
                          {ep.builtin ? (
                            <span className="ml-2 text-xs text-sand-100/40">内置</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-sand-100/45">
                          {ep.url}
                        </span>
                      </span>
                    </label>
                    {!ep.builtin ? (
                      <button
                        type="button"
                        title="删除自定义接口"
                        disabled={pending}
                        onClick={() => void onRemoveEndpoint(ep.id)}
                        className="shrink-0 rounded-lg px-2 text-sand-100/35 transition hover:text-red-300 disabled:opacity-50"
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {showAdd ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-white/15 bg-ink-950/40 p-4">
              <p className="text-sm text-sand-100/60">添加自定义 LiveKit 接口</p>
              <input
                className="w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-2.5 text-sm outline-none focus:border-pulse-400/60"
                placeholder="显示名称，例如：香港"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-2.5 font-mono text-sm outline-none focus:border-pulse-400/60"
                placeholder="wss://example.com"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
              <button
                type="button"
                disabled={pending || !newLabel.trim() || !newUrl.trim()}
                onClick={(e) => void onAddEndpoint(e)}
                className="w-full rounded-xl border border-pulse-400/40 py-2.5 text-sm font-semibold text-pulse-300 transition hover:bg-pulse-500/10 disabled:opacity-50"
              >
                确认添加
              </button>
            </div>
          ) : null}

          <div>
            <label className="text-sm text-sand-100/55">LiveKit API Key</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-3 font-mono text-sm outline-none focus:border-pulse-400/60"
              value={livekitApiKey}
              onChange={(e) => setLivekitApiKey(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm text-sand-100/55">LiveKit API Secret</label>
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-3 font-mono text-sm outline-none focus:border-pulse-400/60"
              placeholder={
                settings?.livekitApiSecretSet ? "已设置，留空则不修改" : "输入 Secret"
              }
              value={livekitApiSecret}
              onChange={(e) => setLivekitApiSecret(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {ok ? <p className="text-sm text-pulse-300">{ok}</p> : null}

          <button
            type="submit"
            disabled={pending || !livekitUrl}
            className="w-full rounded-xl bg-pulse-500 py-3 font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-60"
          >
            {pending ? "保存中…" : "保存设置"}
          </button>
        </form>
      </main>
    </div>
  );
}
