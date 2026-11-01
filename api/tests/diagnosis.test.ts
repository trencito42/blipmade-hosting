import { describe, expect, it } from 'vitest';
import { diagnose, redact } from '../src/services/diagnosis.js';

describe('diagnosis', () => {
  it('names the usual causes in plain words', () => {
    expect(diagnose('[ServerMain] You need to agree to the EULA in order to run the server.', 'minecraft-paper').map((f) => f.id)).toContain('eula');
    expect(diagnose('You need to agree to the EULA', 'nodejs')).toEqual([]);
    expect(diagnose('java.lang.OutOfMemoryError: Java heap space').map((f) => f.id)).toContain('oom');
    expect(diagnose('Error: listen EADDRINUSE: address already in use :::3000').map((f) => f.id)).toContain('port-in-use');
    expect(diagnose("Error: Cannot find module 'express'").map((f) => f.id)).toContain('node-module');
    expect(diagnose('all is well')).toEqual([]);
  });
  it('removes secrets before a ticket leaves', () => {
    const text = 'DATABASE_URL=postgres://user:hunter2@db:5432/x\nDISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.abcdef.ghijklmnopqrstuvwxyz123456\nAuthorization: Bearer abc.def.ghi-jkl-123456\npassword: "s3cr3t value"\nlistening on :3000';
    const out = redact(text);
    for (const secret of ['hunter2', 'MTIzNDU2Nzg5', 's3cr3t', 'abc.def.ghi']) expect(out).not.toContain(secret);
    expect(out).toContain('listening on :3000');
  });
});
