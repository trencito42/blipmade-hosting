import { useRouter } from '../router';
import { PageEditorShell } from '../app/components/premium';
import { can, useAdminSession } from './Overview';
import { NewProductForm } from './Products';

/** A new product on its own page. The form keeps its own Save and Cancel. */
export default function ProductNew() {
  const { navigate } = useRouter();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  return (
    <PageEditorShell eyebrow="Catalog" title="New product" description="Apps and databases that customers can buy." backTo="/admin/products" backLabel="Back to catalog" actions={null}>
      {mayWrite ? <NewProductForm onDone={() => navigate('/admin/products')} /> : <p className="text-[13px] text-ink3">Your role does not hold &quot;products.write&quot;.</p>}
    </PageEditorShell>
  );
}
