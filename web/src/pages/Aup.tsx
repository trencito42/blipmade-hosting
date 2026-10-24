import { LegalPage } from '../legal/LegalPage';
import { AUP } from '../legal/documents/aup';

export default function Aup() {
  return <LegalPage document={AUP} />;
}
