import { useState } from 'react';
import { api, del, get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import {
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Money,
  Panel,
  StatusPill,
  useToast,
} from '../ui-app';
import { DASH, LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, denseSelect, useAdminSession } from './Overview';
import type { TableColumn } from '../lib/table';

/**
 * Staff catalog — GET /api/admin/products, POST /api/admin/products,
 * PATCH /api/admin/products/:id, DELETE /api/admin/products/:id
 *
 * The API refuses to delete a product that still has instances. That message
 * comes from the server and is shown as it is.
 */

interface AdminPrice {
  id: string;
  period: string;
  baseAmount: number;
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
  currency: string;
  active: boolean;
}

interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  visible: boolean;
  deployable: boolean;
  eggId: number | null;
  dockerImage: string | null;
  /** What the catalog and the ordering will answer for this product. */
  availability: {
    state: 'DEPLOYABLE' | 'COMING_SOON' | 'TEMPORARILY_UNAVAILABLE' | 'UNPUBLISHED';
    enabled: boolean;
    installable: boolean;
    visible: boolean;
    orderable: boolean;
    blockers: string[];
  };
  minRam: number;
  minCpu: number;
  minDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  prices: AdminPrice[];
  options: { id: string; code: string; name: string; amount: number; currency: string; active: boolean }[];
}

const CATEGORIES = ['WEB_CMS', 'DEVELOPER_TOOLS', 'MONITORING', 'AUTOMATION', 'BOTS', 'DATABASES', 'GAMES'];

interface ToggleTarget {
  product: AdminProduct;
  field: 'visible' | 'deployable';
  next: boolean;
}

