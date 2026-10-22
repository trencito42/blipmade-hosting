import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { APPS, fmtMb, type App } from '../data';
import { useCatalogProducts } from '../lib/pricing';
import { Icon, type IconName } from '../icons';
import { cn } from '../lib';
import { Link, scrollToId, useRouter } from '../router';
import { Logo } from '../ui';
import { Money } from '../ui-app';

/**
 * The Blipmade documentation.
 *
 * The content is local on purpose: the docs must render even when the API is
 * having a bad day. Everything documented here maps to an endpoint in
 * docs/API_CONTRACT.md. Anything that is not live is labelled "Planned".
 */

// --- content model ---------------------------------------------------------

type Block =
  | { t: 'p'; text: ReactNode }
  | { t: 'list'; items: string[] }
  | { t: 'callout'; tone: 'note' | 'tip' | 'warning' | 'danger'; text: string }
  | { t: 'code'; lang: string; code: string }
  | { t: 'steps'; items: Step[] }
  | { t: 'trouble'; items: { q: string; a: string }[] }
  | { t: 'spec'; rows: { k: string; v: ReactNode }[] };

interface Step {
  title: string;
  body: string;
  result: string;
}

interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

interface DocPage {
  id: string;
  group: string;
  title: string;
  summary: string;
  keywords: string[];
  updated: string;
  sections: Section[];
  next: string[];
}

const GROUPS = [
  'Getting started',
  'Apps',
  'Databases',
  'Resources & billing',
  'Domains & SSL',
  'Files & console',
  'Security',
  'Troubleshooting',
  'Limits & fair use',
] as const;

const UPDATED = '2026-10-18';

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function fmtDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FMT.format(date);
}

function appByName(name: string): App {
  const app = APPS.find((a) => a.name === name);
  if (!app) throw new Error(`Unknown app in the catalog data: ${name}`);
  return app;
}

/**
 * The price of an app comes from the catalog of the platform. An app that is
 * documented but not offered has no price, and the page says so instead of
 * showing a number the platform does not charge.
 */
function CatalogPrice({ name }: { name: string }) {
  const { products } = useCatalogProducts();
  const product = products.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!product) return <span className="text-ink2">Not in the catalog yet</span>;
  if (!product.price) return <span className="text-ink2">Price on request</span>;
  return <Money amount={product.price.amount} currency={product.price.currency} period="month" />;
}

/** The smallest configuration of an app, taken from the catalog when it is offered. */
function CatalogResources({ name, fallback }: { name: string; fallback: string }) {
  const { products } = useCatalogProducts();
  const product = products.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!product) return <>{fallback}</>;
  return <>{`${fmtMb(product.minRam)} RAM · ${product.minDisk} GB disk`}</>;
}

interface AppDoc {
  id: string;
  group: string;
  title: string;
  summary: string;
  keywords: string[];
  app: App;
  intro: string;
  firstRun: Step[];
  envIntro: string;
  env: { name: string; value: string }[];
  backupText: string;
  backupSteps: string[];
  upgradeText: string;
  upgradeSteps: string[];
  trouble: { q: string; a: string }[];
}

/** Builds one app or database page with the same anatomy but its own content. */
function appPage(doc: AppDoc): DocPage {
  const { app } = doc;
  const envBlocks: Block[] = doc.env.length
    ? [
        { t: 'p', text: doc.envIntro },
        {
          t: 'spec',
          rows: doc.env.map((entry) => ({ k: entry.name, v: entry.value })),
        },
        {
          t: 'callout',
          tone: 'warning',
          text: 'Environment variables are visible to everyone who can open the instance. Keep tokens and passwords out of public repositories.',
        },
      ]
    : [
        { t: 'p', text: doc.envIntro },
        {
          t: 'callout',
          tone: 'note',
          text: 'This app needs no environment variables for a standard install, so you can leave the variable list empty.',
        },
      ];

  return {
    id: doc.id,
    group: doc.group,
    title: doc.title,
    summary: doc.summary,
    keywords: doc.keywords,
    updated: UPDATED,
    sections: [
      {
        id: 'what-you-get',
        title: 'What you get',
        blocks: [
          { t: 'p', text: doc.intro },
          {
            t: 'spec',
            rows: [
              { k: 'Minimum resources', v: <CatalogResources name={doc.title} fallback={`${fmtMb(app.mb)} RAM · ${app.disk} GB disk`} /> },
              { k: 'CPU', v: 'Selectable when you deploy' },
              { k: 'Price from', v: <CatalogPrice name={doc.title} /> },
              { k: 'Billing', v: 'Monthly, billed in euros' },
            ],
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'The price shown is the catalog starting price for the smallest configuration. Blipmade calculates the exact price for your configuration on the server when you deploy.',
          },
        ],
      },
      { id: 'first-run', title: 'First run', blocks: [{ t: 'steps', items: doc.firstRun }] },
      { id: 'environment', title: 'Environment variables', blocks: envBlocks },
      {
        id: 'backups',
        title: 'Backups',
        blocks: [
          { t: 'p', text: doc.backupText },
          { t: 'list', items: doc.backupSteps },
        ],
      },
      {
        id: 'upgrading',
        title: 'Upgrading',
        blocks: [
          { t: 'p', text: doc.upgradeText },
          { t: 'list', items: doc.upgradeSteps },
        ],
      },
      { id: 'troubleshooting', title: 'Troubleshooting', blocks: [{ t: 'trouble', items: doc.trouble }] },
    ],
    next: ['upgrade', 'files'],
  };
}

// --- app and database content ---------------------------------------------

