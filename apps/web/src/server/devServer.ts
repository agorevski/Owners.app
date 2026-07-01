/**
 * Optional lightweight dev-server adapter for the v0 prototype API.
 *
 * This is intentionally dependency-free (Node's built-in http) so the same handlers that
 * back the integration tests can also be exercised over real HTTP for manual/E2E testing.
 * It is NOT the production surface — the Next.js target owns routing/deploy. Start it with:
 *
 *   node --loader ... apps/web/src/server/devServer.ts   (or via a small bootstrap script)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { WebRepositoryContext } from "./context";
import { createInMemoryRepositories } from "./memoryRepositories";
import { handleApiRequest } from "./router";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Create (but do not start) an http server bound to the API router. Callers own listen().
 * A fresh in-memory context is used unless one is provided.
 */
export function createApiServer(ctx: WebRepositoryContext = createInMemoryRepositories()) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const body = await readJsonBody(req);
        const principalId =
          (Array.isArray(req.headers["x-owners-principal"])
            ? req.headers["x-owners-principal"][0]
            : req.headers["x-owners-principal"]) ?? undefined;
        const result = await handleApiRequest(ctx, {
          method: req.method ?? "GET",
          path: req.url ?? "/",
          body,
          principalId,
        });
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(JSON.stringify(result.body));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "INTERNAL", message: err instanceof Error ? err.message : "error" },
          }),
        );
      }
    })();
  });
}

/** Start the dev API server on the given port (default 8787). Returns the http server. */
export function startApiServer(port = 8787, ctx?: WebRepositoryContext) {
  const server = createApiServer(ctx);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[owners-api] dev API listening on http://localhost:${port}`);
  });
  return server;
}
