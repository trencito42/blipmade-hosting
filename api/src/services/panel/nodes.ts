import { env } from '../../env.js';

/**
 * The addresses of the nodes of the panel.
 *
 * The panel answers with the address of a node as it is known on the internet.
 * That address is not always the one that can be reached from this server: a
 * node that sits behind a different route than the one of the panel is only
 * reachable over the network of the host.
 *
 * The operator names the address that works in PANEL_NODE_ADDRESSES. The name
 * of the node is kept for the certificate of the connection, so the
 * certificate of the node is still the one that is checked.
 */

export interface NodeAddress {
  /** The address that is used to open the connection. */
  host: string;
  /** The name that the certificate of the node is checked against. */
  servername: string;
}

/** The addresses the operator named, by the address the panel uses. */
function nodeAddresses(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of env.PANEL_NODE_ADDRESSES.split(',')) {
    const [panel, reachable] = pair.split('=').map((value) => value?.trim());
    if (!panel || !reachable) continue;
    map.set(panel, reachable);
  }
  return map;
}

/**
 * The address to open the connection to a node with.
 *
 * The address of the panel is used when the operator named no other one.
 */
export function nodeAddressFor(address: string): NodeAddress {
  const url = new URL(address);
  const override = nodeAddresses().get(url.host) ?? nodeAddresses().get(url.hostname);
  if (!override) return { host: url.host, servername: url.hostname };

  const replacement = new URL(`${url.protocol}//${override}`);
  return { host: replacement.host, servername: url.hostname };
}