const APP_DOCS: AppDoc[] = [
  {
    id: 'wordpress',
    group: 'Apps',
    title: 'WordPress',
    summary: 'WordPress on your own instance: pick the resources, deploy, and finish the installer.',
    keywords: ['wordpress', 'cms', 'blog', 'woocommerce', 'site'],
    app: appByName('WordPress'),
    intro:
      'WordPress is the site builder in the Blipmade catalog: blogs, company sites and small stores. You choose the memory, CPU and disk, and the instance runs the stack for you.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'Wait for the status to turn green, then open the address from the instance list.',
        result: 'The WordPress installer opens in your browser.',
      },
      {
        title: 'Choose the language',
        body: 'The first screen asks for the language of the installation and the address of the site.',
        result: 'The installer asks for the site title and an administrator account.',
      },
      {
        title: 'Create the administrator account',
        body: 'Enter a site title, an email address you own and a strong password. This account is the owner of the site.',
        result: 'WordPress confirms the install and shows the login screen.',
      },
      {
        title: 'Set the permalink structure',
        body: 'Sign in at /wp-admin, open Settings → Permalinks and save the structure you want.',
        result: 'Pretty permalinks work instead of returning 404 on nested pages.',
      },
    ],
    envIntro:
      'A standard WordPress install reads its database details from wp-config.php inside the instance, so no environment variables are required.',
    env: [],
    backupText:
      'Blipmade does not take automatic backups of your data yet. Your content lives in the database and your uploads live in the files of the instance, so back up both.',
    backupSteps: [
      'Export the content from WordPress (Tools → Export) or dump the database from the console with mysqldump and the credentials from wp-config.php.',
      'Copy the wp-content folder from the Files page to your own machine.',
      'Keep the export file somewhere that is not the instance itself.',
    ],
    upgradeText:
      'Resize the instance whenever the site needs more room. WordPress keeps running while the change is applied, and the server returns the new price together with the difference to your current price.',
    upgradeSteps: [
      'Open the instance and change the RAM, CPU or disk size.',
      'Confirm the change. The new price and the price difference come from the server.',
      'Update WordPress itself from the admin area (Dashboard → Updates) as usual. Blipmade does not change your content or your version.',
    ],
    trouble: [
      {
        q: 'The installer never appears',
        a: 'The first start of WordPress can take a minute while the image prepares the database. Open the instance address directly and check the console output if nothing loads.',
      },
      {
        q: 'The installer stops at the database step',
        a: 'The database name, user and password in the installer must match the ones in wp-config.php inside the instance files. Check them in the Files page.',
      },
      {
        q: 'The site is slow or shows a database error',
        a: 'WordPress needs more memory than the minimum configuration once you add plugins and a theme. Check the instance metrics, then add RAM from the instance page.',
      },
    ],
  },
  {
    id: 'ghost',
    group: 'Apps',
    title: 'Ghost',
    summary: 'Ghost for newsletters and blogs, with its own MySQL database.',
    keywords: ['ghost', 'newsletter', 'blog', 'publishing'],
    app: appByName('Ghost'),
    intro:
      'Ghost is a publishing platform for newsletters and member sites. It keeps its content in MySQL, so a Ghost deployment runs together with a MySQL database instance.',
    firstRun: [
      {
        title: 'Deploy a MySQL database',
        body: 'Open the catalog, deploy MySQL and wait for it to report online. Note the host, port, user and password it shows.',
        result: 'A running database instance with its connection details.',
      },
      {
        title: 'Point Ghost at the database',
        body: 'In the Ghost instance, set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME to the values of the database you just deployed.',
        result: 'The Ghost instance restarts with the database connection configured.',
      },
      {
        title: 'Open the setup screen',
        body: 'Open the instance address. Ghost shows its setup form as long as it cannot find a configuration file.',
        result: 'The setup form asks for the site title and an owner email address.',
      },
      {
        title: 'Create the owner account',
        body: 'Complete the form and open the confirmation email that Ghost sends you.',
        result: 'You can sign in at /ghost and publish your first post.',
      },
    ],
    envIntro:
      'Ghost reads its configuration from the environment. Set these variables on the instance before the first start.',
    env: [
      { name: 'DB_HOST', value: 'Host of your MySQL instance' },
      { name: 'DB_PORT', value: 'Port of your MySQL instance' },
      { name: 'DB_USER', value: 'User created for the Ghost database' },
      { name: 'DB_PASSWORD', value: 'Password of that user' },
      { name: 'DB_NAME', value: 'Name of the database for Ghost' },
      { name: 'url', value: 'Public address of the instance, for example https://ghost.example.com' },
    ],
    backupText:
      'Ghost keeps two things that matter: the MySQL database with your content, and the content folder with your theme and uploads. Blipmade does not schedule automatic backups yet.',
    backupSteps: [
      'Dump the database from the console with mysqldump.',
      'Copy the content folder from the Files page to your own machine.',
      'Store both in the same place so a restore does not mix old content with new posts.',
    ],
    upgradeText:
      'Ghost uses more memory than most sites while it publishes. Resizing is done on the instance page and does not touch your content.',
    upgradeSteps: [
      'Increase RAM or disk from the instance page when publishing gets slow.',
      'Keep the memory you had at install: Ghost caches content in memory and restarts cold with less.',
      'Ghost versions are not updated by Blipmade. Upgrade Ghost the way you would on any server: change the version in the instance files and restart the instance.',
    ],
    trouble: [
      {
        q: 'Ghost shows the setup screen on every restart',
        a: 'The configuration file is missing or the database is unreachable. Check that the DB_ variables point at a running database and that the content folder still exists.',
      },
      {
        q: 'Ghost crashes right after it starts',
        a: 'Ghost needs more memory than the minimum configuration. Add RAM and read the console output, which shows the exact error.',
      },
      {
        q: 'No email ever arrives from Ghost',
        a: 'Ghost sends mail through SMTP. Configure your SMTP settings in the instance, otherwise the owner confirmation and member mail never leave the instance.',
      },
    ],
  },
  {
    id: 'forgejo',
    group: 'Apps',
    title: 'Forgejo',
    summary: 'A self-hosted Git forge with repositories, issues and pull requests.',
    keywords: ['forgejo', 'git', 'repository', 'forge', 'pull request'],
    app: appByName('Forgejo'),
    intro:
      'Forgejo is a lightweight Git forge: repositories, issues, pull requests and a package registry, running on your own instance.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'Forgejo starts with a setup page as long as it finds no installation.',
        result: 'The Forgejo installer opens in your browser.',
      },
      {
        title: 'Create the administrator account',
        body: 'Fill in the database details. SQLite is enough for a small team; use a MySQL or PostgreSQL instance for larger repositories.',
        result: 'You are signed in as the administrator of the forge.',
      },
      {
        title: 'Set the site URL',
        body: 'Change the site URL in the administration settings so it matches the address you reach the instance on.',
        result: 'Clone URLs, webhooks and avatars use your own hostname.',
      },
      {
        title: 'Create a repository',
        body: 'Choose New repository and initialise it with a README so you can push right away.',
        result: 'The repository is ready to clone over HTTPS.',
      },
    ],
    envIntro:
      'Forgejo reads configuration from the environment in the form FORGEJO__section__KEY. These are the ones you normally set.',
    env: [
      { name: 'FORGEJO__server__ROOT_URL', value: 'Public address of the instance, including the scheme' },
      { name: 'FORGEJO__server__DOMAIN', value: 'Host name of the instance' },
      { name: 'FORGEJO__server__SSH_DOMAIN', value: 'Host name used in SSH clone URLs' },
    ],
    backupText:
      'Repositories, issues and the database all live in the Forgejo data directory inside the instance. Blipmade does not take automatic backups yet.',
    backupSteps: [
      'Stop the instance so no write happens while you copy the data.',
      'Copy the Forgejo data directory from the Files page to your own machine.',
      'Start the instance again and check that the repositories are there.',
    ],
    upgradeText:
      'Forgejo versions are not managed by Blipmade. Resizing the instance is done on the instance page and works without touching the repositories.',
    upgradeSteps: [
      'Add RAM, CPU or disk from the instance page when builds and pushes get slow.',
      'To change the Forgejo version, replace the binary in the instance files and restart.',
      'Take a copy of the data directory before a version change.',
    ],
    trouble: [
      {
        q: 'The installer keeps asking for the database',
        a: 'Forgejo cannot write to its data directory. Check the permissions of the data folder in the Files page.',
      },
      {
        q: 'Cloning over SSH does not work',
        a: 'Instances are reached over HTTP and HTTPS. Use the HTTPS clone URL from the repository page.',
      },
      {
        q: 'Pushes become slow with many repositories',
        a: 'Git operations run inside the same container as the forge. Add CPU and RAM from the instance page.',
      },
    ],
  },
  {
    id: 'code-server',
    group: 'Apps',
    title: 'Code Server',
    summary: 'VS Code in the browser, running on the resources you picked.',
    keywords: ['code server', 'vscode', 'ide', 'editor', 'development'],
    app: appByName('Code Server'),
    intro:
      'Code Server is the browser version of Visual Studio Code. It runs on your instance, so your editor, your terminal and your project files are the same machine.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'The editor serves itself as soon as the instance is online.',
        result: 'The Code Server welcome screen appears in your browser.',
      },
      {
        title: 'Set the access password',
        body: 'The first screen asks for a password. Choose a strong one: it protects the whole editor.',
        result: 'The password is stored and the editor asks for it on every later visit.',
      },
      {
        title: 'Open your project folder',
        body: 'Use File → Open Folder and pick the folder that holds your project.',
        result: 'The workspace shows the files of your instance.',
      },
      {
        title: 'Open a terminal',
        body: 'Use Terminal → New Terminal inside the editor.',
        result: 'A shell runs as the container user with the tools of the image available.',
      },
    ],
    envIntro:
      'Two variables matter for a normal install. The editor reads them from the instance environment.',
    env: [
      { name: 'PASSWORD', value: 'Password for the web editor' },
      { name: 'PORT', value: 'Port the editor listens on — leave the value Blipmade sets' },
    ],
    backupText:
      'Your projects are plain files on the instance. Blipmade does not back them up for you yet.',
    backupSteps: [
      'Push your work to a Git remote as your first line of defence.',
      'Copy any folder that is not in Git from the Files page to your own machine.',
      'Keep a copy of the environment variables somewhere safe — they are not stored in your project.',
    ],
    upgradeText:
      'Code Server is stateless: it only serves the files of the instance. Resizing the instance changes what you can build, not how the editor works.',
    upgradeSteps: [
      'Add RAM, CPU or disk from the instance page for larger builds.',
      'The editor version follows the image you deployed. Blipmade does not update it in place.',
      'Keep the startup command in the instance so the editor comes back after a restart.',
    ],
    trouble: [
      {
        q: 'The editor does not load',
        a: 'A stopped instance serves nothing. Check the status, start the instance and reload the page.',
      },
      {
        q: 'The terminal says command not found',
        a: 'The terminal only has the tools of the image. Install what you need in the terminal, or move that work into the startup command.',
      },
      {
        q: 'Installed tools disappear after a restart',
        a: 'Software you install outside the project folder is not part of the instance. Put dependencies in the project and install them in the startup command.',
      },
    ],
  },
  {
    id: 'uptime-kuma',
    group: 'Apps',
    title: 'Uptime Kuma',
    summary: 'Uptime monitoring with a public status page, on a small instance.',
    keywords: ['uptime kuma', 'monitoring', 'status page', 'uptime', 'checks'],
    app: appByName('Uptime Kuma'),
    intro:
      'Uptime Kuma watches your endpoints over HTTP, TCP or ping and publishes a status page you can share with your own users.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'On the first start Uptime Kuma creates its own database in the data folder.',
        result: 'The login screen appears.',
      },
      {
        title: 'Read the credentials from the console',
        body: 'The default administrator credentials are printed in the console output of the first start.',
        result: 'You can sign in with the credentials from the console.',
      },
      {
        title: 'Change the password immediately',
        body: 'Set your own password in the user settings right after the first sign-in.',
        result: 'The default password no longer works.',
      },
      {
        title: 'Add a monitor and a status page',
        body: 'Add a monitor with the type and interval you want, then create a status page and attach the monitors to publish.',
        result: 'The monitor starts checking and the status page is live on your instance.',
      },
    ],
    envIntro:
      'A standard install needs no environment variables: Uptime Kuma stores everything in the data folder of the instance.',
    env: [],
    backupText:
      'Monitors, status pages and the account live in the Uptime Kuma database in the data folder. Blipmade does not take automatic backups yet.',
    backupSteps: [
      'Stop the instance so the database file is not written while you copy it.',
      'Copy the data folder from the Files page to your own machine.',
      'Start the instance and confirm that your monitors are still listed.',
    ],
    upgradeText:
      'Uptime Kuma is small and rarely needs more resources. Resizing is done on the instance page and does not change your configuration.',
    upgradeSteps: [
      'Add RAM or disk only when the instance page shows you running low.',
      'The Uptime Kuma version follows the image. Blipmade does not patch it in place.',
      'Keep the data folder on the disk you resized, not on temporary space.',
    ],
    trouble: [
      {
        q: 'The default password is rejected',
        a: 'The first start writes the credentials to the console output. Open the console and read them.',
      },
      {
        q: 'Monitors report down although the target is up',
        a: 'Uptime Kuma can only reach targets that allow the instance network. Check the URL and whether the target blocks the request.',
      },
      {
        q: 'The login page keeps loading',
        a: 'The instance is short on memory or the data folder is not writable. Check the metrics and the file permissions.',
      },
    ],
  },
  {
    id: 'grafana',
    group: 'Apps',
    title: 'Grafana',
    summary: 'Dashboards over the databases and metrics you already have.',
    keywords: ['grafana', 'dashboards', 'metrics', 'monitoring', 'charts'],
    app: appByName('Grafana'),
    intro:
      'Grafana turns your data into dashboards. Point it at a PostgreSQL or MySQL instance, a Prometheus server, or anything else that speaks one of its data sources.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'Grafana starts with a setup screen on the very first visit.',
        result: 'The welcome screen asks how you want to sign in.',
      },
      {
        title: 'Create the administrator account',
        body: 'Choose the password method and create the admin account.',
        result: 'Grafana asks for the name of your organisation.',
      },
      {
        title: 'Add a data source',
        body: 'Open Connections → Data sources and add the source you want to read, for example PostgreSQL or Prometheus.',
        result: 'The test of the data source succeeds.',
      },
      {
        title: 'Build a dashboard',
        body: 'Create a dashboard, add a panel and pick the data source and the query.',
        result: 'The panel draws live values from your source.',
      },
    ],
    envIntro:
      'Two variables are worth setting before the first start: the admin password and whether strangers may sign up.',
    env: [
      { name: 'GF_SECURITY_ADMIN_PASSWORD', value: 'Password for the built-in admin account' },
      { name: 'GF_USERS_ALLOW_SIGN_UP', value: 'false — do not let anyone create an account on your instance' },
      { name: 'GF_SERVER_ROOT_URL', value: 'Public address of the instance' },
    ],
    backupText:
      'Dashboards, users and the data source configuration live in the Grafana database. Blipmade does not take automatic backups yet.',
    backupSteps: [
      'Stop the instance so the database file is consistent.',
      'Copy the data folder from the Files page to your own machine.',
      'Start the instance and check that your dashboards are still there.',
    ],
    upgradeText:
      'Grafana can be memory hungry once you have many dashboards and long time ranges. Resizing happens on the instance page.',
    upgradeSteps: [
      'Add RAM when panels get slow, especially with long time ranges.',
      'The Grafana version follows the image. Blipmade does not update it in place.',
      'Plugins you install by hand are not managed for you, so keep a note of them.',
    ],
    trouble: [
      {
        q: 'The setup screen appears on every restart',
        a: 'Grafana could not persist its configuration. The data folder is most likely not writable: check the permissions in the Files page.',
      },
      {
        q: 'The data source test fails',
        a: 'Check the host, the port and the credentials, and confirm that the target accepts connections from the instance network.',
      },
      {
        q: 'Panels are empty',
        a: 'The query returns nothing. Test the data source first, then widen the time range of the panel.',
      },
    ],
  },
  {
    id: 'n8n',
    group: 'Apps',
    title: 'n8n',
    summary: 'Workflow automation with credentials stored inside your own instance.',
    keywords: ['n8n', 'automation', 'workflow', 'integrations', 'webhook'],
    app: appByName('n8n'),
    intro:
      'n8n connects services into workflows that run on a schedule or on a webhook. Workflows and credentials stay on the instance you deploy.',
    firstRun: [
      {
        title: 'Open the instance',
        body: 'On the first start n8n creates its own SQLite database in the data folder.',
        result: 'The owner setup screen appears.',
      },
      {
        title: 'Create the owner account',
        body: 'Enter your details and create the owner account.',
        result: 'You land in the workflow editor.',
      },
      {
        title: 'Add a credential',
        body: 'Credentials are stored encrypted per instance. Add them from the Credentials menu.',
        result: 'The credential is available to every workflow in this instance.',
      },
      {
        title: 'Import or build a workflow',
        body: 'Import a workflow definition from JSON, or build one node by node and activate it.',
        result: 'The workflow runs on its trigger.',
      },
    ],
    envIntro:
      'Set these before the first start. The encryption key matters most: change it later and the stored credentials can no longer be read.',
    env: [
      { name: 'N8N_HOST', value: 'Host name of the instance' },
      { name: 'N8N_PORT', value: 'Port n8n listens on — leave the value Blipmade sets' },
      { name: 'N8N_PROTOCOL', value: 'http or https, matching how you reach the instance' },
      { name: 'WEBHOOK_URL', value: 'Public base address used to build webhook URLs' },
      { name: 'N8N_ENCRYPTION_KEY', value: 'Secret key that encrypts your credentials — store it safely' },
      { name: 'GENERIC_TIMEZONE', value: 'Time zone for schedules, for example Europe/Dublin' },
    ],
    backupText:
      'Workflows and credentials live in the n8n database. Blipmade does not take automatic backups yet, and a backup without the encryption key is of little use.',
    backupSteps: [
      'Stop the instance so the database file is consistent.',
      'Copy the data folder from the Files page to your own machine.',
      'Store the N8N_ENCRYPTION_KEY together with the copy, in a different place.',
    ],
    upgradeText:
      'n8n releases often change workflow definitions. Resizing the instance is safe and does not touch your workflows.',
    upgradeSteps: [
      'Add RAM when many workflows run at the same time.',
      'The n8n version follows the image; Blipmade does not update it in place.',
      'Export your workflows from the editor before you change versions.',
    ],
    trouble: [
      {
        q: 'The owner setup screen appears on every restart',
        a: 'The database file is missing or not writable. Check the data folder in the Files page.',
      },
      {
        q: 'Webhook URLs cannot be opened',
        a: 'n8n builds webhook URLs from WEBHOOK_URL. Without it, n8n generates addresses that point nowhere.',
      },
      {
        q: 'Credentials stopped working',
        a: 'N8N_ENCRYPTION_KEY changed. Restore the original key, otherwise n8n cannot decrypt what it stored.',
      },
    ],
  },
  {
    id: 'discord-bot',
    group: 'Apps',
    title: 'Discord Bot',
    summary: 'Run a Discord bot around the clock on a small instance.',
    keywords: ['discord', 'bot', 'chat', 'node', 'python'],
    app: appByName('Discord Bot'),
    intro:
      'A Discord bot is a small program that stays connected to Discord. The instance keeps it online, restarts it if it stops, and keeps its token out of your repository.',
    firstRun: [
      {
        title: 'Create the application in Discord',
        body: 'In the Discord developer portal, create an application, add a bot and copy its token.',
        result: 'You have a bot token that belongs in the instance, not in your code.',
      },
      {
        title: 'Store the token in the instance',
        body: 'Add the token as an environment variable such as DISCORD_TOKEN on the instance.',
        result: 'The token is available to the process without living in the repository.',
      },
      {
        title: 'Invite the bot to your server',
        body: 'Create an invite link with the bot scope and the permissions the bot needs.',
        result: 'The bot appears in the server you invited it to.',
      },
      {
        title: 'Start the bot',
        body: 'Run your program in the console, for example node bot.js, and watch the output.',
        result: 'The bot answers in the channels you gave it access to.',
      },
    ],
    envIntro:
      'Keep the token and any other secret in the instance environment. The bot reads them from there at start-up.',
    env: [
      { name: 'DISCORD_TOKEN', value: 'Bot token from the Discord developer portal' },
      { name: 'DISCORD_CLIENT_ID', value: 'Application id of your Discord application' },
      { name: 'PREFIX', value: 'Prefix your bot listens for, for example !' },
      { name: 'NODE_ENV', value: 'production' },
    ],
    backupText:
      'A bot is code plus configuration. Blipmade does not back up either of them for you yet.',
    backupSteps: [
      'Keep the code in a Git repository so it survives a new instance.',
      'Write down the environment variables in a password manager, not in the repository.',
      'If the bot keeps state in a file or a database, copy that file from the Files page as well.',
    ],
    upgradeText:
      'Small bots fit in the minimum configuration. When the bot needs more room or a different runtime, change the resources or deploy a second instance.',
    upgradeSteps: [
      'Add RAM from the instance page when the memory metric approaches the limit.',
      'Set a startup command so the bot comes back after a restart.',
      'Deploy a new instance when you need another runtime or a separate bot.',
    ],
    trouble: [
      {
        q: 'The bot never comes online',
        a: 'The token is wrong or the bot was never invited to the server. Read the console output, it shows the exact login error.',
      },
      {
        q: 'The bot stops after a while',
        a: 'The instance ran out of memory and the process was stopped. Check the metrics and add RAM.',
      },
      {
        q: 'Commands are not picked up',
        a: 'The bot runs in a different working directory, or the token is missing the message content intent. Check the startup command and the intent settings in Discord.',
      },
    ],
  },
  {
    id: 'postgresql',
    group: 'Databases',
    title: 'PostgreSQL',
    summary: 'A managed PostgreSQL instance you connect to from your own apps.',
    keywords: ['postgres', 'postgresql', 'sql', 'database', 'psql'],
    app: appByName('PostgreSQL'),
    intro:
      'PostgreSQL is a relational database with a strong query planner. The instance gives you a database with its own disk, and you connect to it from anywhere the network allows.',
    firstRun: [
      {
        title: 'Deploy the database',
        body: 'Deploy PostgreSQL from the catalog and wait for the instance to report online.',
        result: 'A database instance with a default database and a superuser.',
      },
      {
        title: 'Read the connection details',
        body: 'Open the instance and copy the host, the port, the user and the password.',
        result: 'You can connect with psql or your application.',
      },
      {
        title: 'Create the database you need',
        body: 'Connect and run CREATE DATABASE app;',
        result: 'The new database shows up in the list of databases.',
      },
      {
        title: 'Create an application user',
        body: 'Give your app its own user with rights on its own database only, and keep the superuser for administration.',
        result: 'The application connects without full database rights.',
      },
    ],
    envIntro:
      'These variables are read when the data directory is created. After that they no longer change the password of the running server.',
    env: [
      { name: 'POSTGRES_USER', value: 'Name of the first superuser' },
      { name: 'POSTGRES_PASSWORD', value: 'Password of that user' },
      { name: 'POSTGRES_DB', value: 'Database created on the first start' },
      { name: 'PGDATA', value: 'Folder of the data directory inside the instance' },
    ],
    backupText:
      'Blipmade does not schedule automatic backups for database instances yet. A dump from the console is the reliable way to keep a copy.',
    backupSteps: [
      'Run pg_dump in the console: pg_dump -U postgres yourdb > backup.sql',
      'Keep the dump somewhere outside the instance.',
      'Test that you can restore it into a scratch database before you need it.',
    ],
    upgradeText:
      'Adding memory, CPU or disk happens on the instance page and applies to the same server. A change of the major PostgreSQL version is a different thing.',
    upgradeSteps: [
      'Resize RAM, CPU or disk from the instance page when the database needs more room.',
      'A major version change needs a dump and a restore into a new instance.',
      'Blipmade does not migrate your data between major versions for you.',
    ],
    trouble: [
      {
        q: 'The connection is refused',
        a: 'The instance is stopped, or you are using the wrong port. Check the status and the port shown on the instance page.',
      },
      {
        q: 'Authentication failed',
        a: 'Either the password is wrong, or the data directory already existed when POSTGRES_PASSWORD was set. The first value is the one that counts.',
      },
      {
        q: 'The database runs out of disk',
        a: 'Add disk from the instance page and remove old data. The new disk is added to the same instance.',
      },
    ],
  },
  {
    id: 'mysql',
    group: 'Databases',
    title: 'MySQL',
    summary: 'A MySQL instance for WordPress, Ghost and everything else that speaks MySQL.',
    keywords: ['mysql', 'mariadb', 'sql', 'database', 'wordpress'],
    app: appByName('MySQL'),
    intro:
      'MySQL is the classic relational database and the one most WordPress and Ghost setups expect. The instance runs the server, the data lives on its disk.',
    firstRun: [
      {
        title: 'Deploy MySQL',
        body: 'Deploy MySQL from the catalog and wait for the instance to report online.',
        result: 'A running MySQL server with a root account.',
      },
      {
        title: 'Read the connection details',
        body: 'Copy the host, port, user and password from the instance page.',
        result: 'Your client can connect to the server.',
      },
      {
        title: 'Create a database and an application user',
        body: 'Run CREATE DATABASE app; then create a user and grant it rights on that database only.',
        result: 'Your application has exactly the rights it needs.',
      },
      {
        title: 'Check the version your client speaks',
        body: 'Some clients negotiate a different protocol version than the server offers.',
        result: 'The client reports the server version it agreed on.',
      },
    ],
    envIntro:
      'These variables are applied when the data directory is created. Changing them later does not change the password of a running server.',
    env: [
      { name: 'MYSQL_ROOT_PASSWORD', value: 'Password of the root account' },
      { name: 'MYSQL_DATABASE', value: 'Database created on the first start' },
      { name: 'MYSQL_USER', value: 'Application user created on the first start' },
      { name: 'MYSQL_PASSWORD', value: 'Password of that application user' },
    ],
    backupText:
      'Blipmade does not schedule automatic backups for database instances yet. Dump the database from the console.',
    backupSteps: [
      'Run mysqldump -u root -p yourdb > backup.sql in the console.',
      'Keep the dump outside the instance.',
      'Check that the dump restores before you rely on it.',
    ],
    upgradeText:
      'Resizing the instance is done on the instance page and applies to the running server. Changing the major version of MySQL is not something the dashboard can do for you.',
    upgradeSteps: [
      'Add RAM, CPU or disk from the instance page as the database grows.',
      'A major version change needs a dump and a restore into a new instance.',
      'Blipmade does not migrate data between major versions.',
    ],
    trouble: [
      {
        q: 'Access denied for the application user',
        a: 'The host part of the grant has to match the client: app@% covers any host, app@localhost does not cover a remote application.',
      },
      {
        q: 'The server refuses to start after a password change',
        a: 'MYSQL_ROOT_PASSWORD only applies to an empty data directory. Change the password of the running server with ALTER USER instead.',
      },
      {
        q: 'The instance runs out of disk',
        a: 'Increase the disk from the instance page and clean up old logs and temporary tables.',
      },
    ],
  },
  {
    id: 'redis',
    group: 'Databases',
    title: 'Redis',
    summary: 'An in-memory store for caching, queues and rate limits.',
    keywords: ['redis', 'cache', 'queue', 'rate limit', 'memory'],
    app: appByName('Redis'),
    intro:
      'Redis keeps data in memory, which makes it the usual choice for caches, job queues and rate limiters. It is small, fast and easy to lose, so treat it as a cache unless you have enabled persistence.',
    firstRun: [
      {
        title: 'Deploy Redis',
        body: 'Deploy Redis from the catalog and wait for the instance to report online.',
        result: 'A running Redis server.',
      },
      {
        title: 'Check the connection',
        body: 'Run redis-cli -h <host> -p <port> PING from your own machine or from the console.',
        result: 'The server answers PONG.',
      },
      {
        title: 'Require a password',
        body: 'Set REDIS_PASSWORD, or add requirepass to the configuration, so the instance is not open to anyone who finds the host.',
        result: 'Unauthenticated clients are rejected.',
      },
      {
        title: 'Decide what happens at the memory limit',
        body: 'Set a maxmemory value and an eviction policy that matches your data.',
        result: 'Redis evicts keys in a predictable way instead of being killed by the platform.',
      },
    ],
    envIntro:
      'Two things decide how Redis behaves under pressure. Set them before your application fills the cache.',
    env: [
      { name: 'REDIS_PASSWORD', value: 'Password required from clients' },
      { name: 'REDIS_MAXMEMORY', value: 'Memory limit in bytes, for example 256mb' },
      { name: 'REDIS_MAXMEMORY_POLICY', value: 'Eviction policy, for example allkeys-lru' },
    ],
    backupText:
      'Blipmade does not schedule automatic backups for database instances yet. Redis usually rebuilds its content from the application, but persistence still helps.',
    backupSteps: [
      'Save a snapshot with redis-cli --rdb from the console.',
      'Or enable appendonly so Redis writes an append-only file next to the data.',
      'Keep in mind that a cache can be rebuilt faster than it can be restored.',
    ],
    upgradeText:
      'Redis rarely needs more memory than the minimum configuration, but a bigger cache does help. Resizing happens on the instance page.',
    upgradeSteps: [
      'Add RAM or disk from the instance page when the memory metric sits near the limit.',
      'Change REDIS_MAXMEMORY to a value below the memory you gave the instance.',
      'A change of the major Redis version needs a dump and a restore into a new instance.',
    ],
    trouble: [
      {
        q: 'OOM command not allowed',
        a: 'Redis reached its memory limit. Add RAM, set an eviction policy or store smaller values.',
      },
      {
        q: 'The connection drops after a while',
        a: 'The server closes idle connections. Enable keepalive on the client side.',
      },
      {
        q: 'The data is gone after a restart',
        a: 'Redis was running without persistence. Turn on appendonly and set a maxmemory policy, then restart.',
      },
    ],
  },
  {
    id: 'mongodb',
    group: 'Databases',
    title: 'MongoDB',
    summary: 'A document database for flexible schemas and JSON-shaped data.',
    keywords: ['mongodb', 'mongo', 'document database', 'nosql'],
    app: appByName('MongoDB'),
    intro:
      'MongoDB stores documents instead of rows, which suits data whose shape changes. The instance runs the server and keeps the data on its own disk.',
    firstRun: [
      {
        title: 'Deploy MongoDB',
        body: 'Deploy MongoDB from the catalog and wait for the instance to report online.',
        result: 'A running MongoDB server with its data directory on the instance disk.',
      },
      {
        title: 'Read the connection details',
        body: 'Copy the host, the port and the credentials from the instance page.',
        result: 'mongosh connects to the server.',
      },
      {
        title: 'Create the application database',
        body: 'Switch to the database you want to use; it is created with the first write.',
        result: 'Your collections live in the database you chose.',
      },
      {
        title: 'Create an application user',
        body: 'Create a user with readWrite on that one database and use it from your application.',
        result: 'The application cannot touch the other databases of the instance.',
      },
    ],
    envIntro:
      'These variables only apply while the data directory is empty. After that, change the account from inside the server.',
    env: [
      { name: 'MONGO_INITDB_ROOT_USERNAME', value: 'Name of the first administrator' },
      { name: 'MONGO_INITDB_ROOT_PASSWORD', value: 'Password of that administrator' },
      { name: 'MONGO_INITDB_DATABASE', value: 'Database created on the first start' },
    ],
    backupText:
      'Blipmade does not schedule automatic backups for database instances yet. A dump from the console keeps your collections safe.',
    backupSteps: [
      'Run mongodump --db yourdb --archive --gzip in the console.',
      'Keep the archive outside the instance.',
      'Check that mongorestore can read it back.',
    ],
    upgradeText:
      'Resizing the instance is done on the instance page and applies to the running server. A change of the major MongoDB version is a migration, not a resize.',
    upgradeSteps: [
      'Add RAM, CPU or disk from the instance page as your collections grow.',
      'A major version change needs a mongodump and a mongorestore into a new instance.',
      'Blipmade does not migrate your documents between major versions.',
    ],
    trouble: [
      {
        q: 'Authentication failed',
        a: 'MONGO_INITDB_ROOT_USERNAME only applies to an empty data directory. After that, change the password with db.changeUserPassword inside the server.',
      },
      {
        q: 'The disk fills up',
        a: 'The WiredTiger journal and the cache both live on the instance disk. Add disk and compact large collections.',
      },
      {
        q: 'The connection times out',
        a: 'The instance is stopped or the port is not reachable. Check the status of the instance and the port in the connection details.',
      },
    ],
  },
];

