import { FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import BrandMark from "../components/BrandMark";

const MAX_AVATAR_SIZE = 512;

export default function UserSettingsPage() {
  const { user, token, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickAvatar() {
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);

    // Validate type
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      setMsg({ type: "err", text: "仅支持 JPG/PNG/GIF/WEBP 格式" });
      return;
    }

    // Validate size (client-side dimension check)
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width > MAX_AVATAR_SIZE || img.height > MAX_AVATAR_SIZE) {
        setMsg({ type: "err", text: `头像尺寸不能超过 ${MAX_AVATAR_SIZE}×${MAX_AVATAR_SIZE}（当前 ${img.width}×${img.height}）` });
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMsg({ type: "err", text: "无法读取图片" });
    };
    img.src = url;
  }

  async function uploadAvatar() {
    if (!avatarFile || !token) return;
    setUploading(true);
    setMsg(null);
    try {
      const res = await api.uploadAvatar(token, avatarFile);
      updateUser(res.user);
      setAvatarFile(null);
      setAvatarPreview(null);
      setMsg({ type: "ok", text: "头像已更新" });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "上传失败" });
    } finally {
      setUploading(false);
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!token || !displayName.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.updateProfile(token, { displayName: displayName.trim() });
      updateUser(res.user);
      setMsg({ type: "ok", text: "名称已更新" });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  const currentAvatarUrl = user?.avatarUrl || null;

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(61,214,184,0.12),transparent_42%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-between px-1">
        <BrandMark />
        <Link to="/" className="text-sm text-sand-100/60 hover:text-pulse-300">
          ← 返回大厅
        </Link>
      </header>

      <main className="relative z-10 mx-auto mt-6 w-full max-w-lg flex-1 overflow-y-auto">
        <h1 className="font-display text-2xl text-sand-50">用户设置</h1>

        {msg && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              msg.type === "ok"
                ? "border border-pulse-400/30 bg-pulse-500/10 text-pulse-200"
                : "border border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Avatar section */}
        <section className="mt-8">
          <h2 className="text-sm font-medium text-sand-100/70">头像</h2>
          <div className="mt-3 flex items-center gap-5">
            <button
              type="button"
              onClick={pickAvatar}
              className="group relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 ring-white/15 transition hover:ring-pulse-400/50"
              title="点击更换头像"
            >
              {avatarPreview || currentAvatarUrl ? (
                <img
                  src={avatarPreview || currentAvatarUrl || undefined}
                  alt="头像"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3dd6b8] to-[#149882] text-2xl font-bold text-ink-950">
                  {user?.displayName?.slice(0, 1).toUpperCase() || "?"}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                <span className="text-xs text-white">更换</span>
              </div>
            </button>

            <div className="flex flex-col gap-2">
              <p className="text-xs text-sand-100/45">
                支持 JPG/PNG/GIF/WEBP，最大 {MAX_AVATAR_SIZE}×{MAX_AVATAR_SIZE}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={pickAvatar}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-sand-100/70 transition hover:border-pulse-400/40 hover:text-pulse-300"
                >
                  选择文件
                </button>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={uploadAvatar}
                    disabled={uploading}
                    className="rounded-lg bg-pulse-500 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-50"
                  >
                    {uploading ? "上传中…" : "上传头像"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
        </section>

        {/* Display name section */}
        <section className="mt-10">
          <h2 className="text-sm font-medium text-sand-100/70">显示名称</h2>
          <form onSubmit={saveName} className="mt-3 flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="显示名称"
              className="flex-1 rounded-xl border border-white/10 bg-ink-950/70 px-4 py-2.5 text-sm text-sand-50 outline-none transition placeholder:text-sand-100/30 focus:border-pulse-400/50"
            />
            <button
              type="submit"
              disabled={saving || !displayName.trim() || displayName.trim() === user?.displayName}
              className="rounded-xl bg-pulse-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-40"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </form>
        </section>

        {/* Account info */}
        <section className="mt-10 border-t border-white/8 pt-6">
          <h2 className="text-sm font-medium text-sand-100/70">账户信息</h2>
          <div className="mt-3 space-y-2 text-sm text-sand-100/50">
            <p>用户名：<span className="text-sand-100/80">{user?.username}</span></p>
            <p>角色：<span className="text-sand-100/80">{user?.role === "admin" ? "管理员" : "普通用户"}</span></p>
          </div>
        </section>
      </main>
    </div>
  );
}
