import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '../../auth';
import { settingsApi } from './api';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'netipam-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage unavailable */ }
  return 'system';
}

export function applyTheme(pref: ThemePref) {
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref);
  } catch { /* ignore */ }
  applyTheme(pref);
}

/** Always mounted: restores the stored light/dark preference on every page. */
export function ThemeApplier() {
  useEffect(() => { applyTheme(getThemePref()); }, []);
  const authed = !!useMe().data?.authenticated;
  const info = useQuery({ queryKey: ['settings-public'], queryFn: settingsApi.publicInfo, enabled: authed, retry: false });
  const title = info.data?.siteTitle;
  useEffect(() => { if (title) document.title = title; }, [title]);
  return null;
}
