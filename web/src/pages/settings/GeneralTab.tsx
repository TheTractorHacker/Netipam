import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field, Select, Switch, TextInput, useToast } from '../../components/kit';
import { settingsApi, type SettingsBundle } from './api';
import { NumberField, Section, rangeError, useDraft } from './parts';
import { getThemePref, setThemePref, type ThemePref } from './theme';

export default function GeneralTab({ data }: { data: SettingsBundle }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { draft, patch, dirty, reset } = useDraft(data.general);
  const [pref, setPref] = useState<ThemePref>(getThemePref());

  const errs = {
    refresh: rangeError(draft.uiAutoRefreshSeconds, 0, 3600),
    free: rangeError(draft.subnetFreeIpDisplayCount, 1, 50),
    keep: rangeError(draft.updaterLogRetentionHours, 1, 8760),
  };
  const invalid = Object.values(errs).some(Boolean);

  const save = useMutation({
    mutationFn: () => settingsApi.saveGeneral({ ...draft, siteTitle: draft.siteTitle.trim() || 'Netipam' }),
    onSuccess: () => { toast('General settings saved'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const formats = data.dateFormats.includes(draft.dateFormat) ? data.dateFormats : [draft.dateFormat, ...data.dateFormats];

  return (
    <>
      <Section title="Appearance" sub="Stored in this browser only. System follows your OS light/dark setting.">
        <div className="settings-seg" role="group" aria-label="Color theme">
          {(['system', 'light', 'dark'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={pref === p} onClick={() => { setPref(p); setThemePref(p); }}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="General" sub="Applies to everyone using this Netipam instance.">
        <form onSubmit={(e) => { e.preventDefault(); if (!invalid) save.mutate(); }}>
          <div className="form-grid">
            <Field label="Application name" hint="Shown as the browser tab title and in the classic UI top bar">
              <TextInput value={draft.siteTitle} placeholder="Netipam" onChange={(e) => patch({ siteTitle: e.target.value })} />
            </Field>
            <Field label="Date format">
              <Select value={draft.dateFormat} onChange={(e) => patch({ dateFormat: e.target.value })}>
                {formats.map((f) => <option key={f} value={f}>{f === 'yyyy-MM-ddTHH:mm:ss' ? 'ISO-like (yyyy-MM-ddTHH:mm:ss)' : f}</option>)}
              </Select>
            </Field>
            <NumberField label="Auto-refresh (seconds, 0 = off)" value={draft.uiAutoRefreshSeconds} min={0} max={3600} step={5}
              onChange={(v) => patch({ uiAutoRefreshSeconds: v })} error={errs.refresh} />
            <NumberField label="Available IPs shown per subnet" hint="Next free addresses listed on the Subnets page"
              value={draft.subnetFreeIpDisplayCount} min={1} max={50} onChange={(v) => patch({ subnetFreeIpDisplayCount: v })} error={errs.free} />
            <NumberField label="Keep updater logs (hours)" hint="24 = one day, 168 = one week, 720 = 30 days"
              value={draft.updaterLogRetentionHours} min={1} max={8760} step={24} onChange={(v) => patch({ updaterLogRetentionHours: v })} error={errs.keep} />
            <Field label="Classic UI theme" hint="Only affects the classic Blazor interface">
              <Select value={draft.themeName} onChange={(e) => patch({ themeName: e.target.value })}>
                {data.themes.map((t) => <option key={t.name} value={t.name}>{t.displayName}</option>)}
              </Select>
            </Field>
            <div className="span-all">
              <Switch label="Show WAN status on dashboard" checked={draft.uiShowWanStatus} onChange={(v) => patch({ uiShowWanStatus: v })} />
            </div>
          </div>
          <div className="settings-foot">
            <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={reset}>Discard</button>
            <button type="submit" className="btn primary" disabled={!dirty || invalid || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </Section>
    </>
  );
}
