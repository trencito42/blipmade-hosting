/**
 * Writes the rate card of the platform into the settings.
 *
 * The card is one card for every product of a server: the price of a
 * gigabyte of memory, the price of a processor, the price of a gigabyte of
 * disk and the fee of the instance itself. It is written in the settings of
 * the platform and in every row of a server, so the back office and the
 * quotes show the same numbers.
 *
 * The prices the customers already have are not touched: a running instance
 * keeps the price it was sold at, until an operator reconciles them on
 * purpose.
 *
 * Usage, on the host of the platform:
 *
 *     ALLOW_PRODUCTION_SEED=true scripts/set-rate-card.sh 200 75 5 49
 */
import { prisma } from '../api/src/db.js';
import { DEFAULT_RESOURCE_RATES, RESOURCE_RATES_KEY, resourceRates, saveResourceRates } from '../api/src/services/pricing.js';

/** Reads a rate from the arguments. A rate is a whole number of cents. */
function readRate(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`The rate of the ${name} must be a whole number of cents, not "${raw}".`);
  }
  return value;
}

async function main(): Promise<void> {
  const [ramRaw, cpuRaw, diskRaw, feeRaw] = process.argv.slice(2);
  const before = await resourceRates();
  const settingBefore = await prisma.setting.findUnique({ where: { key: RESOURCE_RATES_KEY } });
  const rates = {
    ramPerGb: readRate(ramRaw, 'gigabyte of memory', DEFAULT_RESOURCE_RATES.ramPerGb),
    cpuPerUnit: readRate(cpuRaw, 'processor', DEFAULT_RESOURCE_RATES.cpuPerUnit),
    diskPerGb: readRate(diskRaw, 'gigabyte of disk', DEFAULT_RESOURCE_RATES.diskPerGb),
    baseFee: readRate(feeRaw, 'instance', DEFAULT_RESOURCE_RATES.baseFee),
  };

  const saved = await saveResourceRates(rates);
  const setting = await prisma.setting.findUnique({ where: { key: RESOURCE_RATES_KEY } });
  console.info(`The card of the platform is written in "${RESOURCE_RATES_KEY}": ${JSON.stringify(setting?.value ?? {})}`);
  console.info(
    `Before: ${
      settingBefore
        ? JSON.stringify(settingBefore.value)
        : 'the card was not written, so the default of the platform was in use'
    }`,
  );
  console.info(`The card in use before the write: ${JSON.stringify(before)}`);
  console.info(`After:  ${JSON.stringify(saved)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
