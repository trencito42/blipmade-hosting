import { describe, expect, it } from 'vitest';
import { patchDefaultConf, patchFastcgiParams } from '../src/services/nginx-proxy.js';

describe('nginx behind the edge', () => {
  it('reads the forwarded protocol and is safe to repeat', () => {
    const params = 'fastcgi_param  REQUEST_METHOD  $request_method;\nfastcgi_param  HTTPS              $https if_not_empty;\n';
    const patched = patchFastcgiParams(params);
    expect(patched).toContain('HTTPS              $blipmade_https if_not_empty;');
    expect(patchFastcgiParams(patched as string)).toBeNull();
    expect(patchFastcgiParams('nothing relevant\n')).toBeNull();
    const conf = patchDefaultConf('server { listen 80; }\n') as string;
    expect(conf.startsWith('map $http_x_forwarded_proto $blipmade_https')).toBe(true);
    expect(patchDefaultConf(conf)).toBeNull();
  });
});
