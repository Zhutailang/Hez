import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";
import WaveField from "../components/WaveField";

type DemoAccount = { username: string; displayName: string; password: string };

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    fetch("/api/runtime")
      .then((r) => r.json())
      .then((data: { demo?: boolean; demoAccounts?: DemoAccount[] }) => {
        if (data.demo && data.demoAccounts?.length) {
          setDemoAccounts(data.demoAccounts);
        }
      })
      .catch(() => undefined);
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  function fillDemo(account: DemoAccount) {
    setUsername(account.username);
    setPassword(account.password);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <WaveField />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:px-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="animate-fadeUp">
            <BrandMark size="lg" />
            <h1 className="mt-8 max-w-xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-sand-50 md:text-6xl">
              声音落进同一间房间
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-sand-100/70">
              Hez 是多端实时语音通话。注册登录后创建房间，邀请同伴即刻接通。
            </p>
          </section>

          <form
            onSubmit={onSubmit}
            className="animate-fadeUp rounded-3xl border border-white/10 bg-ink-900/70 p-8 shadow-glow backdrop-blur-md"
            style={{ animationDelay: "80ms" }}
          >
            <h2 className="font-display text-2xl text-sand-50">登录</h2>
            <p className="mt-2 text-sm text-sand-100/55">进入你的语音空间</p>

            {demoAccounts.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-pulse-400/25 bg-pulse-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-pulse-300/80">Demo 假账号</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className="rounded-lg border border-white/10 bg-ink-950/50 px-2.5 py-1 text-xs text-sand-100/80 transition hover:border-pulse-400/40"
                    >
                      {account.username}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-sand-100/45">
                  密码均为 demo123 · 房间 DEMO01 / DEMO02 / LAB777
                </p>
              </div>
            ) : null}

            <label className="mt-8 block text-sm text-sand-100/70">
              用户名
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 outline-none transition focus:border-pulse-400/60"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
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
                autoComplete="current-password"
                required
              />
            </label>

            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-8 w-full rounded-xl bg-pulse-500 px-4 py-3 font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-60"
            >
              {pending ? "登录中…" : "进入 Hez"}
            </button>

            <p className="mt-5 text-center text-sm text-sand-100/55">
              还没有账号？{" "}
              <Link className="text-pulse-300 hover:underline" to="/register">
                注册
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
