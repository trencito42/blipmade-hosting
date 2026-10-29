<?php

declare(strict_types=1);

/**
 * Updates an egg of the panel, through the panel's own service.
 *
 * The same road as the button of the interface (Administration -> Nests ->
 * Discord Bots -> Update Egg): the parser of the panel reads the file and
 * brings the egg, its variables and its scripts to what the file says, in one
 * transaction.
 *
 * The update is a route of the panel that needs a session of an administrator,
 * so it cannot be done with the Application API of the platform. The service
 * can be called directly, which is what this tool does.
 *
 * The egg keeps the number it has: the products of the platform point to that
 * number, and they keep working after the update.
 *
 * Usage, on the panel host:
 *
 *     cd /var/www/pterodactyl && php /root/blipmade-panel-tools/blipmade-update-egg.php /tmp/minecraft-paper.json "Paper" 5
 *
 * The second argument is the name of the egg. The third is the nest. The nest
 * of the products of Blipmade is "Discord Bots", which is the nest 5 in this
 * panel.
 */

$panel = getenv('BLIPMADE_PANEL_ROOT') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require_once $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Http\UploadedFile;
use Pterodactyl\Models\Egg;
use Pterodactyl\Services\Eggs\Sharing\EggUpdateImporterService;

$path = $argv[1] ?? '';
$name = $argv[2] ?? '';
$nest = (int) ($argv[3] ?? 5);

if ($path === '' || !is_readable($path)) {
    fwrite(STDERR, "the egg file is not readable\n");
    exit(1);
}

if ($name === '') {
    fwrite(STDERR, "the name of the egg is needed\n");
    exit(1);
}

$egg = Egg::query()->where('name', $name)->where('nest_id', $nest)->first();
if ($egg === null) {
    fwrite(STDERR, "the egg does not exist: {$name}\n");
    exit(1);
}

$file = new UploadedFile(
    eggFileWithUnixLines($path),
    basename($path),
    'application/json',
    null,
    true
);

$service = $app->make(EggUpdateImporterService::class);
$updated = $service->handle($egg, $file);

$variables = $updated->variables()->get()->pluck('env_variable')->implode(',');
fwrite(STDERR, "actualizat: id={$updated->id} nume={$updated->name} variabile={$variables}\n");

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
