<?php

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Pterodactyl\Models\User;

/**
 * Server-to-server endpoint: Blipmade asks the panel to issue a Client API key for ONE customer.
 *
 * The panel cannot do this on its own. The application API has no route that creates a token and
 * the client API refuses an application key, so a credential that is scoped to one customer can
 * only be created by code that runs inside the panel. This controller is that code, and it is the
 * only place where a client key is made.
 *
 * Security:
 *  - HMAC-SHA256 over "<timestamp>.<nonce>.<external_id>" with a secret only Blipmade and the panel know.
 *  - 60 second window, nonces are single use (replay protection).
 *  - Only users whose external_id starts with "blipmade_acc_" and who are NOT root admins.
 *  - The key is bound to BLIPMADE_KEYMINT_ALLOWED_IPS, and the previous key of the account is revoked.
 *
 * The file belongs in app/Http/Controllers/. Pterodactyl maps the Pterodactyl\ namespace to app/,
 * so the namespace of this file is the one of the controllers of the panel itself.
 */
class BlipmadeKeyMintController extends Controller
{
    /** The description of the key. It also names the key that is revoked before a new one is made. */
    private const MEMO = 'blipmade-console';

    /** How long a nonce is remembered. It outlives the window, so a replay is always caught. */
    private const NONCE_TTL_SECONDS = 120;

    /** How far the clock of the caller may be away from the clock of the panel. */
    private const MAX_CLOCK_SKEW_SECONDS = 60;

    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('blipmade_bridge.keymint_secret');
        if ($secret === '' || strlen($secret) < 32) {
            Log::warning('Blipmade key mint refused: the shared secret is missing or too short');
            return new JsonResponse(['error' => 'disabled'], 503);
        }

        $ips = $this->allowedIps();
        if (count($ips) === 0) {
            // A key that may be used from any address is not handed out. The list names the
            // Blipmade server, so a stolen key is worth nothing outside of it.
            Log::warning('Blipmade key mint refused: the list of allowed addresses is empty');
            return new JsonResponse(['error' => 'disabled'], 503);
        }

        $externalId = (string) $request->input('external_id', '');
        $timestamp = (string) $request->input('timestamp', '');
        $nonce = (string) $request->input('nonce', '');
        $signature = (string) $request->input('signature', '');

        if (
            !preg_match('/^blipmade_acc_[A-Za-z0-9_-]{1,64}$/', $externalId)
            || !ctype_digit($timestamp)
            || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $nonce)
            || !preg_match('/^[a-f0-9]{64}$/', $signature)
        ) {
            Log::warning('Blipmade key mint refused: the request does not have the expected shape');
            return new JsonResponse(['error' => 'invalid_request'], 400);
        }

        // The signature covers the whole request: the time, the nonce and the account. The time
        // keeps an old request from being used again, the nonce keeps a fresh one from being
        // sent twice, and the account keeps a signature of one account from opening another.
        $expected = hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $externalId, $secret);
        if (!hash_equals($expected, $signature)) {
            Log::warning('Blipmade key mint refused: the signature does not match', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'unauthorized'], 401);
        }

        if (abs(time() - (int) $timestamp) > self::MAX_CLOCK_SKEW_SECONDS) {
            Log::warning('Blipmade key mint refused: the timestamp lies outside of the window', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'unauthorized'], 401);
        }

        // Cache::add is atomic: it fails when the nonce was already used.
        if (!Cache::add('blipmade_keymint_nonce_' . $nonce, 1, self::NONCE_TTL_SECONDS)) {
            Log::warning('Blipmade key mint refused: the nonce was already used', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'replayed'], 401);
        }

        // The account is found by its external id and by nothing else. An address is never used
        // for this, because an address can be typed by hand and can belong to somebody else.
        $user = User::where('external_id', $externalId)->first();
        if ($user === null) {
            Log::warning('Blipmade key mint refused: no account of the panel carries this external id', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'not_found'], 404);
        }

        if ($user->root_admin) {
            // A root administrator may do everything on the panel, so a key for one would not be
            // scoped to a customer at all.
            Log::warning('Blipmade key mint refused: the account is a root administrator', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'not_found'], 404);
        }

        $hasMemo = Schema::hasColumn('api_keys', 'memo');
        $this->revokePreviousKey($user, $hasMemo);

        $token = $user->createToken(self::MEMO, $ips);

        if ($hasMemo) {
            // The description of a key is kept in the "memo" column on the panels that store it.
            // It is written here as well, so the next mint finds this key by its description.
            $token->accessToken->forceFill(['memo' => self::MEMO])->save();
        }

        // plainTextToken is only the secret part of the key; the usable bearer key is the
        // identifier plus the secret. The identifier starts with "ptlc_", which is what
        // the panel expects on a client endpoint, and the whole key is 48 characters.
        return new JsonResponse(['token' => $token->accessToken->identifier . $token->plainTextToken]);
    }

    /**
     * The addresses a client key may be used from.
     *
     * An empty list means the bridge is switched off, because a key without a list would work
     * from every address of the world.
     */
    private function allowedIps(): array
    {
        $raw = (string) config('blipmade_bridge.keymint_allowed_ips');

        return array_values(array_filter(array_map('trim', explode(',', $raw))));
    }

    /**
     * Revokes the previous key of this account, so one account never keeps more than one live key.
     *
     * The description of a key lives in the "memo" column on the panels that keep it, and only
     * the key with the same description is dropped. A panel without that column keeps no
     * description at all, so every key of the account is dropped instead: the bridge is the
     * only issuer of keys for these accounts.
     */
    private function revokePreviousKey(User $user, bool $hasMemo): void
    {
        $tokens = $user->tokens();
        if ($hasMemo) {
            $tokens->where('memo', self::MEMO)->delete();

            return;
        }

        $tokens->delete();
    }
}
