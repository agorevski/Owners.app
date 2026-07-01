import { AppProvider, useApp } from "./state/AppStore";
import { ROUTES } from "./routes/index";
import { buttonStyle, color, space } from "./ui/theme";
import type { ViewKey } from "./client/navigation";

/**
 * App shell for the Owners.app v0 web prototype.
 *
 * Provides the in-app navigation, a compact session strip (email magic-link stub), and renders
 * the active route. Data flows through the in-browser client in `state/AppStore`.
 */

function Shell() {
  const app = useApp();
  const Active = ROUTES[app.nav.view].component;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 880, margin: "0 auto", padding: 24, color: color.body }}>
      <header style={{ borderBottom: `1px solid ${color.line}`, paddingBottom: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: color.ink }}>Owners.app</h1>
            <p style={{ color: color.muted, marginTop: 4 }}>Ask someone who actually owns it — v0 prototype.</p>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            {app.currentUser ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: color.body }}>@{app.currentUser.handle}</span>
                <button onClick={app.signOut} style={buttonStyle("ghost")}>
                  Sign out
                </button>
              </div>
            ) : (
              <span style={{ color: color.muted }}>Signed out</span>
            )}
          </div>
        </div>
        <nav aria-label="Primary" style={{ display: "flex", gap: space(2), flexWrap: "wrap", marginTop: 12 }}>
          {(Object.keys(ROUTES) as ViewKey[]).map((key) => (
            <button
              key={key}
              aria-current={app.nav.view === key ? "page" : undefined}
              onClick={() => app.navigate(key)}
              style={buttonStyle(app.nav.view === key ? "primary" : "secondary")}
            >
              {ROUTES[key].label}
            </button>
          ))}
        </nav>
      </header>
      <main>{app.ready ? <Active /> : <p style={{ color: color.muted }}>Loading prototype…</p>}</main>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
