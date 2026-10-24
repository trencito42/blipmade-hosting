import { LegalPage } from '../legal/LegalPage';
import { PRIVACY } from '../legal/documents/privacy';

export default function Privacy() {
  return <LegalPage document={PRIVACY} />;
}
