import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Server and PIC detail drawers are driven by URL search params (?server=id / ?pic=id)
 * so every App → Server → PIC hop is deep-linkable and the back button works.
 */
interface InfraNav {
  serverId: string | null;
  picId: string | null;
  openServer: (id: string) => void;
  openPic: (id: string) => void;
  closeServer: () => void;
  closePic: () => void;
}

const InfraNavContext = createContext<InfraNav | null>(null);

export function InfraNavProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (key: "server" | "pic", value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const value = useMemo<InfraNav>(
    () => ({
      serverId: params.get("server"),
      picId: params.get("pic"),
      openServer: (id) => set("server", id),
      openPic: (id) => set("pic", id),
      closeServer: () => set("server", null),
      closePic: () => set("pic", null),
    }),
    [params, set],
  );

  return <InfraNavContext.Provider value={value}>{children}</InfraNavContext.Provider>;
}

export function useInfraNav(): InfraNav {
  const ctx = useContext(InfraNavContext);
  if (!ctx) throw new Error("useInfraNav must be used inside <InfraNavProvider>");
  return ctx;
}
