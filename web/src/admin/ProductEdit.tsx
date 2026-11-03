import { useEditorBack } from '../ui-app';
import { useParams, useRouter } from '../router';
import { can, useAdminSession } from './Overview';
import ProductEditor from './ProductEditor';

const BACK_TO = '/admin/products';

/** One product on its own page. The list only links here. */
export default function ProductEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const staff = useAdminSession().staff;
  useEditorBack({ to: BACK_TO, label: 'Back to catalog', context: 'Catalog' });
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 pt-3">
      <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.04em] text-ink">Edit product</h1>
      <ProductEditor id={id} mayWrite={can(staff, 'products.write')} onClose={() => navigate(BACK_TO)} onSaved={() => undefined} />
    </div>
  );
}
