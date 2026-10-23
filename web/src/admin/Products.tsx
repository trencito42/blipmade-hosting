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
import { DASH, LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, denseSelect, useStaffUser } from './Overview';

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
  minRam: number;
  minCpu: number;
  minDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  prices: AdminPrice[];
  options: { id: string; code: string; name: string; amount: number; currency: string; active: boolean }[];
}

const CATEGORIES = ['WEB_CMS', 'DEVELOPER_TOOLS', 'MONITORING', 'AUTOMATION', 'BOTS', 'DATABASES'];

interface ToggleTarget {
  product: AdminProduct;
  field: 'visible' | 'deployable';
  next: boolean;
}

export default function Products() {
  const staff = useStaffUser();
  const toast = useToast();
  const [toggle, setToggle] = useState<ToggleTarget | null>(null);
  const [removing, setRemoving] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);

  const state = useAsync((signal) => get<{ products: AdminProduct[] }>('/admin/products', undefined, signal), []);
  const products = state.data?.products ?? [];
  const mayWrite = can(staff, 'products.write');

  const patchProduct = useAction(async (id: string, body: { visible?: boolean; deployable?: boolean }) => {
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
                    render: (product: AdminProduct) => (
                      <span className="text-ink2">{product.category.replace(/_/g, ' ')}</span>
                    ),
                  },
                  {
                    key: 'price',
                    header: 'Base price',
                    render: (product: AdminProduct) => monthlyPrice(product),
                  },
                  {
                    key: 'resources',
                    header: 'Min · max',
                    render: (product: AdminProduct) => (
                      <span className="font-mono text-[12.5px] text-ink2">
                        {product.minRam} MB · {product.minCpu} vCPU · {product.minDisk} GB
                      </span>
                    ),
                  },
                  {
                    key: 'visible',
                    header: 'Visible',
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
                    render: (product: AdminProduct) =>
                      mayWrite ? (
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
                      ),
                  },
                  ...(mayWrite
                    ? [
                        {
                          key: 'actions',
                          header: 'Action',
                          render: (product: AdminProduct) => (
                            <button type="button" onClick={() => setRemoving(product)} className={denseDanger}>
                              Delete
                            </button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              <CardList<AdminProduct> rows={products} rowKey={(product) => product.id}>
                {(product) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={product.name}>
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
                    </dl>
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
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
          {patchProduct.error ?? removeProduct.error}
        </p>
      )}
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
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
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
