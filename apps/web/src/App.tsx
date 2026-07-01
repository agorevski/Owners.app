import { useState } from "react";
import { ROUTES, type RouteKey } from "./routes/index";

/**
 * App shell for the Owners.app v0 web prototype.
 *
 * This is a deliberately thin shell. UI/web agents should expand routing (e.g. adopt a
 * real router), styling, and data fetching. Route components live in src/routes and
 * currently render placeholders that document intent for each core screen.
 */
export function App() {
  const [route, setRoute] = useState<RouteKey>("home");
  const Active = ROUTES[route].component;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "0 auto", padding: 24 }}>
      <header style={{ borderBottom: "1px solid #ddd", paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Owners.app</h1>
        <p style={{ color: "#555", marginTop: 4 }}>
          Ask someone who actually owns it — v0 prototype shell.
        </p>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {(Object.keys(ROUTES) as RouteKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setRoute(key)}
              style={{
                background: route === key ? "#111" : "transparent",
                color: route === key ? "#fff" : "#111",
                border: "1px solid #111",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {ROUTES[key].label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Active />
      </main>
    </div>
  );
}
