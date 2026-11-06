import { describe, expect, it } from 'vitest';
import { deploymentAvailability } from '../src/services/availability.js';

const bot = {
  name: 'Discord bot',
  slug: 'discord-bot',
  deployable: true,
  eggId: 15,
  eggName: 'nodejs',
  visible: true,
  fulfilment: 'SERVER' as const,
};

describe('checkout closed', () => {
  it('marks a ready product as not orderable', () => {
    const open = deploymentAvailability(bot, { paymentsAvailable: true });
    expect(open.orderable).toBe(true);
    expect(open.state).toBe('DEPLOYABLE');

    const closed = deploymentAvailability(bot, { paymentsAvailable: false });
    expect(closed.orderable).toBe(false);
    expect(closed.state).toBe('TEMPORARILY_UNAVAILABLE');
    expect(closed.blockers.join(' ')).toMatch(/Checkout is paused/);
  });

  it('does not hide a coming-soon reason behind the pause', () => {
    const closed = deploymentAvailability(
      { ...bot, deployable: false },
      { paymentsAvailable: false },
    );
    expect(closed.state).toBe('COMING_SOON');
    expect(closed.blockers.join(' ')).not.toMatch(/Checkout is paused/);
  });
});
