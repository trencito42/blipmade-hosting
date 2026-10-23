
// Blipmade panel bridge (panel-bridge/). The marker in this line tells install.sh that the
// route is already there, so the script may be run again without adding it twice.
//
// This endpoint issues a client API key for ONE customer. It authenticates with its own
// signature, so the session of the panel is not involved and the CSRF token does not apply.
// The throttle keeps a wrong signature from being tried over and over again.
Route::post('/blipmade/keymint', \Pterodactyl\Http\Controllers\BlipmadeKeyMintController::class)
    ->withoutMiddleware([\Pterodactyl\Http\Middleware\VerifyCsrfToken::class])
    ->middleware('throttle:30,1')
    ->name('api.blipmade.keymint');
