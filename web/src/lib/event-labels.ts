/**
 * The words for the kinds of events and for the actions the panel records, so a page never shows
 * a raw name like "runtime_state" or "server:file.write".
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  runtime_state: 'Status',
  power: 'Power',
  files: 'Files',
  databases: 'Databases',
  backups: 'Backups',
  schedules: 'Schedules',
  network: 'Network',
  settings: 'Settings',
  startup: 'Startup',
  domain: 'Domains',
  resources: 'Resources',
  command: 'Console',
  cancelled: 'Cancellation',
  renewal: 'Renewal',
  price: 'Price',
  provisioning: 'Setup',
  imported: 'Import',
  suspended: 'Suspension',
  deleted: 'Deletion',
  reconcile: 'Reconciliation',
  refused: 'Refused',
};

const humanize = (raw: string): string => {
  const words = raw.replace(/[:._-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Event';
};

export const eventTypeLabel = (type: string): string => EVENT_TYPE_LABELS[type.toLowerCase()] ?? humanize(type);

const PANEL_ACTIONS: Record<string, string> = {
  'server:power.start': 'Started the server',
  'server:power.stop': 'Stopped the server',
  'server:power.restart': 'Restarted the server',
  'server:power.kill': 'Force-stopped the server',
  'server:console.command': 'Sent a console command',
  'server:file.write': 'Saved a file',
  'server:file.read': 'Opened a file',
  'server:file.delete': 'Deleted a file',
  'server:file.rename': 'Renamed a file',
  'server:file.create-directory': 'Created a folder',
  'server:file.compress': 'Compressed files',
  'server:file.decompress': 'Extracted an archive',
  'server:file.pull': 'Downloaded a file to the server',
  'server:file.uploaded': 'Uploaded a file',
  'server:backup.start': 'Started a backup',
  'server:backup.complete': 'Finished a backup',
  'server:backup.fail': 'A backup failed',
  'server:backup.delete': 'Deleted a backup',
  'server:backup.download': 'Downloaded a backup',
  'server:backup.restore': 'Restored a backup',
  'server:backup.restore-complete': 'Finished restoring a backup',
  'server:database.create': 'Created a database',
  'server:database.delete': 'Deleted a database',
  'server:database.rotate-password': 'Changed a database password',
  'server:schedule.create': 'Created a schedule',
  'server:schedule.update': 'Changed a schedule',
  'server:schedule.delete': 'Deleted a schedule',
  'server:schedule.execute': 'Ran a schedule',
  'server:allocation.create': 'Added a port',
  'server:allocation.delete': 'Removed a port',
  'server:allocation.primary': 'Changed the main port',
  'server:startup.edit': 'Changed a startup value',
  'server:startup.image': 'Changed the startup image',
  'server:settings.rename': 'Renamed the server',
  'server:settings.description': 'Changed the description',
  'server:reinstall': 'Reinstalled the server',
  'server:sftp.write': 'Changed a file over SFTP',
  'server:sftp.create': 'Created a file over SFTP',
  'server:sftp.delete': 'Deleted a file over SFTP',
  'server:sftp.rename': 'Renamed a file over SFTP',
  'server:sftp.create-directory': 'Created a folder over SFTP',
};

/** The sentence for an action of the panel, and the kind of event it belongs to (for the filter). */
export function describePanelAction(action: string): { text: string; kind: string } {
  const [scope, rest = ''] = action.split(':');
  const kind = (rest.split('.')[0] || scope || 'other').toLowerCase();
  const group: Record<string, string> = {
    power: 'Power', console: 'Console', file: 'Files', sftp: 'Files', backup: 'Backups', database: 'Databases',
    schedule: 'Schedules', allocation: 'Network', startup: 'Startup', settings: 'Settings', reinstall: 'Settings',
  };
  return { text: PANEL_ACTIONS[action] ?? humanize(rest || action), kind: group[kind] ?? humanize(kind) };
}
