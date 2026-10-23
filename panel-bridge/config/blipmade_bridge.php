<?php

/**
 * Configuration of the bridge between Blipmade and this panel.
 *
 * Both values come from the .env of the panel, so the secret never ends up in a file that is
 * copied around or committed. The bridge stays switched off while the secret is missing or too
 * short, and it stays switched off while the list of allowed addresses is empty.
 */

return [
    /**
     * The secret that both sides sign with. At least 32 characters.
     * The endpoint answers 503 ("disabled") when it is missing.
     */
    'keymint_secret' => env('BLIPMADE_KEYMINT_SECRET'),

    /**
     * The addresses a client key may be used from, separated by commas.
     * Put the public address of the Blipmade server here. The endpoint answers 503 ("disabled")
     * when the list is empty, because a key without a list would work from every address.
     */
    'keymint_allowed_ips' => env('BLIPMADE_KEYMINT_ALLOWED_IPS', ''),
];
