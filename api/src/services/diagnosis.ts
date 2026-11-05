/**
 * Plain-language reasons for the failures that stop a server from starting, found in its own logs. It is a short list of
 * patterns that are known to mean one thing; when nothing matches it says so and does not guess.
 */

export interface Finding {
  id: string;
  title: string;
  why: string;
  fix: string;
  /** High means the text is a known error. Medium means the line shows a failure but not its cause. */
  confidence: 'high' | 'medium';
  /** An existing server tab that can act on the finding. */
  tab?: string;
}

interface Rule {
  id: string;
  test: RegExp;
  title: string;
  why: string;
  fix: string;
  confidence?: 'high' | 'medium';
  tab?: string;
  /** Rules for one kind of product only. */
  only?: RegExp;
}

const RULES: Rule[] = [
  {
    id: 'eula', test: /you need to agree to the EULA|eula\.txt/i, only: /minecraft/,
    title: 'The Minecraft EULA is not accepted',
    why: 'Minecraft refuses to start until the EULA is accepted.',
    fix: 'Open the Startup tab and set EULA to TRUE (or open eula.txt in the Files tab and write eula=true), then start the server.',
    tab: 'startup',
  },
  {
    id: 'mc-crash', test: /---- Minecraft Crash Report ----/, only: /minecraft-(?!bedrock)/,
    title: 'Minecraft wrote a crash report',
    why: 'The game stopped and wrote a crash report. That file is the record of the stop, not a guess from a single word.',
    fix: 'Open the crash report in the Files tab, under crash-reports. The first "Caused by" line names the mod or the setting that stopped it.',
    tab: 'files',
  },
  {
    id: 'java-version', test: /UnsupportedClassVersionError|class file version \d+|requires Java \d+|Unsupported class file major version/i,
    title: 'The Java version does not match',
    why: 'The program was built for a newer Java than the one this server runs.',
    fix: 'Open the Startup tab and pick a newer Java image if there is one, or use an older version of the program.',
    tab: 'startup',
  },
  {
    id: 'oom', test: /java\.lang\.OutOfMemoryError|JavaScript heap out of memory|FATAL ERROR: .*heap|oom-kill|Cannot allocate memory/i,
    title: 'The server ran out of memory',
    why: 'It tried to use more memory than the plan gives it, so it was stopped.',
    fix: 'Lower what the app uses (fewer plugins, a smaller view distance, a smaller cache), or raise the memory of the plan in the Resources tab.',
    tab: 'resources',
  },
  {
    id: 'port-in-use', test: /EADDRINUSE|Address already in use|BindException|Failed to bind to|port .* is already in use/i,
    title: 'The port is taken',
    why: 'Something else in the same server is already listening on that port.',
    fix: 'Make the app listen on the port in the SERVER_PORT variable. In Node: process.env.SERVER_PORT. Do not start the app twice.',
    tab: 'startup',
  },
  {
    id: 'node-module', test: /Cannot find module ['"][^'"]+['"]|ERR_MODULE_NOT_FOUND/i,
    title: 'A package is missing',
    why: 'The app asks for a package that was not installed.',
    fix: 'Add it to package.json and run the install again. With Deploy from Git, put `npm ci` (or `npm install`) in the build command.',
    tab: 'git',
  },
  {
    id: 'py-module', test: /ModuleNotFoundError: No module named ['"][^'"]+['"]/, only: /^python$/,
    title: 'A Python module is missing',
    why: 'Python looked for a module that is not installed in this server.',
    fix: 'Add it to requirements.txt and run the install again. With Deploy from Git, put `pip install -r requirements.txt` in the build command.',
    tab: 'git',
  },
  {
    id: 'node-crash', test: /uncaughtException|UnhandledPromiseRejection/, only: /^(nodejs|discord-bot)$/,
    title: 'The Node.js process crashed',
    why: 'Node reported an exception that nothing in the app caught, so the process stopped.',
    fix: 'Open the Console tab and read the stack above that line. Fix that error, then start the server again.',
    tab: 'console',
  },
  {
    id: 'discord-intent', test: /Used disallowed intents|PrivilegedIntentsRequired|disallowed intents/i, only: /^discord-bot$/,
    title: 'Discord refused a privileged intent',
    why: 'The bot asks Discord for an intent that is not turned on for the application.',
    fix: 'In the Discord developer portal, open the application, enable the privileged intents the bot uses, and start it again.',
    tab: 'console',
  },
  {
    id: 'node-entry', test: /Cannot find module '\/home\/container\/(?:index|app|main|server)\.js'|no such file or directory, open '[^']*package\.json'|Missing script: "?start"?/i,
    title: 'There is nothing to start',
    why: 'The start file or the start script is not there.',
    fix: 'Upload your app in the Files tab, or set up Deploy from Git. Check that package.json has a "start" script, or change the start command.',
    tab: 'files',
  },
  {
    id: 'permission', test: /EACCES|Permission denied/i,
    title: 'A file or folder cannot be used',
    why: 'The program is not allowed to read or write there.',
    fix: 'Write only inside the server folder, and do not use system paths like /usr or /var. In the Files tab you can change the permissions of a file.',
    tab: 'files',
  },
  {
    id: 'npm-error', test: /npm ERR! (?:code|errno) (\w+)/i,
    title: 'npm stopped with an error',
    why: 'An install or a script of the app failed. The "npm ERR!" line shows that it failed, not which package caused it.',
    fix: 'Read the lines above the "npm ERR!" ones in the log: they name the package or the script that failed.',
    confidence: 'medium',
    tab: 'git',
  },
  {
    id: 'git-clone', test: /fatal: (?:repository|could not read|unable to access)|Remote branch .* not found/i,
    title: 'The repository could not be fetched',
    why: 'The address is wrong, the repository is private, or the branch does not exist.',
    fix: 'Check the address and the branch in the Deploy tab. Only public repositories are supported.',
    tab: 'git',
  },
  {
    id: 'build-timeout', test: /took longer than \d+ (?:seconds|minutes)/i,
    title: 'The build took too long',
    why: 'A build can run for at most 15 minutes, and a clone for 5.',
    fix: 'Make the build lighter (cache, fewer steps), or build elsewhere and commit the result.',
    tab: 'git',
  },
  {
    id: 'discord-token', test: /TOKEN_INVALID|An invalid token was provided|Incorrect login details/i,
    title: 'The Discord token is not accepted',
    why: 'Discord refused the token the bot logged in with.',
    fix: 'Make a new token in the Discord developer portal and set it as the environment variable your bot reads. Do not paste the token into the ticket.',
    tab: 'startup',
  },
  {
    id: 'database', test: /ECONNREFUSED .*:3306|Access denied for user|Unknown database|ER_ACCESS_DENIED_ERROR/i,
    title: 'The database refuses the connection',
    why: 'The host, the user, the password or the database name does not match.',
    fix: 'Open the Databases tab, press Credentials, and use exactly those values. The host is the one shown there, not localhost.',
    tab: 'databases',
  },
  {
    id: 'disk', test: /No space left on device|ENOSPC|Disk quota exceeded/i,
    title: 'The disk is full',
    why: 'The server has no free space left.',
    fix: 'Delete old files, backups you do not need, or logs in the Files tab, or raise the disk of the plan.',
    tab: 'files',
  },
];

