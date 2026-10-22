/**
 * Checks the deployment verification against the node.
 *
 * The verification is the part that decides whether a provisioned instance is
 * really up. It has to pass for a service that answers and fail for one that
 * does not, so both cases are run here against the live node.
 *
 * Environment:
 *   BM_NODE      the address of the node (default 10.77.0.11)
 *   BM_PORT      the port of a running service (default 30000)
 *   BM_CLOSED    a port nothing listens on (default 30010)
 */
import { verifyDeployment, probeFor } from '../../api/src/services/provisioning.js';

async function main(): Promise<void> {
  const node = process.env.BM_NODE ?? '10.77.0.11';
  const port = Number(process.env.BM_PORT ?? 30000);
  const closed = Number(process.env.BM_CLOSED ?? 30010);

  const httpProbe = {
    kind: 'http',
    path: '/',
    expectStatus: [200, 201, 204, 301, 302, 307, 308],
    timeoutMs: 8000,
  };

  console.log(`node ${node}`);

  const good = await verifyDeployment(node, port, httpProbe, { attempts: 3, delayMs: 1000 });
  console.log(`service on ${port}: ok=${good.ok} status=${good.status} reason=${good.reason ?? '—'}`);

  const bad = await verifyDeployment(node, closed, httpProbe, { attempts: 2, delayMs: 1000 });
  console.log(`closed port ${closed}: ok=${bad.ok} reason=${bad.reason ?? '—'}`);

  const strict = await verifyDeployment(node, port, { ...httpProbe, expectStatus: [418] }, { attempts: 1, delayMs: 500 });
  console.log(`strict probe on ${port}: ok=${strict.ok} reason=${strict.reason ?? '—'}`);

  console.log(`default product probe: ${JSON.stringify(probeFor({ healthProbe: null }))}`);

  if (!good.ok) {
    console.error('The service that answers was not accepted.');
    process.exit(1);
  }
  if (bad.ok) {
    console.error('A closed port was accepted.');
    process.exit(1);
  }
  if (strict.ok) {
    console.error('A wrong status was accepted.');
    process.exit(1);
  }
  console.log('RESULT: the verification accepts a service that answers and rejects one that does not.');
}

void main();
