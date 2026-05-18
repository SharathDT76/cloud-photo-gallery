import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Gallery from "@/pages/Gallery";
import "@/App.css";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function App() {
  return (
    <div className="App min-h-screen bg-[#FAFAFA] text-neutral-900 font-body">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/gallery"
            element={
              <Protected>
                <Gallery />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