export function diagnose(text: string, product = ''): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (rule.only && !rule.only.test(product)) continue;
    if (rule.test.test(text)) findings.push({ id: rule.id, title: rule.title, why: rule.why, fix: rule.fix, confidence: rule.confidence ?? 'high', tab: rule.tab });
  }
  return findings;
}

export type SourceState = 'available' | 'missing' | 'inaccessible' | 'unsupported' | 'failed';
export type Verdict = 'clear' | 'insufficient' | 'issue' | 'unreachable';

/** A source the check tried. `text` stays on the server and is never returned as itself. */
export interface CollectedSource {
  id: string;
  label: string;
  state: SourceState;
  note: string;
  text?: string;
}

export interface DiagnosisFacts {
  provisionError: string | null;
  applicationError: string | null;
  installStatus: string | null;
  deployState: string | null;
  deployMessage: string | null;
  importPhase: string | null;
  importError: string | null;
}

export interface DiagnosisReport {
  verdict: Verdict;
  summary: string;
  findings: Finding[];
  sources: { id: string; label: string; state: SourceState; note: string }[];
}

const FAILED_INSTALL = new Set(['failed', 'gave_up']);
/** A saved log. A status file, an event, or the live console does not count as one. */
const LOG_SOURCES = new Set(['latest-log', 'crash-report', 'deploy-log']);

