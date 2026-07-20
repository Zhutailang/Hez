import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import LobbyPage from "./pages/LobbyPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RoomPage from "./pages/RoomPage";

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <LobbyPage />
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
  );
}
