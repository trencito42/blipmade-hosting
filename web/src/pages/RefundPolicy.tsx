import { LegalPage } from '../legal/LegalPage';
import { REFUND } from '../legal/documents/refund';

export default function RefundPolicy() {
  return <LegalPage document={REFUND} />;
}
