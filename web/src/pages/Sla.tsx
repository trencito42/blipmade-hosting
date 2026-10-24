import { LegalPage } from '../legal/LegalPage';
import { SLA } from '../legal/documents/sla';

export default function Sla() {
  return <LegalPage document={SLA} />;
}
