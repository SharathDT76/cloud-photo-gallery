import { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthContext = createContext(null);
const STORAGE_KEY = "cpg.tokens";

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setTokens(parsed);
        if (parsed?.id_token) {
          const payload = decodeJwt(parsed.id_token);
          if (payload?.exp && payload.exp * 1000 > Date.now()) {
            setUser({ sub: payload.sub, email: payload.email });
          } else {
            localStorage.removeItem(STORAGE_KEY);
            setTokens(null);
          }
        }
      }
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  const login = useCallback((t) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    setTokens(t);
    const payload = decodeJwt(t.id_token);
    setUser({ sub: payload.sub, email: payload.email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTokens(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ tokens, user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}
