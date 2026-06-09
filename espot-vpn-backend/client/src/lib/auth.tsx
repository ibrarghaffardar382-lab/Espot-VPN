import { createContext, useContext, useState, type ReactNode } from "react";
import { api, setToken, getToken } from "./api";

interface AuthState {
  username: string | null;
  loggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    getToken() ? localStorage.getItem("espot_admin_user") : null,
  );

  async function login(user: string, password: string) {
    const res = await api<{ token: string; username: string }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password }),
    });
    setToken(res.token);
    localStorage.setItem("espot_admin_user", res.username);
    setUsername(res.username);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("espot_admin_user");
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, loggedIn: !!username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
