import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../http';
import { Modal, Field, TextInput, Select, Textarea, Switch, Spinner, ErrorNote, useToast } from '../../components/kit';
import { devicesApi, type DeviceInput, type DeviceRow, type Kind, type Options } from './api';

type Errors = Record<string, string>;

const MODE_LABELS: Record<string, string> = {
  Normal: 'Normal (UniFi + ping)',
  PingOnly: 'Ping only',
  PortOnly: 'TCP port only',
  PingAndPort: 'Ping + TCP port',
  HttpOnly: 'HTTP only',
  PingAndHttp: 'Ping + HTTP',
};
const usesPort = (m: string) => m === 'PortOnly' || m === 'PingAndPort';
const usesHttp = (m: string) => m === 'HttpOnly' || m === 'PingAndHttp';

interface FormState {
  name: string; clientTypeId: string; hostDeviceId: string;
  isProxmoxHost: boolean; proxmoxInstanceId: string; proxmoxNodeIdentifier: string;
  isTopologyRoot: boolean; isCritical: boolean;
  assetNumber: string; hostname: string; ipAddress: string; macAddress: string;
  isStatusTracked: boolean; ignoreOffline: boolean;
  monitorMode: string; monitorPort: string; monitorUseHttps: boolean; monitorHttpPath: string;
  manualUpstreamDeviceId: string; locationId: string; rackId: string; rackUPosition: string; rackUSize: string;
  manufacturer: string; model: string; operatingSystem: string;
  source: string; usedNew: string; sourceDate: string;
  accessLink: string; accessCategoryId: string; description: string;
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const txt = (v: string) => (v.trim() === '' ? null : v.trim());

function blank(ip?: string): FormState {
  return {
    name: '', clientTypeId: '', hostDeviceId: '', isProxmoxHost: false, proxmoxInstanceId: '', proxmoxNodeIdentifier: '',
    isTopologyRoot: false, isCritical: false, assetNumber: '', hostname: '', ipAddress: ip ?? '', macAddress: '',
    isStatusTracked: true, ignoreOffline: false, monitorMode: 'Normal', monitorPort: '', monitorUseHttps: false, monitorHttpPath: '/',
    manualUpstreamDeviceId: '', locationId: '', rackId: '', rackUPosition: '', rackUSize: '',
    manufacturer: '', model: '', operatingSystem: '', source: '', usedNew: '', sourceDate: '',
    accessLink: '', accessCategoryId: '', description: '',
  };
}

function fromRow(d: DeviceRow, o: Options): FormState {
  // Older rows only carry the free-text location; match it to a location record like the classic dialog did.
  let locationId = d.locationId;
  if (locationId === null && d.location) {
    locationId = o.locations.find((l) => l.name.toLowerCase() === d.location!.trim().toLowerCase())?.id ?? null;
  }
  return {
    name: d.name, clientTypeId: s(d.clientTypeId), hostDeviceId: d.hostDeviceId === d.id ? '' : s(d.hostDeviceId),
    isProxmoxHost: d.isProxmoxHost, proxmoxInstanceId: s(d.proxmoxInstanceId), proxmoxNodeIdentifier: s(d.proxmoxNodeIdentifier),
    isTopologyRoot: d.isTopologyRoot, isCritical: d.isCritical, assetNumber: s(d.assetNumber), hostname: s(d.hostname),
    ipAddress: s(d.ipAddress), macAddress: s(d.macAddress), isStatusTracked: d.isStatusTracked, ignoreOffline: d.ignoreOffline,
    monitorMode: d.monitorMode, monitorPort: s(d.monitorPort), monitorUseHttps: d.monitorUseHttps, monitorHttpPath: s(d.monitorHttpPath) || '/',
    manualUpstreamDeviceId: s(d.manualUpstreamDeviceId), locationId: s(locationId), rackId: s(d.rackId),
    rackUPosition: s(d.rackUPosition), rackUSize: s(d.rackUSize),
    manufacturer: s(d.manufacturer), model: s(d.model), operatingSystem: s(d.operatingSystem),
    source: s(d.source), usedNew: s(d.usedNew), sourceDate: s(d.sourceDateText),
    accessLink: s(d.accessLink), accessCategoryId: s(d.accessCategoryId), description: s(d.description),
  };
}

function toInput(f: FormState, kind?: Kind): DeviceInput {
  return {
    kind, name: f.name.trim(), clientTypeId: num(f.clientTypeId), hostDeviceId: num(f.hostDeviceId),
    isProxmoxHost: f.isProxmoxHost, proxmoxInstanceId: f.isProxmoxHost ? num(f.proxmoxInstanceId) : null,
    proxmoxNodeIdentifier: f.isProxmoxHost ? txt(f.proxmoxNodeIdentifier) : null,
    isTopologyRoot: f.isTopologyRoot, isCritical: f.isCritical,
    assetNumber: txt(f.assetNumber), hostname: txt(f.hostname), ipAddress: txt(f.ipAddress), macAddress: txt(f.macAddress),
    isStatusTracked: f.isStatusTracked, ignoreOffline: f.ignoreOffline,
    monitorMode: f.monitorMode, monitorPort: num(f.monitorPort), monitorUseHttps: f.monitorUseHttps, monitorHttpPath: txt(f.monitorHttpPath),
    manualUpstreamDeviceId: f.isTopologyRoot ? null : num(f.manualUpstreamDeviceId), locationId: num(f.locationId),
    rackId: num(f.rackId), rackUPosition: num(f.rackUPosition), rackUSize: num(f.rackUSize),
    manufacturer: txt(f.manufacturer), model: txt(f.model), operatingSystem: txt(f.operatingSystem),
    source: txt(f.source), usedNew: txt(f.usedNew), sourceDate: txt(f.sourceDate),
    accessLink: txt(f.accessLink), accessCategoryId: num(f.accessCategoryId), description: txt(f.description),
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Name is required.';
  if (f.isProxmoxHost) {
    if (!f.proxmoxInstanceId) e.proxmoxInstanceId = 'Proxmox instance is required.';
    if (!f.proxmoxNodeIdentifier.trim()) e.proxmoxNodeIdentifier = 'Node identifier is required.';
  }
  if (usesPort(f.monitorMode) || usesHttp(f.monitorMode)) {
    const p = num(f.monitorPort);
    if (p === null) e.monitorPort = 'Port is required for this monitor mode.';
    else if (!Number.isInteger(p) || p < 1 || p > 65535) e.monitorPort = 'Port must be 1-65535.';
  }
  if (f.rackId) {
    const u = num(f.rackUPosition);
    if (u !== null && (!Number.isInteger(u) || u < 1 || u > 60)) e.rackUPosition = 'U position must be 1-60.';
    const z = num(f.rackUSize);
    if (z !== null && (!Number.isInteger(z) || z < 1 || z > 10)) e.rackUSize = 'U size must be 1-10.';
  }
  if (f.sourceDate.trim() && !/^[A-Za-z]{3}[- ]\d{4}$/.test(f.sourceDate.trim())) e.sourceDate = 'Use format like Aug-2025.';
  return e;
}

export interface DeviceFormProps {
  /** Existing row to edit; omit to create. */
  device?: DeviceRow;
  /** When creating: device (device types only) or client. */
  kind: Kind;
  initialIp?: string;
  onClose: () => void;
  onSaved: (id: number) => void;
}

export default function DeviceForm({ device, kind, initialIp, onClose, onSaved }: DeviceFormProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const opts = useQuery({ queryKey: ['devices', 'options'], queryFn: devicesApi.options, staleTime: 30_000 });
  const editing = !!device;

  return (
    <Modal title={editing ? `Edit ${device!.isDevice ? 'device' : 'client'}` : kind === 'device' ? 'Add device' : 'Add client'} onClose={onClose} wide>
      {opts.isLoading && <Spinner />}
      {opts.error && <ErrorNote error={opts.error} />}
      {opts.data && (
        <FormBody
          o={opts.data} device={device} kind={kind} initialIp={initialIp} onClose={onClose}
          save={async (input) => {
            const r = editing ? await devicesApi.update(device!.id, input) : await devicesApi.create(input);
            await qc.invalidateQueries({ queryKey: ['devices'] });
            qc.invalidateQueries({ queryKey: ['summary'] });
            toast(editing ? `Saved '${input.name}'.` : `Added '${input.name}'.`);
            onSaved(r.id);
          }}
        />
      )}
    </Modal>
  );
}

function FormBody({ o, device, kind, initialIp, onClose, save }: {
  o: Options; device?: DeviceRow; kind: Kind; initialIp?: string; onClose: () => void;
  save: (input: DeviceInput) => Promise<void>;
}) {
  const editing = !!device;
  const [f, setF] = useState<FormState>(() => (device ? fromRow(device, o) : blank(initialIp)));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const types = useMemo(
    () => (!editing && kind === 'device' ? o.clientTypes.filter((t) => t.isDevice) : o.clientTypes),
    [o, editing, kind],
  );
  const selectedType = o.clientTypes.find((t) => String(t.id) === f.clientTypeId);
  const showSource = editing ? selectedType?.isDevice === true : kind === 'device';
  const showHost = editing || kind === 'client';
  const hosts = o.hosts.filter((h) => h.id !== device?.id);
  const upstream = o.upstreamDevices.filter((u) => u.id !== device?.id);
  const typeLabel = !editing && kind === 'device' ? 'Device type' : 'Client type';

  const onProxmox = (v: boolean) => {
    setF((p) => {
      const next = { ...p, isProxmoxHost: v };
      if (v) {
        const t = o.clientTypes.find((x) => x.name.trim().toLowerCase() === 'proxmox server');
        if (t) next.clientTypeId = String(t.id);
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validate(f);
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) {
      setFormError('Fix the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      await save(toInput(f, editing ? undefined : kind));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      const server = err instanceof ApiError ? (err.details as { errors?: Errors } | undefined)?.errors : undefined;
      if (server) setErrors(server);
      setFormError(msg);
      toast(msg, 'bad');
      setBusy(false);
    }
  };

  const rackSelected = f.rackId !== '';
  const racks = o.racks;

  return (
    <form onSubmit={submit} noValidate className="devf">
      <fieldset disabled={busy} className="devf-set">
        <Section title="Basics">
          <Field label="Name *" error={errors.name}>
            <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} autoComplete="off" aria-invalid={!!errors.name} />
          </Field>
          <Field label={typeLabel} error={errors.clientTypeId}>
            <Select value={f.clientTypeId} onChange={(e) => set('clientTypeId', e.target.value)}>
              <option value="">- None -</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Asset #"><TextInput value={f.assetNumber} onChange={(e) => set('assetNumber', e.target.value)} /></Field>
          <div className="span-all devf-switches">
            <Switch checked={f.isCritical} onChange={(v) => set('isCritical', v)} label="Critical device" />
            <Switch checked={f.isTopologyRoot} onChange={(v) => set('isTopologyRoot', v)} label="Topology root" />
          </div>
        </Section>

        <Section title="Network">
          <Field label="Hostname"><TextInput value={f.hostname} onChange={(e) => set('hostname', e.target.value)} autoComplete="off" /></Field>
          <Field label="IP address" hint="Subnet is linked automatically from the IP."><TextInput className="mono" value={f.ipAddress} onChange={(e) => set('ipAddress', e.target.value)} autoComplete="off" /></Field>
          <Field label="MAC address" error={errors.macAddress}><TextInput className="mono" value={f.macAddress} onChange={(e) => set('macAddress', e.target.value)} autoComplete="off" aria-invalid={!!errors.macAddress} /></Field>
          <Field label="Manual upstream device" hint={f.isTopologyRoot ? 'Not used for a topology root.' : 'Optional. Overrides the upstream device for topology only.'}>
            <Select value={f.manualUpstreamDeviceId} onChange={(e) => set('manualUpstreamDeviceId', e.target.value)} disabled={f.isTopologyRoot}>
              <option value="">- None -</option>
              {upstream.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </Field>
        </Section>

        <Section title="Hosting">
          {showHost && (
            <Field label="Host" hint="The host this runs on (types marked as host, or Proxmox hosts).">
              <Select value={f.hostDeviceId} onChange={(e) => set('hostDeviceId', e.target.value)}>
                <option value="">- None -</option>
                {hosts.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </Select>
            </Field>
          )}
          <div className="span-all"><Switch checked={f.isProxmoxHost} onChange={onProxmox} label="Proxmox host" /></div>
          {f.isProxmoxHost && (
            <>
              <Field label="Proxmox instance *" error={errors.proxmoxInstanceId}>
                <Select value={f.proxmoxInstanceId} onChange={(e) => set('proxmoxInstanceId', e.target.value)}>
                  <option value="">- Select -</option>
                  {o.proxmoxInstances.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Proxmox node identifier *" hint="Exact node name in Proxmox for this host." error={errors.proxmoxNodeIdentifier}>
                <TextInput value={f.proxmoxNodeIdentifier} placeholder="pve-node-1" onChange={(e) => set('proxmoxNodeIdentifier', e.target.value)} />
              </Field>
            </>
          )}
        </Section>

        <Section title="Monitoring">
          <div className="span-all devf-switches">
            <Switch checked={f.isStatusTracked} onChange={(v) => set('isStatusTracked', v)} label="Track online status" />
            <Switch checked={f.ignoreOffline} onChange={(v) => set('ignoreOffline', v)} label="Ignore offline" />
          </div>
          {!f.isStatusTracked && <p className="muted small span-all devf-note">Untracked devices show as "not tracked" and are excluded from offline alerts and history.</p>}
          <Field label="Monitor mode" hint="Normal uses UniFi + ping. Use port/HTTP checks for host-IP containers.">
            <Select value={f.monitorMode} onChange={(e) => set('monitorMode', e.target.value)}>
              {o.monitorModes.map((m) => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
            </Select>
          </Field>
          {(usesPort(f.monitorMode) || usesHttp(f.monitorMode)) && (
            <Field label="Monitor port *" error={errors.monitorPort}>
              <TextInput type="number" min={1} max={65535} step={1} value={f.monitorPort} onChange={(e) => set('monitorPort', e.target.value)} />
            </Field>
          )}
          {usesHttp(f.monitorMode) && (
            <>
              <Field label="HTTP path"><TextInput value={f.monitorHttpPath} placeholder="/" onChange={(e) => set('monitorHttpPath', e.target.value)} /></Field>
              <div className="span-all"><Switch checked={f.monitorUseHttps} onChange={(v) => set('monitorUseHttps', v)} label="Use HTTPS" /></div>
            </>
          )}
        </Section>

        <Section title="Location and rack">
          <Field label="Location">
            <Select value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
              <option value="">- None -</option>
              {o.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Rack">
            <Select value={f.rackId} onChange={(e) => set('rackId', e.target.value)}>
              <option value="">- None -</option>
              {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Rack U position (bottom-up)" hint="Optional. U1 is the bottom." error={errors.rackUPosition}>
            <TextInput type="number" min={1} max={60} step={1} value={f.rackUPosition} onChange={(e) => set('rackUPosition', e.target.value)} disabled={!rackSelected} />
          </Field>
          <Field label="Rack U size" hint="Optional. Typical sizes: 1-4." error={errors.rackUSize}>
            <TextInput type="number" min={1} max={10} step={1} value={f.rackUSize} onChange={(e) => set('rackUSize', e.target.value)} disabled={!rackSelected} />
          </Field>
        </Section>

        <Section title="Hardware">
          <Field label="Manufacturer"><TextInput value={f.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} /></Field>
          <Field label="Model"><TextInput value={f.model} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label="Operating system"><TextInput value={f.operatingSystem} onChange={(e) => set('operatingSystem', e.target.value)} /></Field>
          {showSource && (
            <>
              <Field label="Source"><TextInput value={f.source} onChange={(e) => set('source', e.target.value)} /></Field>
              <Field label="Used / New">
                <Select value={f.usedNew} onChange={(e) => set('usedNew', e.target.value)}>
                  <option value="">- Unknown -</option>
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                </Select>
              </Field>
              <Field label="Source date (MMM-YYYY)" hint="Month-Year only, e.g. Aug-2025. Leave blank if unknown." error={errors.sourceDate}>
                <TextInput value={f.sourceDate} placeholder="Aug-2025" onChange={(e) => set('sourceDate', e.target.value)} />
              </Field>
            </>
          )}
        </Section>

        <Section title="Access and notes">
          <Field label="Access link" hint="Full URL to open this in a new tab.">
            <TextInput value={f.accessLink} placeholder="https://device.example.com" onChange={(e) => set('accessLink', e.target.value)} />
          </Field>
          <Field label="Access category" hint="Optional grouping used on the Access Panel.">
            <Select value={f.accessCategoryId} onChange={(e) => set('accessCategoryId', e.target.value)}>
              <option value="">- None -</option>
              {o.accessCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="span-all">
            <Field label="Notes"><Textarea rows={3} value={f.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} /></Field>
          </div>
        </Section>
      </fieldset>

      <div className="devf-foot">
        {formError ? <span className="field-error" role="alert">{formError}</span> : <span />}
        <div className="row">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : kind === 'device' ? 'Add device' : 'Add client'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="devf-section">
      <h3>{title}</h3>
      <div className="form-grid">{children}</div>
    </section>
  );
}
