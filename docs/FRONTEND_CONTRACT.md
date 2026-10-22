# Blipmade frontend contract

Every page in `/app` and `/admin` is built against this contract so the surfaces stay consistent.
The design source of truth is `docs/BLIPMADE_DESIGN_PROMPT.md` (Parts B, C, D). The API shape is
`docs/API_CONTRACT.md`.

## Non-negotiable rules

1. **Tailwind v4 utilities only**, using the tokens in `src/index.css` (`bg`, `s1`, `s2`, `s3`, `line`,
   `acc`, `acc-h`, `on-acc`, `acc-bg`, `ink`, `ink2`, `ink3`, `bad`, `warn`, `con`, `con-ink`).
   No inline hex. No new colors. No UI libraries.
2. **Flat design.** No borders, no outlines for decoration, no shadows, no gradients, no backdrop blur.
   Hierarchy comes from surface layers. The only allowed outline is a focus ring
   (`focus-visible:ring-2 focus-visible:ring-acc`).
3. **Phone first.** Design 390 px, also check 320 and 430. No horizontal page scroll. Primary action in a
   sticky bottom bar on steps that end in a purchase or save. Tables become labeled cards. Filters and row
   actions become bottom sheets.
4. **Four states everywhere.** Every data region renders loading (skeletons), empty (one sentence + one
   action), error (what failed, what to do, Retry) and populated states. Use `LoadingBlock`, `EmptyState`,
   `ErrorState` from `src/ui-app.tsx`.
5. **Honest data.** Never show invented numbers, counters, uptime or success. If a value is unavailable show
   `—` with the hint "Not available yet". Label anything simulated.
6. **Money** is integer minor units from the API. Render with `<Money amount={...} currency={...} />` from
   `src/ui-app.tsx`. Never compute prices in the client — the server returns the quote.
7. **Accessibility.** Landmarks, one `h1` per page (the shell already renders the `h1`), visible focus,
   keyboard reachable, `role="alert"` for errors, live regions for async updates, no color-only meaning.
8. **English copy.** Short and concrete. No marketing claims inside the app.

## Shared modules

### `src/ui-app.tsx`

| Export | Purpose |
|---|---|
| `AppShell({ nav, phoneTabs, title, subtitle, actions, environment, children })` | Desktop sidebar + phone bottom tabs. `routes.tsx` already renders it, so **pages must not render their own shell** — they render page content only. |
| `Panel({ title, description, action, children, tone })` | `s1` surface, optional `acc-bg` tone. |
| `StatTile({ label, value, hint })` | Metric tile. |
| `ListRow({ title, meta, right, to, children })` | Row inside a `s2` surface; `to` makes it a link. |
| `LoadingBlock({ rows, label })` | Skeleton loading state. |
| `EmptyState({ title, description, action })` | Empty state. |
| `ErrorState({ title, message, requestId, onRetry })` | Error state, red tint only on the message. |
| `StatusPill({ status, label })` | Colored pill with a text label (never color alone). |
| `Money({ amount, currency, period })` | Formats minor units. |
| `Field`, `TextInput`, `TextArea`, `Select` | Form controls: pill inputs, 56 px, label above, error replaces helper. |
| `PrimaryButton`, `SoftButton`, `DangerButton` | Buttons, pill shaped, 44 px. |
| `Segmented({ options, value, onChange, ariaLabel })` | Segmented control; selected = `bg-ink text-bg`. |
| `useToast()` → `{ push(message, tone) }` | Toast notifications. |
| `ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel, busy, requireText })` | Confirmation for destructive actions. `requireText` forces typing a name. |
| `DataTable`, `CardList` | Desktop table + phone card list for the same rows. |

### `src/lib/api.ts`

`get`, `post`, `put`, `del`, `api`, `ApiError`, `readCookie`. All requests are same-origin under `/api`,
send session cookies, and carry the CSRF header automatically. `ApiError` has `status`, `code`, `message`,
`fields` (per-field validation messages) and `requestId`.

### `src/lib/useAsync.ts`

- `useAsync<T>(fn, deps)` → `{ data, loading, error, reload, setData }`. The `fn` receives an `AbortSignal`.
- `useAction(fn)` → `{ run, pending, error, clearError }` for mutations.

### `src/session.tsx`

`useSession()` → `{ user, loading, error, refresh, login, register, logout }`.
`user.role` is `'CUSTOMER' | 'STAFF' | 'ADMIN'`.

### `src/router.tsx`

`useRouter()` → `{ path, search, query, navigate }`, `useParams()` → route params (`id`, `slug`),
`Link`, `safeNext`.

## Page structure

A page component renders content only. Standard shape:

```tsx
export default function Overview() {
  const { data, loading, error, reload } = useAsync((signal) => get<{ instances: Instance[] }>('/instances', undefined, signal), []);
  const { user } = useSession();

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Running" value={data ? data.instances.filter(i => i.status === 'online').length : '—'} />
      </section>
      <Panel title="Your instances">
        {loading ? <LoadingBlock /> : error ? <ErrorState message={error.message} onRetry={reload} /> : !data?.instances.length
          ? <EmptyState title="No instances yet. Pick an app." description="Deploy an app or database in a few clicks." action={<Link to="/app/deploy/wordpress" className="...">Browse the catalog</Link>} />
          : data.instances.map(i => <ListRow key={i.id} ... />)}
      </Panel>
    </div>
  );
}
```

### Phone bottom action bar

```tsx
<div className="fixed inset-x-0 bottom-[76px] z-20 flex items-center justify-between gap-3 bg-s3 px-4 py-3 lg:hidden">
  <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p><Money amount={total} /></div>
  <PrimaryButton onClick={submit} disabled={pending}>{pending ? 'Working…' : 'Deploy'}</PrimaryButton>
</div>
```

The shell's bottom tab bar is 56 px plus safe area, so sit above it.

## Accessibility checklist per page

- Page content starts with an `h2` or `h3`; the shell owns the `h1`.
- Icon-only buttons need `aria-label`.
- Toggle/selection controls use `aria-pressed` or `role="radio"` with `aria-checked`.
- Destructive actions open `ConfirmDialog`.
- Async results announce through `aria-live="polite"` regions.
