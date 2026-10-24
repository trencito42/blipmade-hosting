/**
 * The stand-in for the application that runs on a game/server node.
 *
 * The customer journey sandbox does not have real containers, so the health
 * probe of the platform cannot find anything on the allocated port and every
 * instance would end in the state "failed". This small server answers with
 * 200 on the ports the panel stub allocates, so the provisioning path can be
 * walked to the end.
 */
import http from 'node:http';

const PORTS = [25565, 25566, 25567, 25568, 25569, 25570, 25571, 25572];
const HOST = '10.77.0.11';

for (const port of PORTS) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('blipmade journey sandbox node\n');
  });
  server.listen(port, HOST, () => {
    console.log(`node responder on http://${HOST}:${port}/`);
  });
  server.on('error', (error) => console.error(`port ${port}: ${error.message}`));
}