/** Findings that come from a stored result, not from a word in a log. */
export function findingsFromFacts(facts: DiagnosisFacts): Finding[] {
  const found: Finding[] = [];
  if (facts.provisionError) {
    found.push({
      id: 'provision-error', confidence: 'high', tab: 'activity',
      title: 'Provisioning stopped with an error',
      why: 'The platform recorded an error while creating this server.',
      fix: 'Open the Activity tab for that error. If it names a step that can be retried, retry it. Otherwise open a ticket.',
    });
  }
  if (facts.applicationError) {
    found.push({
      id: 'application-error', confidence: 'high', tab: 'activity',
      title: 'The application did not become ready',
      why: 'The platform recorded that the application itself did not finish starting.',
      fix: 'Open the Activity tab, then the Console tab. The recorded error says which check failed.',
    });
  }
  if (facts.installStatus && FAILED_INSTALL.has(facts.installStatus)) {
    found.push({
      id: 'install-failed', confidence: 'high', tab: 'activity',
      title: 'The preset did not stay running',
      why: 'The files of the preset were written, and the server did not stay running afterwards.',
      fix: 'Open the Console tab to see why the process stopped, then start the server again.',
    });
  }
  if (facts.deployState === 'failed') {
    found.push({
      id: 'deploy-failed', confidence: 'high', tab: 'git',
      title: 'The last deployment failed',
      why: facts.deployMessage ? 'The deployment recorded a failure. The detail is in the deployment log, with secrets removed.' : 'The deployment recorded a failure and did not leave a detail.',
      fix: 'Open the Deploy tab and read the log of that deployment. Fix the command or the branch, then deploy again.',
    });
  }
  if (facts.importPhase === 'failed') {
    found.push({
      id: 'import-failed', confidence: 'high', tab: 'git',
      title: 'The import did not finish',
      why: 'The Git or ZIP import was recorded as failed before the application was ready.',
      fix: 'Open the Deploy tab, check the repository or the archive, and run the import again.',
    });
  }
  return found;
}

/**
 * What the check is allowed to conclude.
 * A missing file is a finished check. A failed or forbidden read is not.
 * "Clear" requires at least one log that was actually read.
 */
export function verdictOf(sources: CollectedSource[], findings: Finding[]): Verdict {
  if (findings.length > 0) return 'issue';
  const blocked = sources.filter((source) => source.state === 'failed' || source.state === 'inaccessible');
  const readLog = sources.some((source) => LOG_SOURCES.has(source.id) && source.state === 'available' && source.text);
  if (blocked.length > 0 && !readLog) return 'unreachable';
  if (blocked.length > 0 || !readLog) return 'insufficient';
  return 'clear';
}

const SUMMARIES: Record<Verdict, string> = {
  issue: 'The evidence that could be read matches a known problem.',
  clear: 'Nothing in the evidence that was read matches a known problem.',
  insufficient: 'Some evidence is missing or could not be read, so this is not a clean result.',
  unreachable: 'The logs on the server could not be read, so there is no diagnosis.',
};

export function buildReport(product: string, sources: CollectedSource[], facts: DiagnosisFacts): DiagnosisReport {
  const corpus = [
    ...sources.map((source) => source.text ?? ''),
    facts.provisionError ?? '',
    facts.applicationError ?? '',
    facts.deployMessage ?? '',
    facts.importError ?? '',
  ].join('\n');
  const seen = new Set<string>();
  const findings = [...findingsFromFacts(facts), ...diagnose(corpus, product)].filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
  const verdict = verdictOf(sources, findings);
  return {
    verdict,
    summary: SUMMARIES[verdict],
    findings,
    sources: sources.map(({ id, label, state, note }) => ({ id, label, state, note })),
  };
}

/** Ticket text. Log excerpts are shortened and redacted. The live console is described as not stored. */
export function supportBody(
  report: DiagnosisReport,
  meta: { product: string; slug: string; name: string; status: string; ram: number; cpu: number; disk: number },
  events: { at: string; type: string; message: string }[],
  sources: CollectedSource[],
): string {
  const lines = [
    `Product: ${meta.product} (${meta.slug})`,
    `Name: ${meta.name}`,
    `Status: ${meta.status} · ${meta.ram} MB, ${meta.cpu} CPU, ${meta.disk} GB`,
    `Result: ${report.summary}`,
    '',
    'What was checked:',
    ...report.sources.map((source) => `- ${source.label}: ${source.state}. ${redact(source.note)}`),
    '',
    report.findings.length
      ? `What was found:\n${report.findings.map((finding) => `- ${finding.title} (${finding.confidence}): ${finding.why} ${finding.fix}`).join('\n')}`
      : 'No known cause was found in the evidence that could be read.',
    '',
    'Latest events:',
    ...(events.length ? events.map((event) => `- ${event.at} ${event.type}: ${redact(event.message).slice(0, 160)}`) : ['- none']),
    ...sources.filter((source) => source.text && source.id !== 'events').flatMap((source) => ['', `Last lines of ${source.label} (secrets removed):`, redact(tail(source.text ?? '', 30)).slice(0, 1500)]),
    '',
    'The live console was not attached. Opening the Console tab replays recent output from the current container. That replay is not a log the platform keeps.',
    '',
    'What I was doing and what I expected:',
    '',
  ];
  return lines.join('\n').slice(0, 18_000);
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
