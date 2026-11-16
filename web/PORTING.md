# Porting a Blazor page to React

The classic UI (MudBlazor, `Netipam/Components/Pages/*.razor`) is being replaced by this React app.
You port **one area** (a set of related pages). Behaviour must match the classic page — read the
`.razor` file(s) fully, including the `@code` block, before writing anything. Business logic that
lives inside a Razor `@code` block must be moved into the API (or a service) — do not drop features.

## Ownership rules (parallel agents work in the same tree — stay in your lane)
You may create/edit ONLY:
- `Netipam/Api/<Area>Api.cs` (+ extra `Netipam/Api/<Area>*.cs` helpers/DTOs, and new files under `Netipam/Services/` if logic must be shared)
- `web/src/pages/<area>/**` (components, `api.ts`, `module.tsx`, `<area>.css` imported from your pages)
You must NOT edit: `styles.css`, `components/kit.tsx`, `components/ui.tsx`, `components/Shell.tsx`, `App.tsx`,
`registry.ts`, `http.ts`, `auth.tsx`, `Program.cs`, any `.razor`, EF entities/DbContext/migrations,
or another area's files. If you need a shared change (new kit component, new entity column, new
migration), do NOT make it — describe it precisely in your final report under `needsFromOthers`.
Exception: you may ADD a read-only property/method to an existing service only when unavoidable; report it.

## Backend (C#)
- Create `public sealed class <Area>Api : IApiModule { public void Map(RouteGroupBuilder api) { ... } }` — auto-discovered, mapped under `/api`.
- Inject `AppDbContext db` directly into endpoint lambdas (scoped). Use `AsNoTracking()` for reads. Return DTOs (anonymous or records), never EF entities (cycles, secrets).
- Reads: any signed-in user (default). Mutations: `.RequireAuthorization("CanEdit")`; user/role/secret/backup/reset: `"AdminOnly"`. Check how the classic page gated the same action and match it.
- Secrets (UniFi password, API keys, Proxmox tokens): NEVER return the protected or plain value. Return `hasSecret: bool`; accept a new plain value on write and store via `AppSettingsService.Protect(...)`; empty/omitted = keep existing.
- Validate input and return `Results.ValidationProblem(...)` or `Results.BadRequest(new { error = "..." })` — the UI shows `error`.
- Keep behaviour parity with Razor code (side effects like triggering updaters via `UnifiUpdaterControl`/`ProxmoxUpdaterControl`, ack flags, history rows).
- Dates: return ISO strings (UTC with `Z` where the DB value is UTC).
- Must work on both SQLite and PostgreSQL: no provider-specific SQL; mind case-sensitive `LIKE` (use `.ToLower()` + `Contains`).
- Compile check (no local SDK): `scripts/check-dotnet.sh` from the repo root. It builds a private snapshot. If errors are in files you do not own, another agent is mid-edit — wait ~30s and retry; fix only your own errors.

## Frontend (React + TS)
- `web/src/pages/<area>/module.tsx` default-exports `AppModule` (see `registry.ts`): `routes` (paths inside `/app`) + `nav` entries (`replaces` = the classic Blazor path it supersedes, so its "classic" link disappears).
- Use `http` from `src/http.ts` (get/post/put/patch/del; errors throw `ApiError` with `.message`), put typed wrappers in `pages/<area>/api.ts`, use TanStack Query (`useQuery`/`useMutation`, invalidate on mutate). Roles: `useCan()` → `{ edit, admin }`; hide/disable edit UI for viewers.
- Use the shared kit (`components/kit.tsx`: Modal, ConfirmDialog, useToast, Field/TextInput/Select/Textarea/Switch, Badge, Tabs, Spinner, ErrorNote, useDebounced, timeAgo) and `components/ui.tsx` (PageHeader, Stat, Empty). Table = `<table className="table">` inside `<div className="card flush">`. Tokens: `var(--accent|--ok|--warn|--bad|--info|--muted|--line|--panel|--panel-2)`.
- Every list needs loading, error and empty states. Forms need labels, validation messages, disabled-while-saving, toast on success/failure. Destructive actions use ConfirmDialog.
- Deep links from the classic UI keep working, so link between React pages with `<Link to=...>` and to still-classic pages with plain `<a href="/path">`.
- Area-specific CSS goes in `pages/<area>/<area>.css` with class names prefixed by the area (e.g. `.subnets-map`). Respect light + dark tokens; no hard-coded colours.
- Type-check/build: `cd web && npx tsc --noEmit` (fast, safe in parallel). Do NOT run `npm run build` (writes shared output) — use `npx vite build --outDir /tmp/<area>-out --emptyOutDir` only if you need a bundle check.

## Done means
Both `scripts/check-dotnet.sh` and `npx tsc --noEmit` pass with no errors from your files; every feature of the classic page(s) is reachable in the React page (list the intentional omissions); responsive at 390px wide.
