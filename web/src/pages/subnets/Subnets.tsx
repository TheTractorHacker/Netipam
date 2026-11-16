import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subnetsApi, type SubnetInput, type SubnetRow } from './api';
import { useCan } from '../../auth';
import { PageHeader, Empty } from '../../components/ui';
import {
  Modal, ConfirmDialog, Field, TextInput, Textarea, Spinner, ErrorNote, Badge, useToast, useDebounced,
} from '../../components/kit';

const blank: SubnetInput = { name: '', cidr: '', description: '', vlanId: null, dhcpRangeStart: '', dhcpRangeEnd: '', dns1: '', dns2: '' };

function fromRow(s: SubnetRow): SubnetInput {
  return {
    name: s.name, cidr: s.cidr, description: s.description ?? '', vlanId: s.vlanId,
    dhcpRangeStart: s.dhcpRangeStart ?? '', dhcpRangeEnd: s.dhcpRangeEnd ?? '', dns1: s.dns1 ?? '', dns2: s.dns2 ?? '',
  };
}

function SubnetForm({ subnet, onClose }: { subnet: SubnetRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<SubnetInput>(subnet ? fromRow(subnet) : blank);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof SubnetInput>(k: K, v: SubnetInput[K]) => setF((p) => ({ ...p, [k]: v }));

  const dc = useDebounced(f.cidr.trim(), 200);
  const preview = useQuery({ queryKey: ['subnets', 'cidr', dc], queryFn: () => subnetsApi.cidr(dc), enabled: dc.length > 0 });
  const cidrError = !f.cidr.trim()
    ? 'CIDR is required.'
    : dc === f.cidr.trim() && preview.data && !preview.data.valid ? preview.data.error ?? 'Invalid CIDR.' : null;
  const nameError = f.name.trim() ? null : 'Name is required.';
  const vlanError = f.vlanId !== null && (f.vlanId < 1 || f.vlanId > 4094) ? 'VLAN must be 1–4094.' : null;

  const save = useMutation({
    mutationFn: () => (subnet ? subnetsApi.update(subnet.id, f) : subnetsApi.create(f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subnets'] });
      toast(subnet ? 'Subnet saved' : 'Subnet added');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const submit = () => {
    setTouched(true);
    if (nameError || cidrError || vlanError || preview.isFetching) return;
    save.mutate();
  };
  const p = preview.data;

  return (
    <Modal
      title={subnet ? 'Edit subnet' : 'Add subnet'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : subnet ? 'Save' : 'Add subnet'}
          </button>
        </>
      }
    >
      <form className="subnets-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Name" error={touched ? nameError : null}>
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} disabled={save.isPending} />
        </Field>
        <Field label="CIDR" hint="e.g. 192.168.1.0/24" error={touched || f.cidr ? cidrError : null}>
          <TextInput className="mono" value={f.cidr} onChange={(e) => set('cidr', e.target.value)} disabled={save.isPending} />
        </Field>
        {p?.valid && dc === f.cidr.trim() && (
          <dl className="subnets-preview">
            <div><dt>Network</dt><dd className="mono">{p.network}/{p.prefix}</dd></div>
            <div><dt>Broadcast</dt><dd className="mono">{p.broadcast}</dd></div>
            <div><dt>Usable</dt><dd className="mono">{p.usableRange}</dd></div>
            <div><dt>Count</dt><dd className="num">{p.usable?.toLocaleString()} / {p.total?.toLocaleString()}</dd></div>
          </dl>
        )}
        <div className="subnets-form-grid">
          <Field label="DHCP start" hint="e.g. 192.168.1.50">
            <TextInput className="mono" value={f.dhcpRangeStart} onChange={(e) => set('dhcpRangeStart', e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="DHCP end" hint="e.g. 192.168.1.200">
            <TextInput className="mono" value={f.dhcpRangeEnd} onChange={(e) => set('dhcpRangeEnd', e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="DNS 1" hint="IP, or “Auto”">
            <TextInput className="mono" value={f.dns1} onChange={(e) => set('dns1', e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="DNS 2">
            <TextInput className="mono" value={f.dns2} onChange={(e) => set('dns2', e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="VLAN ID" hint="1–4094" error={vlanError}>
            <TextInput
              type="number" min={1} max={4094} inputMode="numeric" value={f.vlanId ?? ''}
              onChange={(e) => set('vlanId', e.target.value === '' ? null : Number(e.target.value))}
              disabled={save.isPending}
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} disabled={save.isPending} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Util({ s }: { s: SubnetRow }) {
  if (!s.usable) return <span className="muted">—</span>;
  const pct = Math.min(100, Math.round((s.usedIps / s.usable) * 100));
  const tone = pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok';
  return (
    <div className="subnets-util" title={`${s.usedIps} of ${s.usable} usable addresses in use`}>
      <div className="subnets-bar"><span className={tone} style={{ width: `${Math.max(pct, s.usedIps > 0 ? 2 : 0)}%` }} /></div>
      <span className="num small">{s.usedIps.toLocaleString()} / {s.usable.toLocaleString()}</span>
    </div>
  );
}

function Dns({ s }: { s: SubnetRow }) {
  const d1 = s.dns1?.trim(); const d2 = s.dns2?.trim();
  if (!d1 && !d2) return <span className="muted">—</span>;
  if (d1?.toLowerCase() === 'auto') return <Badge tone="info">Auto</Badge>;
  return <span className="mono">{[d1, d2].filter(Boolean).join(' | ')}</span>;
}

export default function Subnets() {
  const { edit, admin } = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ['subnets', 'list'], queryFn: subnetsApi.list });
  const [form, setForm] = useState<SubnetRow | 'new' | null>(null);
  const [del, setDel] = useState<SubnetRow | null>(null);
  const [q, setQ] = useState('');
  const [free, setFree] = useState(3);
  useEffect(() => { if (data) setFree(data.freeIpCount); }, [data?.freeIpCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFree = useMutation({
    mutationFn: (n: number) => subnetsApi.setFreeIpCount(n),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subnets'] }); toast('Setting saved'); },
    onError: (e: Error) => toast(e.message, 'bad'),
  });

  const items = (data?.items ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || [s.name, s.cidr, s.description, s.vlanId?.toString(), s.dns1, s.dns2].some((v) => v?.toLowerCase().includes(t));
  });

  return (
    <>
      <PageHeader
        title="Subnets"
        sub={data ? `${data.items.length} subnet${data.items.length === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <a className="btn ghost" href="/export/subnets.xlsx">Export subnets</a>
            <a className="btn ghost" href="/export/all.xlsx?perSubnetTabs=true">Master export</a>
            {edit && <button className="btn primary" onClick={() => setForm('new')}>Add subnet</button>}
          </>
        }
      />

      <div className="toolbar">
        <input className="search" aria-label="Filter subnets" placeholder="Filter by name, CIDR, VLAN, DNS…" value={q} onChange={(e) => setQ(e.target.value)} />
        {admin && data && (
          <label className="subnets-free">
            <span className="muted small">Next free IPs shown</span>
            <input
              type="number" min={1} max={50} value={free}
              onChange={(e) => setFree(Number(e.target.value))}
              onBlur={() => {
                const n = Math.min(50, Math.max(1, Math.round(free) || 1));
                setFree(n);
                if (n !== data.freeIpCount) saveFree.mutate(n);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        )}
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorNote error={error} />}
      {data && data.items.length === 0 && (
        <Empty>
          No subnets yet.{edit && <> <button className="btn link-btn" onClick={() => setForm('new')}>Add your first subnet</button> to start mapping IPs.</>}
        </Empty>
      )}
      {data && data.items.length > 0 && items.length === 0 && <Empty>No subnets match “{q}”.</Empty>}
      {items.length > 0 && (
        <div className="card flush">
          <table className="table subnets-table">
            <thead>
              <tr>
                <th>Name</th><th>CIDR</th><th>VLAN</th><th>Usable range</th><th>Utilisation</th>
                <th className="c">Clients</th><th className="c">Devices</th><th className="c">Offline</th>
                <th>DHCP range</th><th>DNS</th><th>Next free IPs</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/subnets/${s.id}/ips`} className="strong">{s.name}</Link>
                    {s.description && <div className="muted small subnets-desc">{s.description}</div>}
                  </td>
                  <td className="mono">{s.cidr}{!s.validCidr && <span className="pill warn">invalid</span>}</td>
                  <td>{s.vlanId ?? <span className="muted">—</span>}</td>
                  <td className="mono small">{s.usableRange ?? '—'}</td>
                  <td><Util s={s} /></td>
                  <td className="c num">{s.clients}</td>
                  <td className="c num">{s.devices}</td>
                  <td className="c num">{s.offline > 0 ? <Badge tone="bad">{s.offline}</Badge> : 0}</td>
                  <td className="mono small">
                    {s.dhcpRangeStart && s.dhcpRangeEnd ? `${s.dhcpRangeStart} – ${s.dhcpRangeEnd}` : s.dhcpRangeStart || s.dhcpRangeEnd || <span className="muted">—</span>}
                  </td>
                  <td className="small"><Dns s={s} /></td>
                  <td className="mono small">{s.nextFreeIps.length ? s.nextFreeIps.join(', ') : <span className="muted">—</span>}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn sm" to={`/subnets/${s.id}/ips`}>IPs</Link>
                      {edit && <button className="btn sm" onClick={() => setForm(s)} aria-label={`Edit ${s.name}`}>Edit</button>}
                      {edit && <button className="btn sm" onClick={() => setDel(s)} aria-label={`Delete ${s.name}`}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && <SubnetForm subnet={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && (
        <ConfirmDialog
          title="Delete subnet?"
          message={<>Are you sure you want to delete <b>{del.cidr}</b> ({del.name})? Its IP reservations will be removed.</>}
          onConfirm={async () => {
            try {
              await subnetsApi.remove(del.id);
              qc.invalidateQueries({ queryKey: ['subnets'] });
              toast('Subnet deleted');
              setDel(null);
            } catch (e) { toast((e as Error).message, 'bad'); }
          }}
          onClose={() => setDel(null)}
        />
      )}
    </>
  );
}
