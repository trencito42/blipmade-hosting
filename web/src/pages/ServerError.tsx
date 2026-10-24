import { ErrorPage } from '../ErrorBoundary';

/**
 * The page of a failure of the server.
 *
 * The route exists so that a page can be pointed at when the answer never
 * leaves the machine: the proxy in front of the site, or a person who opens
 * the address by hand. It is the same page as the one the boundary shows,
 * with the words of a server failure instead of the words of a crash of the
 * interface.
 */
export default function ServerError() {
  return (
    <ErrorPage
      code="Error 500"
      title="The server could not answer"
      message={
        <>
          The request could not be handled on our side. Nothing on your account was changed: no order was placed, no payment was
          taken and no server was touched. Try again in a moment.
        </>
      }
      kind="server"
    />
  );
}
