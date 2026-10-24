/**
 * The legal pages of the platform.
 *
 * The list is here so that the router, the footer and the tests always talk
 * about the same six pages.
 */

import { TERMS } from './terms';
import { PRIVACY } from './privacy';
import { COOKIES } from './cookies';
import { AUP } from './aup';
import { REFUND } from './refund';
import { SLA } from './sla';
import type { LegalDocument } from '../types';

export { TERMS, PRIVACY, COOKIES, AUP, REFUND, SLA };

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS, PRIVACY, COOKIES, AUP, REFUND, SLA];
