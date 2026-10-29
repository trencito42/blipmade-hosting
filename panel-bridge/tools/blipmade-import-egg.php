<?php

declare(strict_types=1);

/**
 * Imports an egg into the panel, through the panel's own service.
 *
 * The same road as the button of the interface (Administration -> Nests ->
 * Discord Bots -> Import Egg): the parser of the panel reads the file and
 * creates the egg, its variables and its scripts, in one transaction.
 *
 * The import is a route of the panel that needs a session of an administrator,
 * so it cannot be done with the Application API of the platform. The service
 * can be called directly, which is what this tool does.
 *
 * Usage, on the panel host:
 *
 *     cd /var/www/pterodactyl && php /root/blipmade-panel-tools/blipmade-import-egg.php /tmp/postgres16.json 5
 *
 * The second argument is the nest. The nest of the products of Blipmade is
 * "Discord Bots", which is the nest 5 in this panel.
 */

$panel = getenv('BLIPMADE_PANEL_ROOT') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require_once $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Http\UploadedFile;
use Pterodactyl\Services\Eggs\Sharing\EggImporterService;

$path = $argv[1] ?? '';
$nest = (int) ($argv[2] ?? 5);

if ($path === '' || !is_readable($path)) {
    fwrite(STDERR, "the egg file is not readable\n");
    exit(1);
}

$file = new UploadedFile(
    eggFileWithUnixLines($path),
    basename($path),
    'application/json',
    null,
    true
);

$service = $app->make(EggImporterService::class);
$egg = $service->handle($file, $nest);

fwrite(STDERR, "ou importat: id=" . $egg->id . " nume=" . $egg->name . " cuib=" . $egg->nest_id . "\n");

/**
 * Gives the panel a file whose lines end with LF.
 *
 * The file of an egg is the export of the panel, and the export ends the lines
 * of the scripts with CRLF. The shell of the container reads the script as it
 * is, so a carriage return becomes part of the command and the install stops
 * at its first line. The live eggs of the panel carry LF, so the file is
 * brought to the same shape before it is given to the panel.
 *
 * The file is read as JSON before it is written, because the carriage returns
 * of the export are written in the file as the two characters "\r\n": they
 * are only carriage returns once the file is read.
 */
function eggFileWithUnixLines(string $path): string
{
    $raw = (string) file_get_contents($path);
    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
        throw new RuntimeException('the egg file is not JSON');
    }

    $unix = json_encode(eggLinesWithUnix($parsed));
    $temporary = tempnam(sys_get_temp_dir(), 'blipmade-egg-');
    file_put_contents($temporary, (string) $unix);

    return $temporary;
}

/**
 * Brings every text of the file to LF.
 *
 * The texts of an egg are the script of the install, the script of the entry
 * and the files the game is made of. They are all read as they are by the
 * container, so they all have to end their lines with LF.
 */
function eggLinesWithUnix(mixed $value): mixed
{
    if (is_string($value)) {
        return str_replace(["\r\n", "\r"], "\n", $value);
    }
    if (is_array($value)) {
        $result = [];
        foreach ($value as $key => $item) {
            $result[$key] = eggLinesWithUnix($item);
        }

        return $result;
    }

    return $value;
}
