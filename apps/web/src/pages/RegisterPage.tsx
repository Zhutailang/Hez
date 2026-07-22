import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";
import WaveField from "../components/WaveField";

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await register(username.trim(), displayName.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <WaveField />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fadeUp mb-6 sm:mb-8">
          <BrandMark />
        </div>
        <form
          onSubmit={onSubmit}
          className="animate-fadeUp rounded-3xl border border-white/10 bg-ink-900/70 p-6 shadow-glow backdrop-blur-md sm:p-8"
        >
          <h1 className="font-display text-3xl text-sand-50">创建 Hez 账号</h1>
          <p className="mt-2 text-sm text-sand-100/55">几秒后即可发起多人语音通话</p>

          <label className="mt-8 block text-sm text-sand-100/70">
            用户名
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 outline-none transition focus:border-pulse-400/60"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="字母数字下划线"
              required
            />
          </label>

          <label className="mt-4 block text-sm text-sand-100/70">
            显示名称
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 outline-none transition focus:border-pulse-400/60"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="通话里别人看到的名字"
              required
            />
          </label>

          <label className="mt-4 block text-sm text-sand-100/70">
            密码
            <input
              type="password"
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 outline-none transition focus:border-pulse-400/60"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>

          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-8 w-full rounded-xl bg-pulse-500 px-4 py-3 font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-60"
          >
            {pending ? "创建中…" : "注册并进入"}
          </button>

          <p className="mt-5 text-center text-sm text-sand-100/55">
            已有账号？{" "}
            <Link className="text-pulse-300 hover:underline" to="/login">
              登录
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
