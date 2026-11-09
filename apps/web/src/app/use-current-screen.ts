import { useMemo } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { SCREENS, type Screen } from "./screens";

// Static paths before dynamic ones so "/workers/new" wins over "/workers/:id".
const ORDERED = [...SCREENS].sort((a, b) => Number(a.path.includes(":")) - Number(b.path.includes(":")));

export function findScreen(pathname: string): Screen | undefined {
  return ORDERED.find((s) => matchPath({ path: s.path, end: true }, pathname));
}

export function useCurrentScreen(): Screen | undefined {
  const { pathname } = useLocation();
  return useMemo(() => findScreen(pathname), [pathname]);
}

/** True when `path` is the current page or one of its detail pages. */
export function isActivePath(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  if (pathname === path) return true;
  const current = findScreen(pathname);
  return current?.parent === path;
}