// --- hand written pages ----------------------------------------------------

const HAND_WRITTEN: DocPage[] = [
  {
    id: 'getting-started',
    group: 'Getting started',
    title: 'Create an account and sign in',
    summary: 'One account for your apps, databases, domains and billing.',
    keywords: ['account', 'register', 'sign up', 'login', 'email', 'verification'],
    updated: UPDATED,
    sections: [
      {
        id: 'what-you-need',
        title: 'What you need',
        blocks: [
          {
            t: 'list',
            items: [
              'An email address you can open right now. Blipmade sends the verification and password reset mail there.',
              'A password of at least 8 characters. Use a password manager, because the password cannot be changed from inside a signed-in session.',
            ],
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Your name is optional. You can leave it empty and set it later; the account works with the email address alone.',
          },
        ],
      },
      {
        id: 'create-your-account',
        title: 'Create your account',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the sign-up form',
                body: 'Go to the register page and fill in your name, email address and password.',
                result: 'The account is created and you are signed in straight away.',
              },
              {
                title: 'Check your inbox',
                body: 'Blipmade sends a verification link to the address you just registered.',
                result: 'The link opens your account and marks the address as verified.',
              },
              {
                title: 'Resend the mail if it did not arrive',
                body: 'Mail sometimes lands in the spam folder. If it is not there either, request a new verification email from the dashboard.',
                result: 'A new verification email arrives. The answer is the same whether or not the address exists, so nobody can learn yours from the response.',
              },
            ],
          },
        ],
      },
      {
        id: 'sign-in',
        title: 'Sign in',
        blocks: [
          {
            t: 'p',
            text: 'Sign in with your email address and password. The session is stored in an HttpOnly cookie, so it survives a page reload but is not readable by scripts in the browser.',
          },
          {
            t: 'code',
            lang: 'bash',
            code: `curl -X POST "$BASE/api/auth/login" \\
  -H "Content-Type: application/json" \\
  -c cookies.txt \\
  -d '{"email":"you@example.com","password":"your-password"}'`,
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Keep the cookie jar of the curl example. Every request that changes something also needs the X-CSRF-Token header, whose value is the readable bm_csrf cookie.',
          },
        ],
      },
      {
        id: 'if-you-are-stuck',
        title: 'If you are stuck',
        blocks: [
          {
            t: 'p',
            text: 'Forgotten password? Use the reset link on the sign-in page. Blipmade emails a link that opens the settings page with a token, and you set the new password there.',
          },
          {
            t: 'p',
            text: 'Still blocked? Open a ticket and describe what you see. The support queue is in your dashboard.',
          },
        ],
      },
    ],
    next: ['first-app', 'account-security'],
  },
  {
    id: 'first-app',
    group: 'Getting started',
    title: 'Deploy your first app',
    summary: 'From an empty account to a running instance in four steps.',
    keywords: ['deploy', 'first app', 'order', 'checkout', 'provision'],
    updated: UPDATED,
    sections: [
      {
        id: 'choose',
        title: 'Choose an app',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the catalog',
                body: 'The catalog lists every app and database with its minimum resources and starting price.',
                result: 'You see the full list with a price from for each entry.',
              },
              {
                title: 'Pick the one you need',
                body: 'Open an app to see its page in this documentation, including the first-run steps.',
                result: 'The configurator opens with the minimum configuration selected.',
              },
            ],
          },
        ],
      },
      {
        id: 'resources',
        title: 'Choose the resources',
        blocks: [
          {
            t: 'p',
            text: 'Set the memory, the CPU and the disk for the instance. The price is calculated on the server for exactly the configuration you pick, so the number you see is the number you pay.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Start with the minimum configuration. You can add resources later from the instance page, and the price difference is shown before you confirm.',
          },
        ],
      },
      {
        id: 'pay',
        title: 'Pay and provision',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Place the order',
                body: 'Confirm the quote and place the order.',
                result: 'The order appears in your billing history with its number and total.',
              },
              {
                title: 'Complete the payment',
                body: 'You are sent to the payment page to finish the payment.',
                result: 'The order is marked as paid and provisioning starts.',
              },
              {
                title: 'Wait for the instance',
                body: 'The status moves from pending to provisioning and finally to online.',
                result: 'The instance appears in your dashboard with its address.',
              },
            ],
          },
        ],
      },
      {
        id: 'open-it',
        title: 'Open it and finish the setup',
        blocks: [
          {
            t: 'p',
            text: 'Open the address of the instance and complete the setup of the app itself: the installer, the first account or the import of your data. Every app has its own first-run steps in this documentation.',
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Attach your own domain right after the first start. That way you do not have to change any URLs later.',
          },
        ],
      },
      {
        id: 'stuck',
        title: 'If something does not come up',
        blocks: [
          {
            t: 'list',
            items: [
              'The instance stays on pending: nothing is wrong yet, provisioning takes a moment.',
              'The instance shows degraded: check the metrics page, the instance is running but short of resources.',
              'The instance failed: open a ticket with the instance attached so support sees the right context.',
            ],
          },
        ],
      },
    ],
    next: ['resources', 'domains'],
  },
  {
    id: 'resources',
    group: 'Resources & billing',
    title: 'Choose the right resources',
    summary: 'Memory, CPU and disk, and how they turn into a price.',
    keywords: ['resources', 'ram', 'memory', 'cpu', 'disk', 'storage', 'price', 'quote'],
    updated: UPDATED,
    sections: [
      {
        id: 'what-you-can-change',
        title: 'What you can change',
        blocks: [
          {
            t: 'list',
            items: [
              'Memory (RAM) — how much an application may use at once. It is the first limit most applications hit.',
              'CPU — how much processing time the instance gets.',
              'Disk — how much data the instance can keep. Growing the disk keeps the data that is already there.',
            ],
          },
        ],
      },
      {
        id: 'how-pricing-works',
        title: 'How pricing works',
        blocks: [
          {
            t: 'p',
            text: 'Blipmade never calculates prices in the browser. The server takes your configuration and returns the subtotal, any discount and the total. What you see in the dashboard is what you are charged.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Prices are monthly and in euros. There are no setup fees.',
          },
        ],
      },
      {
        id: 'change-resources',
        title: 'Change the resources of a running instance',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the instance page and find the resources section.',
                result: 'The current memory, CPU and disk are shown.',
              },
              {
                title: 'Enter the new values',
                body: 'Choose the new sizes within the limits the catalog allows for that product.',
                result: 'The form shows the new configuration.',
              },
              {
                title: 'Confirm',
                body: 'The server applies the change and returns the new price together with the difference to your current price.',
                result: 'The instance keeps running on the new resources and the difference is added to your next invoice.',
              },
            ],
          },
        ],
      },
      {
        id: 'getting-it-wrong',
        title: 'Getting it wrong',
        blocks: [
          {
            t: 'callout',
            tone: 'warning',
            text: 'Disk cannot shrink below the data that is already there. If you lower the disk size below what your files occupy, the change is refused.',
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Watch the metrics page for a day before you resize. It shows the real memory and CPU use, which is a better guide than a guess.',
          },
        ],
      },
    ],
    next: ['billing', 'upgrade'],
  },
  {
    id: 'billing',
    group: 'Resources & billing',
    title: 'Invoices and payment methods',
    summary: 'What you are charged, where the invoice is, and how to change the card.',
    keywords: ['billing', 'invoice', 'payment', 'card', 'stripe', 'receipt', 'vat'],
    updated: UPDATED,
    sections: [
      {
        id: 'the-billing-page',
        title: 'The billing page',
        blocks: [
          {
            t: 'p',
            text: 'The billing page shows your monthly estimate, the end of the current period, the payment method on file and every invoice we issued.',
          },
          {
            t: 'list',
            items: [
              'The monthly estimate is the sum of what your instances cost at their current resources. It is an estimate, because the final invoice is calculated when the period closes.',
              'The period end tells you when the current period closes and when a cancellation would take effect.',
              'The payment method shows which card is charged. Change it in the payment provider, not here.',
            ],
          },
        ],
      },
      {
        id: 'invoices',
        title: 'Read an invoice',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the invoice list',
                body: 'Every invoice has a number, an amount, a tax amount and a total.',
                result: 'You see one row per period.',
              },
              {
                title: 'Open the invoice',
                body: 'Each invoice can be opened in the browser or downloaded as a PDF.',
                result: 'The document shows the lines, the tax and the total.',
              },
            ],
          },
        ],
      },
      {
        id: 'payment-method',
        title: 'Change the payment method',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the billing page',
                body: 'Find the payment method section.',
                result: 'You see the card that is on file.',
              },
              {
                title: 'Continue to the payment provider',
                body: 'The payment provider opens in a secure page to collect the new card.',
                result: 'You are back on the billing page with the new card on file.',
              },
            ],
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Blipmade never sees or stores your card details. That happens entirely in the payment provider.',
          },
        ],
      },
      {
        id: 'payment-failed',
        title: 'If a payment fails',
        blocks: [
          {
            t: 'p',
            text: 'A failed payment puts the subscription in a past due state and the instance is stopped after a grace period. Update the payment method and the instance is started again.',
          },
        ],
      },
    ],
    next: ['cancel', 'upgrade'],
  },
  {
    id: 'upgrade',
    group: 'Resources & billing',
    title: 'Upgrade or resize an instance',
    summary: 'More memory, CPU or disk, without a new server and without moving your data.',
    keywords: ['upgrade', 'resize', 'scale', 'more ram', 'disk'],
    updated: UPDATED,
    sections: [
      {
        id: 'what-a-resize-does',
        title: 'What a resize does',
        blocks: [
          {
            t: 'p',
            text: 'A resize changes the resources of the running instance. Your files, your database and your configuration stay where they are, and the instance keeps its address.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Resizing is not a reinstall. Nothing is reinstalled, so nothing has to be migrated.',
          },
        ],
      },
      {
        id: 'steps',
        title: 'Resize an instance',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the instance page and find the resources section.',
                result: 'The current sizes are shown.',
              },
              {
                title: 'Choose the new sizes',
                body: 'Set the memory, CPU and disk you need.',
                result: 'The new configuration is ready to confirm.',
              },
              {
                title: 'Confirm and check the price',
                body: 'The server returns the new price and the difference to your current price.',
                result: 'The difference is added to the next invoice.',
              },
            ],
          },
        ],
      },
      {
        id: 'downgrades',
        title: 'Downgrades',
        blocks: [
          {
            t: 'p',
            text: 'You can lower the resources as well. Disk cannot shrink below the space your files already use, and memory below what the application needs to start.',
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Stop the instance before a large downgrade. It releases memory and makes the change predictable.',
          },
        ],
      },
    ],
    next: ['billing', 'cancel'],
  },
  {
    id: 'cancel',
    group: 'Resources & billing',
    title: 'Cancel an instance',
    summary: 'Stop paying for an instance without losing the current period.',
    keywords: ['cancel', 'terminate', 'delete', 'subscription'],
    updated: UPDATED,
    sections: [
      {
        id: 'what-cancelling-does',
        title: 'What cancelling does',
        blocks: [
          {
            t: 'p',
            text: 'Cancelling an instance ends the subscription at the end of the period you already paid for. The instance keeps running and keeps its address until then.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Nothing is deleted before the period ends, so you can resume the subscription from the billing page if you change your mind.',
          },
        ],
      },
      {
        id: 'steps',
        title: 'Cancel an instance',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Find the cancel action on the instance page.',
                result: 'You are asked to confirm.',
              },
              {
                title: 'Confirm',
                body: 'The subscription is marked to end at the period end.',
                result: 'The instance shows that it will be cancelled and the period end stays visible.',
              },
            ],
          },
        ],
      },
      {
        id: 'after-the-period',
        title: 'After the period ends',
        blocks: [
          {
            t: 'p',
            text: 'The instance is stopped and the data is removed from the node. Download anything you still need before the period ends — the file browser is the last place to get it.',
          },
          {
            t: 'callout',
            tone: 'danger',
            text: 'After the period ends the data is gone. Take your own backup before you let the subscription run out.',
          },
        ],
      },
    ],
    next: ['billing', 'limits'],
  },
  {
    id: 'domains',
    group: 'Domains & SSL',
    title: 'Attach a domain to an instance',
    summary: 'Point your own hostname at a running instance.',
    keywords: ['domain', 'hostname', 'dns', 'cname', 'a record'],
    updated: UPDATED,
    sections: [
      {
        id: 'add-the-hostname',
        title: 'Add the hostname',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the instance page and add a domain.',
                result: 'A form asks for the hostname.',
              },
              {
                title: 'Enter the hostname',
                body: 'Use the hostname without a scheme, for example app.example.com.',
                result: 'The domain appears with the DNS records you have to create.',
              },
              {
                title: 'Note the records',
                body: 'The domain shows a name, a type and a value for every record it needs.',
                result: 'You have everything you need for your DNS provider.',
              },
            ],
          },
        ],
      },
      {
        id: 'point-the-dns',
        title: 'Point the DNS at Blipmade',
        blocks: [
          {
            t: 'p',
            text: 'Create the records the instance listed at your DNS provider. The values come from the instance, so copy them exactly as shown.',
          },
          {
            t: 'code',
            lang: 'text',
            code: `; example only — copy the real values from the domain in your dashboard
@     A     203.0.113.10
www   CNAME @`,
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'DNS changes take time to spread. A record that looks wrong for a few minutes is normal; most resolvers catch up within an hour.',
          },
        ],
      },
      {
        id: 'verify',
        title: 'Verify the domain',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the domain',
                body: 'Go to the domains page and open the domain.',
                result: 'You see its status, the address record and the proof of ownership it expects.',
              },
              {
                title: 'Publish the proof',
                body: 'Add the TXT record the domain shows: the name and the value are on the domain itself. An address record is not enough, because every customer points at the same address.',
                result: 'The hostname is proven to be yours.',
              },
              {
                title: 'Verify',
                body: 'Start the verification. Blipmade reads the TXT record and compares it with the token of the domain.',
                result: 'The status moves from verifying to active.',
              },
              {
                title: 'Open the hostname',
                body: 'Visit your own hostname in a browser.',
                result: 'Your instance answers on the hostname you chose.',
              },
            ],
          },
        ],
      },
      {
        id: 'not-working',
        title: 'If the hostname does not work',
        blocks: [
          {
            t: 'trouble',
            items: [
              {
                q: 'The status stays verifying',
                a: 'The TXT record is not visible yet or does not carry the expected value. Wait for the DNS to spread and verify again.',
              },
              {
                q: 'The status turns to error',
                a: 'The domain shows the last error it hit. Compare the records at your provider with the records the instance lists, character by character.',
              },
              {
                q: 'The hostname resolves but the site is empty',
                a: 'The instance is stopped or is not listening on the port of the domain. Check the status and the target port of the domain.',
              },
            ],
          },
        ],
      },
    ],
    next: ['dns', 'ssl'],
  },
  {
    id: 'dns',
    group: 'Domains & SSL',
    title: 'The DNS records you need',
    summary: 'Which records to create, and where to read the values from.',
    keywords: ['dns', 'records', 'a record', 'cname', 'propagation', 'nameserver'],
    updated: UPDATED,
    sections: [
      {
        id: 'the-records',
        title: 'The records',
        blocks: [
          {
            t: 'p',
            text: 'Every domain in your dashboard lists the records it expects, each with a name, a type and a value. Blipmade does not guess them: it tells you what to create at your DNS provider.',
          },
          {
            t: 'list',
            items: [
              'A record for the bare hostname, usually an A record with an address.',
              'A CNAME record for the subdomains you want, pointing at the bare hostname.',
              'A TXT record that proves the hostname belongs to you. The domain shows the name and the value.',
              'Nothing else. Do not add a second A record for the same name, because the resolver has to pick one.',
            ],
          },
          {
            t: 'callout',
            tone: 'warning',
            text: 'If your provider has a CNAME flattening or proxy setting, turn it off for these records. A proxied hostname does not answer the verification check.',
          },
        ],
      },
      {
        id: 'create-them',
        title: 'Create the records',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the domain in the dashboard',
                body: 'The list of records is on the domain itself.',
                result: 'You see name, type and value for each record.',
              },
              {
                title: 'Create them at your provider',
                body: 'Add one record per line, exactly as listed.',
                result: 'Your provider shows the new records as active.',
              },
              {
                title: 'Verify',
                body: 'Start the verification again from the domain page.',
                result: 'The status becomes active once the records are visible.',
              },
            ],
          },
        ],
      },
      {
        id: 'propagation',
        title: 'Propagation',
        blocks: [
          {
            t: 'p',
            text: 'Propagation is the time between creating a record and every resolver seeing it. It is usually minutes and at worst a few hours, and it depends on the TTL of the record rather than on Blipmade.',
          },
        ],
      },
    ],
    next: ['ssl', 'domains'],
  },
  {
    id: 'ssl',
    group: 'Domains & SSL',
    title: 'SSL certificates',
    summary: 'Where HTTPS on your own hostname stands today.',
    keywords: ['ssl', 'tls', 'https', 'certificate', 'lets encrypt'],
    updated: UPDATED,
    sections: [
      {
        id: 'current-state',
        title: 'Current state',
        blocks: [
          {
            t: 'p',
            text: (
              <>
                Automatic certificate issuance for attached hostnames is{' '}
                <span className="rounded-full bg-s3 px-2 py-0.5 align-middle text-[12px] font-bold text-ink2">Planned</span>
                . Blipmade does not hand out certificates yet, and it does not ask you to upload one either.
              </>
            ),
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Until certificates are issued automatically, use HTTPS with a certificate you control — for example from your own DNS provider — or keep the instance behind the hostname you already secured.',
          },
        ],
      },
      {
        id: 'what-to-do-now',
        title: 'What to do now',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Secure the hostname yourself',
                body: 'Terminate TLS at your DNS provider or at a proxy in front of the instance, using a certificate for that hostname.',
                result: 'Your visitors reach the instance over HTTPS.',
              },
              {
                title: 'Check that the instance is not open to the world',
                body: 'Set a strong password for the application and its admin area before you expose it.',
                result: 'A guessable admin account is no longer the weakest link.',
              },
            ],
          },
        ],
      },
      {
        id: 'when-it-ships',
        title: 'When it ships',
        blocks: [
          {
            t: 'p',
            text: 'This page is updated when the status endpoint of a domain reports a certificate. Until then, treat automatic certificates as not available.',
          },
        ],
      },
    ],
    next: ['domains', 'account-security'],
  },
  {
    id: 'files',
    group: 'Files & console',
    title: 'Browse and edit files',
    summary: 'The file browser of an instance, from the dashboard.',
    keywords: ['files', 'file manager', 'editor', 'upload', 'delete', 'disk'],
    updated: UPDATED,
    sections: [
      {
        id: 'open-the-browser',
        title: 'Open the file browser',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the files section of the instance.',
                result: 'You see the files of the instance root.',
              },
              {
                title: 'Walk into a folder',
                body: 'Open folders to see what is inside, and go back with the breadcrumb.',
                result: 'You see the files with their size and their last modification.',
              },
            ],
          },
        ],
      },
      {
        id: 'edit-a-file',
        title: 'Edit a file',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the file',
                body: 'Open a text file to see its content.',
                result: 'The content is shown in an editor.',
              },
              {
                title: 'Change it and save',
                body: 'Edit the content and save the file.',
                result: 'The file on the instance holds the new content.',
              },
            ],
          },
          {
            t: 'callout',
            tone: 'warning',
            text: 'Saving replaces the whole file. If the application is running and holds that file open, it may keep running with the old content until it is restarted.',
          },
        ],
      },
      {
        id: 'delete-a-file',
        title: 'Delete a file',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Select the file',
                body: 'Open the folder that holds the file.',
                result: 'The file is listed with its size.',
              },
              {
                title: 'Delete it',
                body: 'Delete the file and confirm.',
                result: 'The file is removed from the instance.',
              },
            ],
          },
          {
            t: 'callout',
            tone: 'danger',
            text: 'A deleted file cannot be recovered from the dashboard. There is no trash folder and no automatic backup yet.',
          },
        ],
      },
      {
        id: 'large-files',
        title: 'Large files',
        blocks: [
          {
            t: 'p',
            text: 'The file browser is meant for configuration and small edits. For large uploads, use the console: a download in the instance is faster and does not depend on the browser.',
          },
        ],
      },
    ],
    next: ['console', 'instance-access'],
  },
  {
    id: 'console',
    group: 'Files & console',
    title: 'Open the console',
    summary: 'A shell on the instance, straight from the dashboard.',
    keywords: ['console', 'terminal', 'shell', 'ssh', 'logs', 'commands'],
    updated: UPDATED,
    sections: [
      {
        id: 'open-the-console',
        title: 'Open the console',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the console section of the instance.',
                result: 'The console connects and shows the output of the application.',
              },
              {
                title: 'Wait for a prompt',
                body: 'The console attaches to the process of the instance as the user the application runs as.',
                result: 'You can type commands.',
              },
            ],
          },
        ],
      },
      {
        id: 'what-to-use-it-for',
        title: 'What to use it for',
        blocks: [
          {
            t: 'list',
            items: [
              'Reading the output of the application when it will not start.',
              'Running migrations, imports or a one-off script inside the instance.',
              'Checking what is actually on disk, including files the browser does not show.',
            ],
          },
        ],
      },
      {
        id: 'limits',
        title: 'What the console does not do',
        blocks: [
          {
            t: 'list',
            items: [
              'It does not give you the privileges of the platform. You cannot manage other instances or the billing from inside the console.',
              'It does not survive a rebuild of the instance. Anything you installed outside your project is gone after the next rebuild.',
              'It does not replace a backup. Keep your own copy of what matters.',
            ],
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Put anything you want to run on every start into the startup command of the instance. The console is for the one-off job.',
          },
        ],
      },
    ],
    next: ['files', 'troubleshooting'],
  },
  {
    id: 'account-security',
    group: 'Security',
    title: 'Account security',
    summary: 'Your session, your email address and your password.',
    keywords: ['security', 'password', 'verification', 'session', 'logout', 'sign out'],
    updated: UPDATED,
    sections: [
      {
        id: 'your-session',
        title: 'Your session',
        blocks: [
          {
            t: 'p',
            text: 'Signing in creates a session on the server and hands the browser an HttpOnly cookie. Scripts in the page cannot read it, and it is renewed as long as you keep working.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'A list of the devices signed in to your account is not available yet. Until it is, signing out of a shared computer is the safest move.',
          },
        ],
      },
      {
        id: 'verify-your-email',
        title: 'Verify your email address',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the verification email',
                body: 'The link in the email carries a token that verifies the address.',
                result: 'The account shows the address as verified.',
              },
              {
                title: 'Request a new email if it expired',
                body: 'Request a new verification email from the dashboard.',
                result: 'A new link arrives. The answer is the same whether or not the address exists.',
              },
            ],
          },
        ],
      },
      {
        id: 'reset-your-password',
        title: 'Reset your password',
        blocks: [
          {
            t: 'p',
            text: 'There is no password change endpoint for a signed-in account, so the password is changed with a reset token instead.',
          },
          {
            t: 'steps',
            items: [
              {
                title: 'Ask for a reset link',
                body: 'Open the settings page and choose Request a password reset link.',
                result: 'Blipmade emails a link to the address on the account.',
              },
              {
                title: 'Open the link',
                body: 'The link opens the settings page with a token.',
                result: 'The page switches to the new password form.',
              },
              {
                title: 'Choose the new password',
                body: 'Enter the new password twice and confirm.',
                result: 'You are signed out of the old session and the new password works from now on.',
              },
            ],
          },
          {
            t: 'code',
            lang: 'bash',
            code: `# the API answers 204 either way, so nobody can learn whether the address exists
curl -X POST "$BASE/api/auth/forgot-password" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com"}'`,
          },
        ],
      },
      {
        id: 'sign-out',
        title: 'Sign out',
        blocks: [
          {
            t: 'p',
            text: 'Signing out ends the session on the server and clears the cookie in the browser. The settings page has a button for it.',
          },
        ],
      },
    ],
    next: ['instance-access', 'limits'],
  },
  {
    id: 'instance-access',
    group: 'Security',
    title: 'Instance access and secrets',
    summary: 'Environment variables, the startup command and the API.',
    keywords: ['api', 'environment variables', 'secrets', 'startup command', 'token', 'csrf'],
    updated: UPDATED,
    sections: [
      {
        id: 'environment-variables',
        title: 'Environment variables',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Open the instance',
                body: 'Go to the startup and environment section of the instance.',
                result: 'You see the current variables and the startup command.',
              },
              {
                title: 'Set the variables',
                body: 'Add or change the variables the application needs and save.',
                result: 'The instance restarts with the new environment.',
              },
            ],
          },
          {
            t: 'callout',
            tone: 'warning',
            text: 'Environment variables are readable by anyone who can open the instance and by everything that runs inside it. Keep tokens and database passwords out of your repository.',
          },
        ],
      },
      {
        id: 'startup-command',
        title: 'The startup command',
        blocks: [
          {
            t: 'p',
            text: 'The startup command is what the instance runs when it starts. Put your migrations and your installs in it, so a restart comes back in a working state.',
          },
          {
            t: 'code',
            lang: 'bash',
            code: `npm ci --include=dev && npm run build && npm run migrate && exec node server.mjs`,
          },
        ],
      },
      {
        id: 'the-api',
        title: 'Using the API',
        blocks: [
          {
            t: 'p',
            text: 'The API lives under /api of the same address you use for the dashboard. Requests are same-origin and carry your session cookie. Every request that changes something also needs the X-CSRF-Token header, whose value is the readable bm_csrf cookie.',
          },
          {
            t: 'code',
            lang: 'bash',
            code: `# read the token out of the cookie jar
CSRF=$(awk '/bm_csrf/ {print $7}' cookies.txt)

curl -X POST "$BASE/api/tickets" \\
  -H "Content-Type: application/json" \\
  -H "X-CSRF-Token: $CSRF" \\
  -b cookies.txt \\
  -d '{"subject":"WordPress install fails","category":"technical","priority":"normal","body":"The installer stops at the database step."}'`,
          },
        ],
      },
      {
        id: 'api-keys',
        title: 'API keys',
        blocks: [
          {
            t: 'p',
            text: (
              <>
                Programmatic keys are{' '}
                <span className="rounded-full bg-s3 px-2 py-0.5 align-middle text-[12px] font-bold text-ink2">Planned</span>
                . The API does not expose key management, so the dashboard does not offer a button to create one. Until then, scripts use the session of an account, which means they need the cookie and the CSRF token of a signed-in user.
              </>
            ),
          },
          {
            t: 'callout',
            tone: 'danger',
            text: 'Do not put the session cookie of a real account into a script that runs unattended. Treat every cookie like a password.',
          },
        ],
      },
    ],
    next: ['files', 'limits'],
  },
  {
    id: 'troubleshooting',
    group: 'Troubleshooting',
    title: 'Common problems',
    summary: 'What to check, in the order that usually finds the cause.',
    keywords: ['troubleshooting', 'problem', 'error', 'not working', 'down', 'help'],
    updated: UPDATED,
    sections: [
      {
        id: 'check-the-status',
        title: 'Check the status of the instance',
        blocks: [
          {
            t: 'steps',
            items: [
              {
                title: 'Look at the status',
                body: 'The instance page shows the state of the instance.',
                result: 'You see whether it is online, starting, stopped or degraded.',
              },
              {
                title: 'Start it if it is stopped',
                body: 'Use the start action on the instance.',
                result: 'The status moves to starting and then to online.',
              },
            ],
          },
        ],
      },
      {
        id: 'check-the-metrics',
        title: 'Check the metrics',
        blocks: [
          {
            t: 'p',
            text: 'The metrics page shows the memory, the CPU and the network of the instance. An instance that runs out of memory is stopped or degraded, and the metric explains why.',
          },
          {
            t: 'callout',
            tone: 'tip',
            text: 'Memory is the first limit most applications hit. If the memory metric sits near the limit, add RAM from the instance page.',
          },
        ],
      },
      {
        id: 'check-the-events',
        title: 'Check the events',
        blocks: [
          {
            t: 'p',
            text: 'The events of an instance record what happened to it: when it was started, stopped, resized or renamed. It is the fastest way to see whether something changed on our side.',
          },
        ],
      },
      {
        id: 'check-the-console',
        title: 'Check the console',
        blocks: [
          {
            t: 'p',
            text: 'The console shows the output of the application, including the reason it did not start. Errors about a database, a missing file or a wrong environment variable all show up there.',
          },
        ],
      },
      {
        id: 'check-billing',
        title: 'Check the billing',
        blocks: [
          {
            t: 'p',
            text: 'If the instance stopped on its own and the payment method is old, the subscription may be past due. The billing page shows the state of every subscription and lets you update the card.',
          },
        ],
      },
      {
        id: 'ask',
        title: 'Ask us',
        blocks: [
          {
            t: 'p',
            text: 'Still stuck? Open a ticket and attach the instance. Include what you expected, what happened, and the relevant part of the console output. That context is what makes the difference between a question and an answer.',
          },
        ],
      },
    ],
    next: ['limits', 'account-security'],
  },
  {
    id: 'limits',
    group: 'Limits & fair use',
    title: 'Limits and fair use',
    summary: 'What is bounded, what is published, and what is not there yet.',
    keywords: ['limits', 'fair use', 'abuse', 'policy', 'quotas', 'resources'],
    updated: UPDATED,
    sections: [
      {
        id: 'per-product-limits',
        title: 'Limits that apply to your instances',
        blocks: [
          {
            t: 'p',
            text: 'Every product in the catalog has a minimum and a maximum for memory, CPU and disk. The configurator refuses anything outside those values, so an instance can never ask for more than the plan allows.',
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'Those bounds come from the catalog itself. You do not have to remember them: the form shows what is allowed.',
          },
        ],
      },
      {
        id: 'not-published-yet',
        title: 'What is not published yet',
        blocks: [
          {
            t: 'p',
            text: 'Blipmade does not publish quotas for traffic, tickets, accounts or the number of instances you may run. Nothing here is a hidden limit you can trip over: if a limit exists, it is shown where you would hit it.',
          },
          {
            t: 'list',
            items: [
              'Traffic and bandwidth ceilings per instance: not available yet.',
              'A maximum number of instances per account: not available yet.',
              'Published response times for support tickets: not available yet.',
            ],
          },
        ],
      },
      {
        id: 'within-your-resources',
        title: 'Staying within your resources',
        blocks: [
          {
            t: 'list',
            items: [
              'Give an application the memory it needs. Applications that are short of memory are the most common cause of a degraded instance.',
              'Watch the disk. Databases, logs and uploads all end up on the same disk, and a full disk stops the application.',
              'Do not use an instance to send bulk mail or to run something that has nothing to do with the application you deployed.',
            ],
          },
          {
            t: 'callout',
            tone: 'note',
            text: 'An instance that is used only as it was deployed — the application, its configuration and its data — is what the platform is built for.',
          },
        ],
      },
      {
        id: 'backups',
        title: 'Backups',
        blocks: [
          {
            t: 'p',
            text: 'Blipmade does not take automatic backups of your data yet. That is a decision about your data, not about ours: you know what the data is and how it should be restored. Until automated backups arrive, take your own copy with the commands on each app page.',
          },
        ],
      },
    ],
    next: ['troubleshooting', 'resources'],
  },
];

