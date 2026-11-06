import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Difficulty } from './engine/types';

export type Route =
  | { name: 'home' }
  | { name: 'play'; diff?: Difficulty }
  | { name: 'game'; puzzleId: string }
  | { name: 'daily' }
  | { name: 'collection' }
  | { name: 'achievements' }
  | { name: 'stats' }
  | { name: 'settings' };

interface NavApi {
  route: Route;
  go: (r: Route) => void;
  /** replace the current entry (e.g. "next puzzle") */
  replace: (r: Route) => void;
  back: () => void;
}

const Ctx = createContext<NavApi | null>(null);
export const useNav = (): NavApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
};

/** Tiny history-backed router so the browser/Android back button behaves like the in-app back button. */
export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => {
    const st = typeof history !== 'undefined' ? (history.state as { route?: Route } | null) : null;
    return st?.route ?? { name: 'home' };
  });
  const depth = useRef(0);

  useEffect(() => {
    if (!(history.state as { route?: Route } | null)?.route) history.replaceState({ route }, '');
    const onPop = (e: PopStateEvent) => {
      const r = (e.state as { route?: Route } | null)?.route ?? { name: 'home' };
      depth.current = Math.max(0, depth.current - 1);
      setRoute(r);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((r: Route) => {
    history.pushState({ route: r }, '');
    depth.current++;
    setRoute(r);
  }, []);
  const replace = useCallback((r: Route) => {
    history.replaceState({ route: r }, '');
    setRoute(r);
  }, []);
  const back = useCallback(() => {
    if (depth.current > 0) history.back();
    else {
      history.replaceState({ route: { name: 'home' } }, '');
      setRoute({ name: 'home' });
    }
  }, []);

  const api = useMemo(() => ({ route, go, replace, back }), [route, go, replace, back]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
