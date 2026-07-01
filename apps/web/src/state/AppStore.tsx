/**
 * Application store for the web prototype: wires the in-browser client, the magic-link-style
 * session, demo seed data, and lightweight navigation into a single React context.
 *
 * Kept deliberately small — no external state library. Mutations bump a `refreshKey` so screens
 * can re-fetch their view models after writes.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@owners/shared";
import { LocalApiClient } from "../client/localClient";
import { SessionManager } from "../client/session";
import { seedDemoData, type SeedResult } from "../client/seed";
import { parseEntry, type NavParams, type NavState, type ViewKey } from "../client/navigation";

export interface AppContextValue {
  client: LocalApiClient;
  session: SessionManager;
  currentUser: User | undefined;
  accounts: User[];
  seed: SeedResult | undefined;
  ready: boolean;
  nav: NavState;
  refreshKey: number;
  navigate: (view: ViewKey, params?: NavParams) => void;
  openProduct: (productId: string, questionId?: string) => void;
  signIn: (email: string) => Promise<User>;
  signOut: () => void;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

export interface AppProviderProps {
  children: ReactNode;
  /** Test hook: skip window/URL parsing and start at a specific view. */
  initialNav?: NavState;
  /** Test hook: skip demo seeding (start with an empty context). */
  seedOnMount?: boolean;
  /** Test hook: inject a pre-built (optionally pre-seeded) client + session. */
  client?: LocalApiClient;
  session?: SessionManager;
  /** Test hook: provide seed metadata when injecting an already-seeded client. */
  seed?: SeedResult;
}

export function AppProvider({
  children,
  initialNav,
  seedOnMount = true,
  client: injectedClient,
  session: injectedSession,
  seed: injectedSeed,
}: AppProviderProps) {
  const refs = useRef<{ client: LocalApiClient; session: SessionManager }>();
  if (!refs.current) {
    const client = injectedClient ?? new LocalApiClient();
    refs.current = { client, session: injectedSession ?? new SessionManager(client) };
  }
  const { client, session } = refs.current;

  const shouldSeed = seedOnMount && !injectedClient;
  const [ready, setReady] = useState(!shouldSeed);
  const [seed, setSeed] = useState<SeedResult | undefined>(injectedSeed);
  const [accounts, setAccounts] = useState<User[]>(injectedSeed?.accounts ?? []);
  const [currentUser, setCurrentUser] = useState<User | undefined>(refs.current.session.user);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nav, setNav] = useState<NavState>(
    () =>
      initialNav ??
      (typeof window !== "undefined"
        ? parseEntry(window.location.search, window.location.hash)
        : { view: "home", params: {} }),
  );

  useEffect(() => {
    if (!shouldSeed) return;
    let active = true;
    void (async () => {
      const result = await seedDemoData(client, session);
      if (!active) return;
      setSeed(result);
      setAccounts(result.accounts);
      // Resolve an ASIN-based deep link into a canonical product id once seed is ready.
      if (nav.view === "product" && !nav.params.productId && nav.params.asin) {
        try {
          const resolved = await client.resolveProduct({
            asin: nav.params.asin,
            parentAsin: nav.params.parentAsin,
            marketplace: "US",
          });
          if (active) {
            setNav({ view: "product", params: { ...nav.params, productId: resolved.canonicalProductId } });
          }
        } catch {
          /* leave params.asin for the product screen to surface a not-found state */
        }
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      client,
      session,
      currentUser,
      accounts,
      seed,
      ready,
      nav,
      refreshKey,
      navigate: (view, params = {}) => setNav({ view, params }),
      openProduct: (productId, questionId) =>
        setNav({ view: "product", params: { productId, questionId } }),
      signIn: async (email) => {
        const user = await session.signIn(email);
        setCurrentUser(user);
        setRefreshKey((k) => k + 1);
        return user;
      },
      signOut: () => {
        session.signOut();
        setCurrentUser(undefined);
        setRefreshKey((k) => k + 1);
      },
      refresh: () => setRefreshKey((k) => k + 1),
    }),
    [client, session, currentUser, accounts, seed, ready, nav, refreshKey],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
