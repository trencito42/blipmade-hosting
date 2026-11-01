/**
 * What a plan of an application includes besides memory, processor and disk.
 *
 * One database for the plans up to 2 GB of memory, two for the larger ones. The panel counts
 * the databases of a server against this limit and refuses one more.
 */
export function databasesIncluded(ramMb: number): number {
  return ramMb >= 4096 ? 2 : 1;
}

/**
 * How many backups of its files a server may hold on its node. Backups that are not locked are rotated:
 * the oldest goes when a new one needs room, so a schedule never stops for lack of a slot. A locked
 * backup is never removed by the rotation.
 */
export function backupsIncluded(ramMb: number): number {
  return ramMb >= 8192 ? 5 : ramMb >= 4096 ? 4 : 3;
}
