/**
 * The price of a configuration, computed the way the platform computes it.
 *
 * The API owns the price of everything: the card of rates, the arithmetic and
 * the rounding. This module is the same arithmetic, written for the browser,
 * so the configurator can show a price while the visitor moves a slider
 * without asking the server for every pixel.
 *
 * The arithmetic is the arithmetic of the API, down to the rounding:
 *
 *   price = baseFee
 *         + ramPerGb  * gigabytes of memory
 *         + cpuPerUnit * vCPU
 *         + diskPerGb * gigabytes of storage
 *
 * Everything is an integer, the memory is in MiB, the processor in hundredths
 * and the storage in gigabytes. The price is rounded once, at the end, to the
 * nearest minor unit, with a half rounded up. A price that was computed with
 * floating point and rounded at the end would be off by a cent from time to
 * time, and the customer would be charged a cent the catalog did not show.
 *
 * The test `web/tests/site-pricing.test.ts` checks that this module
 * reproduces the amounts of the API for every product of the catalog.
 */

/** The card of rates of the platform. The API writes the live one into the catalog. */
export interface Rates {
  /** Minor units per gigabyte of memory, per month. */
  ramPerGb: number;
  /** Minor units per vCPU, per month. */
  cpuPerUnit: number;
  /** Minor units per gigabyte of storage, per month. */
  diskPerGb: number;
  /** The minor units of the instance itself, per month. */
  baseFee: number;
}

/** The resources of a configuration. */
export interface Resources {
  /** The memory, in MiB. */
  ram: number;
  /** The processor, in vCPU. It may be a half. */
  cpu: number;
  /** The storage, in GB. */
  disk: number;
}

/** The card of rates of the platform, the one the live catalog carries. */
export const DEFAULT_RATES: Rates = { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 };

/** The unit of the memory: 1024 MiB are one gigabyte that is billed. */
export const RAM_UNIT_MB = 1024;

/** The unit of the processor: a vCPU is a hundred parts of a processor. */
export const CPU_UNIT = 100;

/**
 * The common denominator of the price: the product of the two units that are
 * not whole, 1024 MiB of memory and 100 parts of a processor.
 */
export const PRICE_DENOMINATOR = RAM_UNIT_MB * CPU_UNIT;

/** The price of a configuration, in minor units. */
export function priceOfResources(resources: Resources, rates: Rates = DEFAULT_RATES): number {
  const cpuParts = Math.round(resources.cpu * CPU_UNIT);
  const exact =
    rates.baseFee * PRICE_DENOMINATOR +
    resources.ram * rates.ramPerGb * CPU_UNIT +
    cpuParts * rates.cpuPerUnit * RAM_UNIT_MB +
    resources.disk * rates.diskPerGb * PRICE_DENOMINATOR;
  // Half of the denominator is a whole number, so the rounding is exact: a
  // price that ends in half a minor unit goes up.
  return Math.floor((exact + PRICE_DENOMINATOR / 2) / PRICE_DENOMINATOR);
}

/** The price of a configuration, broken into what it is made of. */
export interface Breakdown {
  /** The price of the memory. */
  ram: number;
  /** The price of the processor. */
  cpu: number;
  /** The price of the storage. */
  disk: number;
  /** The price of the instance itself. */
  base: number;
  /**
   * The price of the add-ons of the configuration.
   *
   * The public site does not sell add-ons, so the number is always zero. The
   * field is here because the breakdown of the server has it, and the two
   * breakdowns have to be the same shape.
   */
  options: number;
  /** The price of the configuration. */
  total: number;
}

/**
 * The breakdown of a configuration.
 *
 * The parts add up to the total: the rounding is done once, on the sum, and
 * the minor unit that is left over goes to the part that lost the most in the
 * rounding. The customer sees a breakdown that adds up.
 */
export function breakdownOfResources(resources: Resources, rates: Rates = DEFAULT_RATES): Breakdown {
  const cpuParts = Math.round(resources.cpu * CPU_UNIT);
  const parts = [
    { key: 'ram' as const, exact: resources.ram * rates.ramPerGb * CPU_UNIT },
    { key: 'cpu' as const, exact: cpuParts * rates.cpuPerUnit * RAM_UNIT_MB },
    { key: 'disk' as const, exact: resources.disk * rates.diskPerGb * PRICE_DENOMINATOR },
    { key: 'base' as const, exact: rates.baseFee * PRICE_DENOMINATOR },
  ];

  const total = priceOfResources(resources, rates);
  const floors = parts.map((part) => Math.floor(part.exact / PRICE_DENOMINATOR));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);

  // The minor unit that is left over goes to the part that lost the most in
  // the rounding. The order of the parts breaks a tie, so the result is the
  // same every time.
  const order = parts
    .map((part, index) => ({ index, lost: part.exact - floors[index]! * PRICE_DENOMINATOR }))
    .sort((left, right) => right.lost - left.lost || left.index - right.index);

  const breakdown: Breakdown = { ram: 0, cpu: 0, disk: 0, base: 0, options: 0, total };
  parts.forEach((part, index) => {
    breakdown[part.key] = floors[index]!;
  });
  for (const { index } of order) {
    if (remainder <= 0) break;
    const key = parts[index]!.key;
    breakdown[key] += 1;
    remainder -= 1;
  }
  return breakdown;
}

/** An amount of minor units, written the way a price is written. */
export const eur = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

/** Memory in the unit the visitor reads it in. */
export const fmtRam = (mb: number): string => (mb >= 1024 ? `${+(mb / 1024).toFixed(2)} GB` : `${mb} MB`);

/** The processor in the unit the visitor reads it in. */
export const fmtCpu = (cpu: number): string => `${+cpu.toFixed(2)} vCPU`;

/** Storage in the unit the visitor reads it in. */
export const fmtDisk = (gb: number): string => `${+gb.toFixed(2)} GB`;
