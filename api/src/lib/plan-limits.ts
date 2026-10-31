/**
 * What a plan of an application includes besides memory, processor and disk.
 *
 * One database for the plans up to 2 GB of memory, two for the larger ones. The panel counts
 * the databases of a server against this limit and refuses one more.
 */
export function databasesIncluded(ramMb: number): number {
  return ramMb >= 4096 ? 2 : 1;
}
