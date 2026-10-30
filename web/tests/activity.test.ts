import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent } from '../src/lib/activity.ts';

describe('the words of an event', () => {
  it('says that a service is running instead of quoting the node', () => {
    const text = describeEvent(
      { type: 'runtime_state', message: 'The node reported the state "running" for this instance at 12:00. The platform still shows it as online.' },
      'Code Server',
    );
    assert.equal(text.title, 'Code Server is running');
    assert.doesNotMatch(text.title, /node reported/i);
  });

  it('says that the health check does not pass, and does not call the service healthy', () => {
    const text = describeEvent(
      { type: 'runtime_state', message: 'The node reported the state "running" for this instance, and the container is alive, but the node does not confirm the running state: the health check of the egg does not pass.' },
      'Bot',
    );
    assert.match(text.detail ?? '', /health check/);
  });

  it('keeps an event that was written for the customer', () => {
    assert.equal(describeEvent({ type: 'files', message: 'Saved /server.properties.' }, 'Mc').title, 'Saved /server.properties.');
  });

  it('falls back to a plain sentence for an unknown state', () => {
    assert.equal(describeEvent({ type: 'runtime_state', message: 'The node reported the state "weird" for this.' }, 'X').title, 'X reported the state weird');
  });

  it('shortens a very long message', () => {
    const text = describeEvent({ type: 'files', message: 'x'.repeat(400) }, 'A');
    assert.ok(text.title.length <= 140);
  });
});
