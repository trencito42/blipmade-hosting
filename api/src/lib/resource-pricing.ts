/**
 * The price of the resources of a deployment.
 *
 * All prices are integer minor units. The rate card of the platform is:
 *
 *   baseFee      for the instance itself, whatever it holds
 * + ramPerGb  * gigabytes of memory
 * + cpuPerUnit * vCPU
 * + diskPerGb * gigabytes of storage
 *
 * and nothing else. The same resources cost the same in every product, in
 * every category and for every egg: a customer who took the cheapest entry of
 * the catalog and put something else in it would pay for the resources they
 * really use.
 *
 * The module holds nothing but the arithmetic of the price: no database, no
 * settings and no request. That is deliberate. The site of the platform shows
 * a price before an account exists, and it has to be the same price the server
 * charges, so the arithmetic lives in a module both sides can read.
 */

/** The rate card of the resources, in minor units. */
export interface ResourceRates {
  /** The price of a gigabyte of memory, for a month. */
  ramPerGb: number;
  /** The price of a processor, for a month. */
  cpuPerUnit: number;
  /** The price of a gigabyte of storage, for a month. */
  diskPerGb: number;
  /** The price of the instance itself, whatever it holds, for a month. */
  baseFee: number;
}

/**
 * The rate card of the platform when the operator has not written another
 * one.
 *
 * A bot of half a gigabyte, half a processor and five gigabytes of disk comes
 * to two euros and twelve cents, and a game of four gigabytes, two processors
 * and twenty-five gigabytes of disk comes to eleven euros and twenty-four
 * cents. The same resources cost the same in every product of the platform.
 */
export const DEFAULT_RESOURCE_RATES: ResourceRates = {
  ramPerGb: 200,
  cpuPerUnit: 75,
  diskPerGb: 5,
  baseFee: 49,
};

/** The unit of the memory: 1024 MiB are one gigabyte that is billed. */
export const RAM_UNIT_MB = 1024;

/** The unit of the processor: a vCPU is a hundred parts of a processor. */
export const CPU_UNIT = 100;

/**
 * The common denominator of the price: the product of the two units that are
 * not whole, 1024 MiB of memory and 100 parts of a processor.
 */
export const PRICE_DENOMINATOR = RAM_UNIT_MB * CPU_UNIT;

/**
 * The exact price of a configuration, in the unit of the denominator.
 *
 * Everything is an integer: the memory in MiB, the processor in hundredths,
 * the storage in gigabytes, and the rates in minor units.
 */
export function exactPrice(config: { ram: number; cpu: number; disk: number }, rates: ResourceRates): number {
  const cpuParts = Math.round(config.cpu * CPU_UNIT);
  return (
    rates.baseFee * PRICE_DENOMINATOR +
    config.ram * rates.ramPerGb * CPU_UNIT +
    cpuParts * rates.cpuPerUnit * RAM_UNIT_MB +
    config.disk * rates.diskPerGb * PRICE_DENOMINATOR
  );
}

/**
 * The price of a configuration, in minor units.
 *
 * This is the one place where the price of a server is calculated. Everything
 * else — the catalog, the quote, the order, the upgrade, the dashboard, the
 * invoice — asks this function, so a price is never two different numbers.
 *
 * The price is computed with integers and a common denominator, and it is
 * rounded once, at the end, to the nearest minor unit, with a half rounded up.
 * A price that is computed with floating point and rounded at the end would
 * be off by a cent from time to time, and the customer would be charged a
 * cent that the catalog did not show.
 */
export function priceOfResources(
  config: { ram: number; cpu: number; disk: number },
  rates: ResourceRates = DEFAULT_RESOURCE_RATES,
): number {
  const exact = exactPrice(config, rates);
  // Half of the denominator is a whole number, so the rounding is exact: a
  // price that ends in half a minor unit goes up.
  return Math.floor((exact + PRICE_DENOMINATOR / 2) / PRICE_DENOMINATOR);
}

/** The price of a configuration, broken down into what it is made of. */
export interface ResourceBreakdown {
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
   * The add-ons are chosen by the customer and they are priced once, not once
   * a month, so they are a part of their own in the breakdown.
   */
  options: number;
  /** The price of the configuration, for the period it was priced for. */
  total: number;
}

/**
 * The price of a configuration, broken down into what it is made of.
 *
 * The parts add up to the total: the rounding is done once, on the sum, and the
 * minor unit that is left over goes to the part that lost the most in the
 * rounding. The customer sees a breakdown that adds up.
 */
export function breakdownOfResources(
  config: { ram: number; cpu: number; disk: number },
  rates: ResourceRates = DEFAULT_RESOURCE_RATES,
): ResourceBreakdown {
  const cpuParts = Math.round(config.cpu * CPU_UNIT);
  const parts = [
    { key: 'ram' as const, exact: config.ram * rates.ramPerGb * CPU_UNIT },
    { key: 'cpu' as const, exact: cpuParts * rates.cpuPerUnit * RAM_UNIT_MB },
    { key: 'disk' as const, exact: config.disk * rates.diskPerGb * PRICE_DENOMINATOR },
    { key: 'base' as const, exact: rates.baseFee * PRICE_DENOMINATOR },
  ];

  const total = priceOfResources(config, rates);
  const floors = parts.map((part) => Math.floor(part.exact / PRICE_DENOMINATOR));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);

  // The minor unit that is left over goes to the part that lost the most in
  // the rounding. The order of the parts breaks a tie, so the result is the
  // same every time.
  const order = parts
    .map((part, index) => ({ index, lost: part.exact - floors[index]! * PRICE_DENOMINATOR }))
    .sort((left, right) => right.lost - left.lost || left.index - right.index);

  const breakdown: ResourceBreakdown = { ram: 0, cpu: 0, disk: 0, base: 0, options: 0, total };
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