const PAGES: DocPage[] = [...APP_DOCS.map(appPage), ...HAND_WRITTEN];

const PAGE_BY_ID = new Map<string, DocPage>(PAGES.map((page): [string, DocPage] => [page.id, page]));

// --- blocks ----------------------------------------------------------------

const CALLOUT: Record<'note' | 'tip' | 'warning' | 'danger', { icon: IconName; label: string; className: string }> = {
  note: { icon: 'doc', label: 'Note', className: 'bg-s2 text-ink2' },
  tip: { icon: 'bolt', label: 'Tip', className: 'bg-acc-bg text-acc' },
  warning: { icon: 'shield', label: 'Warning', className: 'bg-warn/12 text-warn' },
  danger: { icon: 'close', label: 'Danger', className: 'bg-bad/12 text-bad' },
};

function Callout({ tone, text }: { tone: 'note' | 'tip' | 'warning' | 'danger'; text: string }) {
  const spec = CALLOUT[tone];
  return (
    <aside className={cn('flex items-start gap-3 rounded-2xl px-4 py-3.5', spec.className)}>
      <span className="mt-0.5 shrink-0">
        <Icon name={spec.icon} size={17} />
      </span>
      <p className="min-w-0 text-[14px] leading-relaxed">
        <span className="font-bold">{spec.label}:</span> {text}
      </p>
    </aside>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group overflow-hidden rounded-2xl bg-con p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">{lang}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Code copied to the clipboard' : 'Copy the code to the clipboard'}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-s3 px-3 text-[12.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <Icon name={copied ? 'check' : 'doc'} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto">
        <code className="font-mono text-[13px] leading-relaxed text-con-ink">{code}</code>
      </pre>
    </div>
  );
}

