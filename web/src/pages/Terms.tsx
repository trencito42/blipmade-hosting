import { LegalPage } from '../legal/LegalPage';
import { TERMS } from '../legal/documents/terms';

export default function Terms() {
  return <LegalPage document={TERMS} />;
}
