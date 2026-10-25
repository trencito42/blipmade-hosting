import { EVENT_DEFINITIONS } from '../src/services/notification-events.js';
import { emailTemplateCatalog } from '../src/lib/email-design.js';

const rows = Object.values(EVENT_DEFINITIONS).map((definition) => ({
  type: definition.type,
  template: definition.template,
  category: definition.category,
  classification: definition.classification,
  audience: definition.audience,
  channels: definition.channels,
  holdsSecret: definition.holdsSecret === true,
  title: definition.title({} as never),
}));

console.log('=== EVENTS ===');
console.log(JSON.stringify(rows, null, 1));
console.log('=== TEMPLATES ===');
console.log(JSON.stringify(emailTemplateCatalog(), null, 1));
