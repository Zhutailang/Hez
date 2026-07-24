import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import AdminPage from "./pages/AdminPage";
import LobbyPage from "./pages/LobbyPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UserSettingsPage from "./pages/UserSettingsPage";

// LiveKit is heavy — load room/lab chunks only when opened
const LabPage = lazy(() => import("./pages/LabPage"));
const RoomPage = lazy(() => import("./pages/RoomPage"));

function PageFallback() {
  return (
    <div className="min-h-screen grid place-items-center text-sand-100/70">
      加载中…
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sand-100/70">
        正在连接 Hez…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* Lab is public; accept optional trailing slash */}
        <Route path="/lab/*" element={<LabPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <LobbyPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <UserSettingsPage />
            </Protected>
          }
        />
        <Route
          path="/room/:code"
          element={
            <Protected>
              <RoomPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