export default function Products() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [toggle, setToggle] = useState<ToggleTarget | null>(null);
  const [removing, setRemoving] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  // The egg that is being typed is kept here, so the table and the card list
  // show the same value and the operator does not save a stale one.
  const [eggs, setEggs] = useState<Record<string, string>>({});

  const state = useAsync((signal) => get<{ products: AdminProduct[] }>('/admin/products', undefined, signal), []);
  const products = state.data?.products ?? [];
  const mayWrite = can(staff, 'products.write');

  const eggValue = (product: AdminProduct) => eggs[product.id] ?? (product.eggId ? String(product.eggId) : '');

  const patchProduct = useAction(async (id: string, body: { visible?: boolean; deployable?: boolean; eggId?: number | null }) => {
    return api<{ product: AdminProduct }>(`/admin/products/${id}`, { method: 'PATCH', body });
  });

  const removeProduct = useAction(async (id: string) => {
    await del<void>(`/admin/products/${id}`);
    return true;
  });

  const confirmToggle = async () => {
    if (!toggle) return;
    const body = toggle.field === 'visible' ? { visible: toggle.next } : { deployable: toggle.next };
    const result = await patchProduct.run(toggle.product.id, body);
    if (!result) return;
    toast.push(
      toggle.field === 'visible'
        ? `${toggle.product.name} is now ${toggle.next ? 'visible' : 'hidden'}`
        : `${toggle.product.name} is now ${toggle.next ? 'deployable' : 'not deployable'}`,
      'ok',
    );
    setToggle(null);
    state.reload();
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const result = await removeProduct.run(removing.id);
    if (!result) return;
    toast.push(`${removing.name} deleted`, 'ok');
    setRemoving(null);
    state.reload();
  };

  const monthlyPrice = (product: AdminProduct) => {
    const monthly = product.prices.find((price) => price.period === 'monthly') ?? product.prices[0];
    return monthly ? <Money amount={monthly.baseAmount} currency={monthly.currency} period="month" /> : DASH;
  };

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${products.length} product${products.length === 1 ? '' : 's'}`} />
      <Panel
        title="Catalog"
        description="Apps and databases that customers can buy. Visibility controls the catalog, deployable controls ordering."
        actionBelow
        action={
          mayWrite ? (
            <button type="button" onClick={() => setCreating((value) => !value)} aria-expanded={creating} className={densePrimary}>
              {creating ? 'Close the form' : 'New product'}
            </button>
          ) : undefined
        }
      >
        {creating && mayWrite && <NewProductForm onDone={() => { setCreating(false); state.reload(); }} />}

        <div className="grid gap-3">
          {state.loading ? (
            <LoadingBlock rows={4} label="Loading the catalog" />
          ) : state.error ? (
            <ErrorState title="The catalog could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !products.length ? (
            <EmptyState title="No products yet." description="Add the first app or database to the catalog." />
          ) : (
            <div className="grid gap-3">
              <DataTable<AdminProduct>
                rows={products}
                rowKey={(product) => product.id}
                columns={[
                  {
                    key: 'product',
                    header: 'Product',
                    truncate: true,
                    render: (product: AdminProduct) => (
                      <span className="block min-w-0">
                        <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={product.name}>
                          {product.name}
                        </span>
                        <span className="block truncate font-mono text-[12.5px] text-ink3" title={product.slug}>
                          {product.slug}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'category',
                    header: 'Category',
                    nowrap: true,
                    render: (product: AdminProduct) => (
                      <span className="text-ink2">{product.category.replace(/_/g, ' ')}</span>
                    ),
                  },
                  {
                    key: 'price',
                    header: 'Base price',
                    align: 'right',
                    nowrap: true,
                    render: (product: AdminProduct) => monthlyPrice(product),
                  },
                  {
                    key: 'resources',
                    header: 'Min · max',
                    nowrap: true,
                    render: (product: AdminProduct) => (
                      <span className="font-mono text-[12.5px] text-ink2">
                        {product.minRam} MB · {product.minCpu} vCPU · {product.minDisk} GB
                      </span>
                    ),
                  },
                  {
                    key: 'visible',
                    header: 'Visible',
                    nowrap: true,
                    render: (product: AdminProduct) =>
                      mayWrite ? (
                        <button
                          type="button"
                          aria-pressed={product.visible}
                          onClick={() => setToggle({ product, field: 'visible', next: !product.visible })}
                          className={product.visible ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                        >
                          {product.visible ? 'Visible' : 'Hidden'}
                        </button>
                      ) : (
                        <StatusPill status={product.visible ? 'active' : 'draft'} label={product.visible ? 'Visible' : 'Hidden'} />
                      ),
                  },
                  {
                    key: 'deployable',
                    header: 'Deployable',
                    render: (product: AdminProduct) => {
                      // The flag says that the operator allows the product to
                      // be ordered. The state says whether the panel can build
                      // it. A product that is switched on but cannot be built
                      // is shown as blocked, with the reason — and the switch
                      // stays there, so the product can be opened for ordering
                      // again from this table as well.
                      const availability = product.availability;
                      const state = availability?.state;
                      const blockers = availability?.blockers ?? [];
                      const title = blockers.join(' ');
                      const blocked = Boolean(state && state !== 'DEPLOYABLE' && product.deployable);
                      const switchButton = mayWrite ? (
                        <button
                          type="button"
                          aria-pressed={product.deployable}
                          onClick={() => setToggle({ product, field: 'deployable', next: !product.deployable })}
                          className={product.deployable ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                        >
                          {product.deployable ? 'Deployable' : 'Not deployable'}
                        </button>
                      ) : (
                        <StatusPill
                          status={product.deployable ? 'active' : 'draft'}
                          label={product.deployable ? 'Deployable' : 'Not deployable'}
                        />
                      );
                      if (!blocked) return switchButton;
                      return (
                        <span className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1.5">
                            {switchButton}
                            <StatusPill status="degraded" label="Blocked" />
                          </span>
                          <span className="font-mono text-[11.5px] text-ink3">{title}</span>
                        </span>
                      );
                    },
                  },
                  {
                    key: 'egg',
                    header: 'Panel egg',
                    render: (product: AdminProduct) => (
                      <span className="block min-w-0">
                        <span className="block font-mono text-[12.5px] text-ink2">
                          {product.eggId ?? 'Not set — the product cannot be built yet'}
                        </span>
                        {mayWrite && (
                          <EggForm
                            product={product}
                            value={eggValue(product)}
                            onChange={(value) => setEggs((current) => ({ ...current, [product.id]: value }))}
                            onSaved={(id, value) => {
                              patchProduct.run(id, { eggId: value });
                            }}
                            busy={patchProduct.pending}
                          />
                        )}
                      </span>
                    ),
                  },
                  ...(mayWrite
                    ? ([
                        {
                          key: 'actions',
                          header: 'Action',
                          align: 'right',
                          render: (product: AdminProduct) => (
                            <button type="button" onClick={() => setRemoving(product)} className={denseDanger}>
                              Delete
                            </button>
                          ),
                        },
                      ] satisfies TableColumn<AdminProduct>[])
                    : []),
                ]}
              />
              <CardList<AdminProduct> rows={products} rowKey={(product) => product.id}>
                {(product) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={product.name}>
                          {product.name}
                        </p>
                        <p className="truncate font-mono text-[12.5px] text-ink3" title={product.slug}>
                          {product.slug}
                        </p>
                      </div>
                      <StatusPill
                        status={product.visible ? 'active' : 'draft'}
                        label={product.visible ? 'Visible' : 'Hidden'}
                      />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div className="min-w-0">
                        <dt className="text-ink3">Base price</dt>
                        <dd>{monthlyPrice(product)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Category</dt>
                        <dd className="text-ink">{product.category.replace(/_/g, ' ')}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-ink3">Resources</dt>
                        <dd className="font-mono break-words text-ink">
                          {product.minRam} MB · {product.minCpu} vCPU · {product.minDisk} GB
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-ink3">Deployable</dt>
                        <dd className="text-ink">{product.deployable ? 'Yes' : 'No'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-ink3">Panel egg</dt>
                        <dd className="font-mono text-ink">
                          {product.eggId ?? 'Not set — the product cannot be built yet'}
                        </dd>
                      </div>
                    </dl>
                    {mayWrite && (
                      <EggForm
                        product={product}
                        value={eggValue(product)}
                        onChange={(value) => setEggs((current) => ({ ...current, [product.id]: value }))}
                        onSaved={(id, value) => {
                          patchProduct.run(id, { eggId: value });
                        }}
                        busy={patchProduct.pending}
                      />
                    )}
                    {mayWrite && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          aria-pressed={product.visible}
                          onClick={() => setToggle({ product, field: 'visible', next: !product.visible })}
                          className={product.visible ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                        >
                          {product.visible ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          aria-pressed={product.deployable}
                          onClick={() => setToggle({ product, field: 'deployable', next: !product.deployable })}
                          className={product.deployable ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                        >
                          {product.deployable ? 'Stop ordering' : 'Allow ordering'}
                        </button>
                        <button type="button" onClick={() => setRemoving(product)} className={denseDanger}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CardList>
            </div>
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;products.write&quot;, so the catalog is read-only for you.
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={toggle !== null}
        title={
          toggle
            ? toggle.field === 'visible'
              ? `${toggle.next ? 'Show' : 'Hide'} ${toggle.product.name}`
              : `${toggle.next ? 'Allow ordering of' : 'Stop ordering of'} ${toggle.product.name}`
            : ''
        }
        description={
          toggle
            ? toggle.field === 'visible'
              ? toggle.next
                ? `${toggle.product.name} appears in the public catalog again.`
                : `${toggle.product.name} disappears from the public catalog. Existing instances keep running.`
              : toggle.next
                ? `Customers can order ${toggle.product.name} again.`
                : `Customers can no longer order ${toggle.product.name}. Existing instances keep running.`
            : undefined
        }
        confirmLabel={toggle && toggle.field === 'visible' ? (toggle.next ? 'Show product' : 'Hide product') : 'Save'}
        onConfirm={confirmToggle}
        onCancel={() => setToggle(null)}
        busy={patchProduct.pending}
      />

      <ConfirmDialog
        open={removing !== null}
        title={`Delete ${removing?.name ?? ''}`}
        description={
          removing
            ? `This deletes ${removing.name} from the catalog. Products that still have instances are refused by the API — hide the product instead.`
            : undefined
        }
        confirmLabel="Delete product"
        requireText={removing?.name}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
        busy={removeProduct.pending}
      />

      {(patchProduct.error || removeProduct.error) && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {patchProduct.error ?? removeProduct.error}
        </p>
      )}
    </div>
  );
}

/**
 * The egg of the panel of a product.
 *
 * The product is opened for ordering only when the panel can build it, and
 * that needs the egg. The field is here so the staff area can set it without
 * the database.
 */
function EggForm({
  product,
  value,
  onChange,
  onSaved,
  busy,
}: {
  product: AdminProduct;
  value: string;
  onChange: (value: string) => void;
  onSaved: (id: string, eggId: number | null) => void;
  busy: boolean;
}) {
  const changed = value.trim() === '' ? product.eggId !== null : Number(value) !== product.eggId;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[12.5px] text-ink3">
        Egg of the panel
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="the id of the egg"
          className="h-10 w-32 rounded-xl bg-s3 px-3 font-mono text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc"
        />
      </label>
      <button
        type="button"
        disabled={!changed || busy || Number.isNaN(Number(value))}
        onClick={() => onSaved(product.id, value.trim() === '' ? null : Number(value))}
        className="h-10 rounded-full bg-s2 px-4 text-[13px] font-bold text-ink transition-colors duration-[180ms] hover:bg-s3 disabled:opacity-40"
      >
        Save the egg
      </button>
    </div>
  );
}

function NewProductForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('WEB_CMS');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('box');
  const [dockerImage, setDockerImage] = useState('');
  const [eggId, setEggId] = useState('');
  const [minRam, setMinRam] = useState('512');
  const [minCpu, setMinCpu] = useState('1');
  const [minDisk, setMinDisk] = useState('5');
  const [maxRam, setMaxRam] = useState('16384');
  const [maxCpu, setMaxCpu] = useState('4');
  const [maxDisk, setMaxDisk] = useState('100');
  const [baseAmount, setBaseAmount] = useState('0');
  const [visible, setVisible] = useState(true);
  const [deployable, setDeployable] = useState(false);
  const [touched, setTouched] = useState(false);

  const create = useAction(async () => {
    return post<{ product: { id: string; slug: string; name: string } }>('/admin/products', {
      slug: slug.trim(),
      name: name.trim(),
      category,
      description: description.trim(),
      icon: icon.trim() || 'box',
      dockerImage: dockerImage.trim() || null,
      // The egg of the panel. Without it the product cannot be built, and it
      // cannot be opened for ordering.
      eggId: eggId.trim() === '' ? null : Number(eggId),
      minRam: Number(minRam),
      minCpu: Number(minCpu),
      minDisk: Number(minDisk),
      maxRam: Number(maxRam),
      maxCpu: Number(maxCpu),
      maxDisk: Number(maxDisk),
      baseAmount: Number(baseAmount),
      visible,
      deployable,
    });
  });

  const slugError = touched && !/^[a-z0-9-]{2,60}$/.test(slug.trim()) ? 'Use 2 to 60 lowercase letters, numbers or dashes.' : undefined;
  const nameError = touched && name.trim().length < 2 ? 'Give the product a name.' : undefined;
  const descriptionError = touched && description.trim().length < 10 ? 'Write at least 10 characters.' : undefined;
  const numberError = touched && [minRam, minCpu, minDisk, maxRam, maxCpu, maxDisk, baseAmount].some((value) => !/^\d+$/.test(value.trim()))
    ? 'Use whole numbers only.'
    : undefined;

  const submit = async () => {
    setTouched(true);
    if (!/^[a-z0-9-]{2,60}$/.test(slug.trim()) || name.trim().length < 2 || description.trim().length < 10) return;
    const result = await create.run();
    if (!result) return;
    toast.push(`${result.product.name} added to the catalog`, 'ok');
    onDone();
  };

  return (
    <div className="mb-4 grid gap-3 rounded-2xl bg-s2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug" htmlFor="product-slug" error={slugError} hint="Lowercase, numbers and dashes.">
          <input
            id="product-slug"
            type="text"
            autoComplete="off"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="wordpress"
            className={denseInput}
          />
        </Field>
        <Field label="Name" htmlFor="product-name" error={nameError}>
          <input
            id="product-name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="WordPress"
            className={denseInput}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="product-category">
          <select
            id="product-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={denseSelect}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon" htmlFor="product-icon" hint="Icon name used by the catalog.">
          <input
            id="product-icon"
            type="text"
            autoComplete="off"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className={denseInput}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="product-description" error={descriptionError}>
        <textarea
          id="product-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the customer gets with this app."
          className="w-full scroll-mt-24 rounded-2xl bg-s3 p-3 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-line lg:text-[14px]"
        />
      </Field>

      <Field label="Docker image" htmlFor="product-image" hint="Optional. The image the worker provisions.">
        <input
          id="product-image"
          type="text"
          autoComplete="off"
          value={dockerImage}
          onChange={(event) => setDockerImage(event.target.value)}
          placeholder="ghcr.io/example/app:latest"
          className={denseInput}
        />
      </Field>

      <Field
        label="Egg of the panel"
        htmlFor="product-egg"
        hint="The id of the egg on the panel. Without it the product cannot be built, so it cannot be opened for ordering."
      >
        <input
          id="product-egg"
          type="number"
          inputMode="numeric"
          min={1}
          value={eggId}
          onChange={(event) => setEggId(event.target.value)}
          placeholder="the id of the egg"
          className={denseInput}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Min memory (MB)" htmlFor="product-min-ram">
          <input
            id="product-min-ram"
            type="number"
            inputMode="numeric"
            min={1}
            value={minRam}
            onChange={(event) => setMinRam(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Min vCPU" htmlFor="product-min-cpu">
          <input
            id="product-min-cpu"
            type="number"
            inputMode="numeric"
            min={1}
            value={minCpu}
            onChange={(event) => setMinCpu(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Min disk (GB)" htmlFor="product-min-disk">
          <input
            id="product-min-disk"
            type="number"
            inputMode="numeric"
            min={1}
            value={minDisk}
            onChange={(event) => setMinDisk(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Max memory (MB)" htmlFor="product-max-ram">
          <input
            id="product-max-ram"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxRam}
            onChange={(event) => setMaxRam(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Max vCPU" htmlFor="product-max-cpu">
          <input
            id="product-max-cpu"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxCpu}
            onChange={(event) => setMaxCpu(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Max disk (GB)" htmlFor="product-max-disk">
          <input
            id="product-max-disk"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxDisk}
            onChange={(event) => setMaxDisk(event.target.value)}
            className={denseInput}
          />
        </Field>
      </div>

      <Field label="Base price (cents)" htmlFor="product-base" hint="Integer minor units. The server prices every quote." error={numberError}>
        <input
          id="product-base"
          type="number"
          inputMode="numeric"
          min={0}
          value={baseAmount}
          onChange={(event) => setBaseAmount(event.target.value)}
          className={denseInput}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={visible} onClick={() => setVisible((value) => !value)} className={visible ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}>
          {visible ? 'Visible in the catalog' : 'Hidden from the catalog'}
        </button>
        <button
          type="button"
          aria-pressed={deployable}
          onClick={() => setDeployable((value) => !value)}
          className={deployable ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
        >
          {deployable ? 'Customers can order it' : 'Customers cannot order it'}
        </button>
      </div>

      {create.error && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {create.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={create.pending} className={densePrimary}>
          {create.pending ? 'Saving…' : 'Create product'}
        </button>
      </div>
    </div>
  );
}
