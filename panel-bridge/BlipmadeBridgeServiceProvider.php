<?php

namespace Pterodactyl\Providers;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Registers the one route of the Blipmade bridge.
 *
 * The route is registered by a provider and not by a file in routes/, because every route file
 * of the panel sits behind a middleware that asks for a session or for an API key:
 *
 *  - routes/base.php, routes/admin.php and routes/auth.php sit behind "web", which asks for a
 *    session and for a CSRF token.
 *  - routes/api-client.php sits behind "client-api", which asks for a client key.
 *  - routes/api-application.php sits behind "application-api", which asks for an application key.
 *
 * The bridge carries its own signature, so it must not sit behind any of them. The middleware
 * "api" is left out on purpose as well: it holds "auth:sanctum", which would answer 401 before
 * the controller ever sees the request, and "AuthenticateIPAccess", which reads the key of the
 * caller out of the session and would fail on a request that has none.
 *
 * The route is added before the fallback of the panel, so it is never swallowed by the catch all
 * of the single page application.
 */
class BlipmadeBridgeServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::post('/api/blipmade/keymint', \Pterodactyl\Http\Controllers\BlipmadeKeyMintController::class)
            ->middleware('throttle:30,1')
            ->name('api.blipmade.keymint');
    }
}
