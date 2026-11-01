/**
 * Plain-language reasons for the failures that stop a server from starting, found in its own logs. It is a short list of
 * patterns that are known to mean one thing; when nothing matches it says so and does not guess.
 */

export interface Finding {
  id: string;
  title: string;
  why: string;
  fix: string;
}

interface Rule {
  id: string;
  test: RegExp;
  title: string;
  why: string;
  fix: string;
  /** Rules for one kind of product only. */
  only?: RegExp;
}

const RULES: Rule[] = [
  {
    id: 'eula', test: /you need to agree to the EULA|eula\.txt/i, only: /minecraft/,
    title: 'The Minecraft EULA is not accepted',
    why: 'Minecraft refuses to start until the EULA is accepted.',
    fix: 'Open the Startup tab and set EULA to TRUE (or open eula.txt in the Files tab and write eula=true), then start the server.',
  },
  {
    id: 'java-version', test: /UnsupportedClassVersionError|class file version \d+|requires Java \d+|Unsupported class file major version/i,
    title: 'The Java version does not match',
    why: 'The program was built for a newer Java than the one this server runs.',
    fix: 'Open the Startup tab and pick a newer Java image if there is one, or use an older version of the program.',
  },
  {
    id: 'oom', test: /java\.lang\.OutOfMemoryError|JavaScript heap out of memory|FATAL ERROR: .*heap|Killed\s*$|oom-kill|Cannot allocate memory/im,
    title: 'The server ran out of memory',
    why: 'It tried to use more memory than the plan gives it, so it was stopped.',
    fix: 'Lower what the app uses (fewer plugins, a smaller view distance, a smaller cache), or raise the memory of the plan in the Resources tab.',
  },
  {
    id: 'port-in-use', test: /EADDRINUSE|Address already in use|BindException|Failed to bind to|port .* is already in use/i,
    title: 'The port is taken',
    why: 'Something else in the same server is already listening on that port.',
    fix: 'Make the app listen on the port in the SERVER_PORT variable. In Node: process.env.SERVER_PORT. Do not start the app twice.',
  },
  {
    id: 'node-module', test: /Cannot find module ['"][^'"]+['"]|ERR_MODULE_NOT_FOUND/i,
    title: 'A package is missing',
    why: 'The app asks for a package that was not installed.',
    fix: 'Add it to package.json and run the install again. With Deploy from Git, put `npm ci` (or `npm install`) in the build command.',
  },
  {
    id: 'node-entry', test: /Cannot find module '\/home\/container\/(?:index|app|main|server)\.js'|no such file or directory, open '[^']*package\.json'|Missing script: "?start"?/i,
    title: 'There is nothing to start',
    why: 'The start file or the start script is not there.',
    fix: 'Upload your app in the Files tab, or set up Deploy from Git. Check that package.json has a "start" script, or change the start command.',
  },
  {
    id: 'permission', test: /EACCES|Permission denied/i,
    title: 'A file or folder cannot be used',
    why: 'The program is not allowed to read or write there.',
    fix: 'Write only inside the server folder, and do not use system paths like /usr or /var. In the Files tab you can change the permissions of a file.',
  },
  {
    id: 'npm-error', test: /npm ERR! (?:code|errno) (\w+)/i,
    title: 'npm stopped with an error',
    why: 'An install or a script of the app failed.',
    fix: 'Read the lines above the "npm ERR!" ones in the log: they name the package or the script that failed.',
  },
  {
    id: 'git-clone', test: /fatal: (?:repository|could not read|unable to access)|Remote branch .* not found/i,
    title: 'The repository could not be fetched',
    why: 'The address is wrong, the repository is private, or the branch does not exist.',
    fix: 'Check the address and the branch in the Deploy tab. Only public repositories are supported.',
  },
  {
    id: 'build-timeout', test: /took longer than \d+ (?:seconds|minutes)/i,
    title: 'The build took too long',
    why: 'A build can run for at most 15 minutes, and a clone for 5.',
    fix: 'Make the build lighter (cache, fewer steps), or build elsewhere and commit the result.',
  },
  {
    id: 'discord-token', test: /TOKEN_INVALID|An invalid token was provided|Incorrect login details/i,
    title: 'The Discord token is not accepted',
    why: 'Discord refused the token the bot logged in with.',
    fix: 'Make a new token in the Discord developer portal and set it as the environment variable your bot reads.',
  },
  {
    id: 'database', test: /ECONNREFUSED .*:3306|Access denied for user|Unknown database|ER_ACCESS_DENIED_ERROR/i,
    title: 'The database refuses the connection',
    why: 'The host, the user, the password or the database name does not match.',
    fix: 'Open the Databases tab, press Credentials, and use exactly those values. The host is the one shown there, not localhost.',
  },
  {
    id: 'disk', test: /No space left on device|ENOSPC|Disk quota exceeded/i,
    title: 'The disk is full',
    why: 'The server has no free space left.',
    fix: 'Delete old files, backups you do not need, or logs in the Files tab, or raise the disk of the plan.',
  },
];

export function diagnose(text: string, product = ''): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (rule.only && !rule.only.test(product)) continue;
    if (rule.test.test(text)) findings.push({ id: rule.id, title: rule.title, why: rule.why, fix: rule.fix });
  }
  return findings;
}

/**
 * Takes out what must not leave the server in a ticket: values next to a secret-looking name, bearer tokens, URLs with a
 * password in them, and long random-looking strings. It is meant to over-remove rather than miss.
 */
export function redact(text: string): string {
  return text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [removed]')
    .replace(/(["']?[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|private[_-]?key|auth|credential|salt|dsn)[A-Za-z0-9_.-]*["']?\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1[removed]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[removed]@')
    .replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, '[removed]')
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, '[removed]');
}

/** The last lines of a log, cleaned. */
export function tail(text: string, lines = 40): string {
  return text.split('\n').slice(-lines).join('\n').slice(-6000);
}
