import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presentUsage } from '../src/lib/runtime-view.ts';

test('a stopped container does not keep its last processor and memory readings, and keeps disk', () => {
  const view = presentUsage({ state: 'offline', memoryBytes: 800_000_000, cpuPercent: 40, diskBytes: 5000, readable: true });
  assert.equal(view.power, 'stopped');
  assert.equal(view.memoryBytes, null);
  assert.equal(view.cpuPercent, null);
  assert.equal(view.diskBytes, 5000);
});

test('an unreadable node is unknown, not zero', () => {
  const view = presentUsage({ state: 'running', memoryBytes: 0, cpuPercent: 0, diskBytes: 0, readable: false });
  assert.equal(view.power, 'unknown');
  assert.equal(view.memoryBytes, null);
  assert.equal(view.diskBytes, null);
});

test('a running container shows the reading it was given', () => {
  const view = presentUsage({ state: 'running', memoryBytes: 1000, cpuPercent: 2, diskBytes: 9, readable: true });
  assert.equal(view.power, 'running');
  assert.equal(view.memoryBytes, 1000);
});
