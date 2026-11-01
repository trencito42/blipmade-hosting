/**
 * Makes the nginx of a web egg tell PHP that the visitor came over HTTPS.
 *
 * The edge of the platform ends the TLS and talks plain HTTP to the container, so the egg's nginx tells
 * PHP the request was not secure and WordPress writes http:// addresses that browsers block as mixed
 * content. The edge sends `X-Forwarded-Proto: https`; here the egg's nginx is told to believe it.
 */
const MAP_LINE = 'map $http_x_forwarded_proto $blipmade_https { default ""; https on; }';

/** The new content of `nginx/fastcgi_params`, or null when it needs no change. */
export function patchFastcgiParams(content: string): string | null {
  if (content.includes('$blipmade_https')) return null;
  const pattern = /^(fastcgi_param\s+HTTPS\s+)\$https(\s+if_not_empty;)/m;
  if (!pattern.test(content)) return null;
  return content.replace(pattern, '$1$blipmade_https$2');
}

/** The new content of `nginx/conf.d/default.conf`, or null when it needs no change. */
export function patchDefaultConf(content: string): string | null {
  if (content.includes('$blipmade_https')) return null;
  return `${MAP_LINE}\n\n${content}`;
}