function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="grid gap-2.5">
      {items.map((step, index) => (
        <li key={step.title} className="rounded-2xl bg-s1 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-acc font-mono text-[13px] font-bold text-on-acc"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">{step.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink2">{step.body}</p>
              <p className="mt-2 flex items-start gap-2 text-[13.5px] leading-relaxed text-acc">
                <span className="mt-0.5 shrink-0">
                  <Icon name="check" size={15} />
                </span>
                <span>
                  <span className="font-bold">Expected:</span> {step.result}
                </span>
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Trouble({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <details key={item.q} className="rounded-2xl bg-s1 px-4 py-3.5">
          <summary className="cursor-pointer list-none text-[14.5px] font-bold tracking-[-0.02em] text-ink marker:hidden">
            {item.q}
          </summary>
          <p className="mt-2 text-[14px] leading-relaxed text-ink2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

function Spec({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid gap-1.5">
      {rows.map((row) => (
        <div
          key={row.k}
          className="flex flex-col gap-0.5 rounded-2xl bg-s1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
        >
          <dt className="shrink-0 text-[13.5px] font-bold text-ink2 sm:w-52">{row.k}</dt>
          <dd className="min-w-0 break-words text-[14px] text-ink">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.t) {
    case 'p':
      return (
        <p key={key} className="text-[15px] leading-relaxed text-ink2">
          {block.text}
        </p>
      );
    case 'list':
      return (
        <ul key={key} className="grid gap-1.5">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-ink2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-acc" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'callout':
      return <Callout key={key} tone={block.tone} text={block.text} />;
    case 'code':
      return <CodeBlock key={key} lang={block.lang} code={block.code} />;
    case 'steps':
      return <Steps key={key} items={block.items} />;
    case 'trouble':
      return <Trouble key={key} items={block.items} />;
    case 'spec':
      return <Spec key={key} rows={block.rows} />;
    default:
      return null;
  }
}

// --- navigation ------------------------------------------------------------

function NavTree({ activeId, onNavigate }: { activeId: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="grid gap-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">{group}</p>
          <ul className="mt-2 grid gap-0.5">
            {PAGES.filter((page) => page.group === group).map((page) => (
              <li key={page.id}>
                <Link
                  to={`/docs?p=${page.id}`}
                  onClick={onNavigate}
                  aria-current={page.id === activeId ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[40px] items-center rounded-xl px-3 text-[14px] font-bold transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc',
                    page.id === activeId ? 'bg-s2 text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
                  )}
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// --- page ------------------------------------------------------------------

export default function Docs() {
  const { query, navigate } = useRouter();
  const [term, setTerm] = useState('');
  const [contentsOpen, setContentsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const pageId = query.p || PAGES[0]!.id;
  const page = PAGE_BY_ID.get(pageId) ?? PAGES[0]!;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isK || (event.key === '/' && !typing)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    return PAGES.filter(
      (candidate) =>
        candidate.title.toLowerCase().includes(needle) ||
        candidate.group.toLowerCase().includes(needle) ||
        candidate.summary.toLowerCase().includes(needle) ||
        candidate.keywords.some((keyword) => keyword.includes(needle)),
    ).slice(0, 8);
  }, [term]);

  const go = (id: string) => {
    setTerm('');
    setContentsOpen(false);
    navigate(`/docs?p=${id}`);
  };

  return (
    <div className="min-h-[100svh] bg-bg">
      <header className="sticky top-0 z-40 bg-bg">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <Logo />

            <div className="relative order-3 w-full lg:order-none lg:ml-6 lg:max-w-[420px] lg:flex-1">
              <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3">
                <Icon name="search" size={16} />
              </span>
              <input
                ref={searchRef}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setTerm('');
                  if (event.key === 'Enter' && results[0]) go(results[0].id);
                }}
                placeholder="Search the documentation"
                aria-label="Search the documentation"
                className="h-11 w-full rounded-full bg-s2 pl-10 pr-4 text-[16px] text-ink outline-none placeholder:text-ink3 focus:bg-s3 focus-visible:ring-2 focus-visible:ring-acc"
              />
              {term.trim() && (
                <div
                  role="region"
                  aria-live="polite"
                  aria-label="Search results"
                  className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-s1 p-1.5"
                >
                  {results.length === 0 ? (
                    <p className="px-3 py-3 text-[13.5px] text-ink3">Nothing matches “{term.trim()}”.</p>
                  ) : (
                    <ul className="grid gap-0.5">
                      {results.map((result) => (
                        <li key={result.id}>
                          <Link
                            to={`/docs?p=${result.id}`}
                            onClick={() => {
                              setTerm('');
                            }}
                            className="block rounded-xl px-3 py-2.5 transition-colors duration-[180ms] hover:bg-s2 focus-visible:ring-2 focus-visible:ring-acc"
                          >
                            <span className="block text-[14px] font-bold text-ink">{result.title}</span>
                            <span className="block truncate text-[12.5px] text-ink3">{result.group}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <nav aria-label="Main" className="ml-auto flex items-center gap-1">
              <Link
                to="/status"
                className="inline-flex h-11 items-center rounded-full px-3 text-[14.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
              >
                Status
              </Link>
              <Link
                to="/"
                className="inline-flex h-11 items-center rounded-full px-3 text-[14.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
              >
                Home
              </Link>
              <button
                type="button"
                onClick={() => setContentsOpen(true)}
                aria-expanded={contentsOpen}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-s2 px-4 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-s3 focus-visible:ring-2 focus-visible:ring-acc lg:hidden"
              >
                <Icon name="menu" size={16} />
                Contents
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)_210px]">
        <aside className="hidden lg:block">
          <div className="sticky top-[84px] max-h-[calc(100svh-104px)] overflow-y-auto pb-6">
            <NavTree activeId={page.id} />
          </div>
        </aside>

        <main className="min-w-0">
          <article className="min-w-0 max-w-[72ch]">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink3">{page.group}</p>
            <h1 className="mt-2 text-[clamp(30px,6vw,42px)] font-extrabold leading-[1.06] tracking-[-0.05em] text-ink">
              {page.title}
            </h1>
            <p className="mt-3 text-[16.5px] leading-relaxed text-ink2">{page.summary}</p>
            <p className="mt-4 text-[12.5px] text-ink3">Last updated {fmtDate(page.updated)}</p>

            {page.sections.map((section) => (
              <section key={section.id} className="mt-9">
                <h2 id={section.id} className="scroll-mt-24 text-[21px] font-extrabold tracking-[-0.035em] text-ink">
                  {section.title}
                </h2>
                <div className="mt-3 grid gap-4">
                  {section.blocks.map((block, index) => renderBlock(block, index))}
                </div>
              </section>
            ))}

            {page.next.length > 0 && (
              <nav aria-label="Next pages" className="mt-12 grid gap-2 sm:grid-cols-2">
                {page.next.map((id) => {
                  const target = PAGE_BY_ID.get(id);
                  if (!target) return null;
                  return (
                    <Link
                      key={id}
                      to={`/docs?p=${id}`}
                      className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl bg-s1 px-4 py-3 transition-colors duration-[180ms] hover:bg-s2 focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink3">Next</span>
                        <span className="block truncate text-[14.5px] font-bold text-ink">{target.title}</span>
                      </span>
                      <Icon name="arrow" size={16} className="shrink-0 text-ink3" />
                    </Link>
                  );
                })}
              </nav>
            )}
          </article>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-[84px] pb-6">
            <p className="px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">On this page</p>
            <ul className="mt-3 grid gap-1">
              {page.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToId(section.id);
                    }}
                    className="block rounded-lg px-1 py-1 text-[13.5px] leading-snug text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {contentsOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-bg px-4 pb-12 pt-4 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Documentation contents"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">Contents</p>
            <button
              type="button"
              onClick={() => setContentsOpen(false)}
              aria-label="Close the contents"
              className="grid size-11 place-items-center rounded-full bg-s2 text-ink2 hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <NavTree activeId={page.id} onNavigate={() => setContentsOpen(false)} />
        </div>
      )}
    </div>
  );
}
