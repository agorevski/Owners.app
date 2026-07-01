import { useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
}

/**
 * Minimal data-loading hook. Re-runs whenever any value in `deps` changes (including the
 * store's refreshKey), and ignores stale resolutions.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: undefined });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({ data: undefined, loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
