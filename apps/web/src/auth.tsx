import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type J } from "./api";

interface AuthState {
  user: J | null;
  orgs: J[];
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState>({
  user: null,
  orgs: [],
  ready: false,
  refresh: async () => {},
  logout: async () => {},
});
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<{ user: J | null; orgs: J[]; ready: boolean }>({
    user: null,
    orgs: [],
    ready: false,
  });
  const refresh = async () => {
    try {
      const me = await api("GET", "/api/auth/me");
      set({ user: me.user, orgs: me.orgs, ready: true });
    } catch {
      set({ user: null, orgs: [], ready: true });
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const logout = async () => {
    await api("POST", "/api/auth/logout");
    set({ user: null, orgs: [], ready: true });
  };
  return (
    <Ctx.Provider value={{ ...s, refresh, logout }}>{children}</Ctx.Provider>
  );
}
