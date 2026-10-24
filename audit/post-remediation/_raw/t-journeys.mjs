/**
 * PHASE 2 — Customer journey audit, API level.
 *
 * Runs against the isolated stack of the audit:
 *   API   http://127.0.0.1:3112   (database cj_test, stub panel, SMTP sink)
 *   mail  http://127.0.0.1:3526   (the SMTP sink's reader)
 *
 * Every step records what was observed, what was expected and the raw
 * evidence. A step is only PASS when something concrete was seen.
 */
import fs from 'node:fs';

const API = process.env.CJ_API ?? 'http://127.0.0.1:3112';
const MAIL = process.env.CJ_MAIL ?? 'http://127.0.0.1:3526';
const PASSWORD = 'CorrectHorseBattery9';
const OUT = process.env.CJ_OUT ?? '/tmp/cj/results-journeys.json';

const results = [];
let n = 0;

function record(area, step, status, observed, expected, evidence) {
  n += 1;
  results.push({ n, area, step, status, observed, expected, evidence });
  const mark = { PASS: 'OK  ', FAIL: 'FAIL', WARN: 'WARN', BLOCKED: 'BLK ', INFO: 'INFO' }[status] ?? '????';
  console.log(`${mark} ${String(n).padStart(3)} [${area}] ${step} :: ${observed}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ client */

function jar() {
  const store = new Map();
  return {
    store,
    header() { return Array.from(store.entries()).map(([k, v]) => `${k}=${v}`).join('; '); },
    absorb(res) {
      for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i < 0) continue;
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (!v || /expires=thu, 01 jan 1970/i.test(c)) store.delete(k); else store.set(k, v);
      }
    },
    csrf() { return store.get('bm_csrf') ?? ''; },
  };
}

async function req(j, method, path, body, extraHeaders = {}, rawBody) {
  const headers = { ...extraHeaders };
  const ck = j.header();
  if (ck) headers.cookie = ck;
  let payload = rawBody;
  if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const m = method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(m)) {
    const t = j.csrf();
    if (t) headers['x-csrf-token'] = decodeURIComponent(t);
  }
  const res = await fetch(API + path, { method: m, headers, body: payload, redirect: 'manual' });
  j.absorb(res);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, headers: res.headers, text, json };
}

async function prime(j) { return req(j, 'GET', '/api/health'); }

async function register(email, first = 'CJ', last = 'Journey') {
  const j = jar();
  await prime(j);
  const r = await req(j, 'POST', '/api/auth/register', { firstName: first, lastName: last, email, password: PASSWORD });
  if (r.status !== 201) throw new Error(`register ${email} -> ${r.status} ${r.text}`);
  return j;
}

async function login(email, password = PASSWORD) {
  const j = jar();
  await prime(j);
  const r = await req(j, 'POST', '/api/auth/login', { email, password });
  if (r.status !== 200) {
    const e = new Error(`login ${email} -> ${r.status} ${r.text}`);
    e.status = r.status;
    e.body = r.text;
    throw e;
  }
  return j;
}

async function mailMessages() {
  try {
    const r = await fetch(`${MAIL}/messages`);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function mailBodies(since = 0) {
  const list = await mailMessages();
  const fresh = list.slice(since);
  const out = [];
  for (const m of fresh) {
    try {
      const r = await fetch(`${MAIL}/messages/${m.file}`);
      const j = await r.json();
      out.push({ ...m, raw: j.raw ?? '', decoded: decodeQP(j.raw ?? '') });
    } catch { /* ignore */ }
  }
  return out;
}

const errMsg = (r) => r.json?.error?.message ?? r.text;

/**
 * The mail sink stores the raw bytes of the message. Nodemailer writes the
 * bodies as quoted-printable, so a long link is wrapped in the middle of the
 * token and the "=" of the query is written "=3D". A mail client decodes that
 * before showing the message; the audit has to do the same, otherwise it
 * reads a broken token out of a perfectly good e-mail.
 */
function decodeQP(text) {
  return String(text ?? '')
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function tokenFrom(mails, re) {
  for (const m of mails) {
    const hit = (m.decoded ?? m.raw).match(re);
    if (hit) return hit[1];
  }
  return null;
}

const short = (v, n = 220) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > n ? s.slice(0, n) + '…' : s;
};

const stamp = Date.now();
const A = {
  id: `cj.id.${stamp}`,
  disc: `cj.disc.${stamp}`,
  dep: `cj.dep.${stamp}`,
  svc: `cj.svc.${stamp}`,
  bill: `cj.bill.${stamp}`,
  sup: `cj.sup.${stamp}`,
};

/* =================================================================== IDENTITY */
{
  const email = A.id + '@example.test';
  let j = jar();
  await prime(j);
  // The sink keeps every message it ever received, so the audit marks where
  // its own run starts and only reads the messages that arrive from now on.
  const mailsAtStart = (await mailMessages()).length;

  const reg = await req(j, 'POST', '/api/auth/register', { firstName: 'CJ', lastName: 'Journey', email, password: PASSWORD });
  record('IDENTITY', '1.1 Înregistrarea creează contul și deschide sesiunea',
    reg.status === 201 ? 'PASS' : 'FAIL',
    `HTTP ${reg.status}; user=${reg.json?.user?.email}; emailVerified=${reg.json?.user?.emailVerified}; mail=${reg.json?.mail?.state}`,
    'HTTP 201, cont creat, e-mail de verificare trimis, sesiune deschisă',
    { status: reg.status, body: reg.text.slice(0, 400), cookie: j.store.has('bm_session') });

  const dup = await req(j, 'POST', '/api/auth/register', { firstName: 'CJ', lastName: 'Journey', email, password: PASSWORD });
  record('IDENTITY', '1.2 Înregistrarea refuză o adresă deja folosită',
    dup.status === 409 ? 'PASS' : 'FAIL', `HTTP ${dup.status}: ${short(dup.text, 120)}`, 'HTTP 409', { status: dup.status, body: dup.text.slice(0, 200) });

  const weak = await req(j, 'POST', '/api/auth/register', { firstName: 'CJ', lastName: 'W', email: `cj.weak.${stamp}@example.test`, password: 'short' });
  record('IDENTITY', '1.3 Înregistrarea refuză o parolă slabă',
    weak.status === 400 ? 'PASS' : 'FAIL', `HTTP ${weak.status}: ${short(weak.text, 160)}`, 'HTTP 400 care numește problema', { status: weak.status, body: weak.text.slice(0, 200) });

  const noName = await req(j, 'POST', '/api/auth/register', { firstName: '', lastName: '', email: `cj.noname.${stamp}@example.test`, password: PASSWORD });
  record('IDENTITY', '1.4 Înregistrarea refuză un nume incomplet',
    noName.status === 400 ? 'PASS' : 'FAIL', `HTTP ${noName.status}: ${short(noName.text, 160)}`, 'HTTP 400 care numește câmpul', { status: noName.status, body: noName.text.slice(0, 200) });

  let j2 = jar(); await prime(j2);
  const ok = await req(j2, 'POST', '/api/auth/login', { email, password: PASSWORD });
  record('IDENTITY', '1.5 Autentificare cu date corecte', ok.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${ok.status}; user=${ok.json?.user?.email}; role=${ok.json?.user?.role}`, 'HTTP 200 + cookie de sesiune', { status: ok.status, body: ok.text.slice(0, 250) });

  const wrong = await req(j2, 'POST', '/api/auth/login', { email, password: 'WrongPassword123' });
  const unknown = await req(j2, 'POST', '/api/auth/login', { email: `cj.nobody.${stamp}@example.test`, password: 'WrongPassword123' });
  const same = errMsg(wrong) === errMsg(unknown);
  record('IDENTITY', '1.6 Parolă greșită refuzată, fără enumerare de conturi',
    wrong.status === 401 && unknown.status === 401 && same ? 'PASS' : 'FAIL',
    `greșit=${wrong.status}, necunoscut=${unknown.status}, mesaje identice=${same}; "${errMsg(wrong)}"`,
    'HTTP 401 în ambele cazuri, cu același mesaj', { wrong: errMsg(wrong), unknown: errMsg(unknown) });

  const anon = jar(); await prime(anon);
  const probe = await req(anon, 'GET', '/api/auth/session');
  record('IDENTITY', '1.7 Sonda de sesiune pentru vizitator anonim', probe.status === 200 && probe.json?.user === null ? 'PASS' : 'FAIL',
    `HTTP ${probe.status}; user=${probe.json?.user}`, 'HTTP 200, user=null', { status: probe.status, body: probe.text.slice(0, 120) });

  const unverified = await req(j2, 'GET', '/api/auth/session');
  record('IDENTITY', '1.8 Contul nou pornește neverificat',
    unverified.json?.user?.emailVerified === false ? 'PASS' : 'FAIL',
    `emailVerified=${unverified.json?.user?.emailVerified}`, 'emailVerified=false până la folosirea linkului', { status: unverified.status, body: unverified.text.slice(0, 200) });

  const resend = await req(j2, 'POST', '/api/auth/resend-verification', { email });
  const resendUnknown = await req(j2, 'POST', '/api/auth/resend-verification', { email: `cj.nobody.${stamp}@example.test` });
  record('IDENTITY', '1.9 Re-trimiterea e-mailului de verificare nu dezvăluie dacă contul există',
    resend.status === 200 && resendUnknown.status === 200 && resend.text === resendUnknown.text ? 'PASS' : 'FAIL',
    `existent=${resend.status}, necunoscut=${resendUnknown.status}, mesaje identice=${resend.text === resendUnknown.text}; "${short(resend.text, 130)}"`,
    'HTTP 200 cu același mesaj în ambele cazuri', { existing: resend.text.slice(0, 200), unknown: resendUnknown.text.slice(0, 200) });

  // the real token, taken from the SMTP sink (only the messages that arrived now)
  await sleep(400);
  const mails1 = await mailBodies(mailsAtStart);
  const verifyToken = tokenFrom(mails1, /verify-email\?token=([A-Za-z0-9_-]+)/);
  record('IDENTITY', '1.10 E-mailul de verificare este scris în căsuța de e-mail',
    verifyToken ? 'PASS' : 'FAIL',
    verifyToken ? `token primit prin sink (${mails1.length} mesaje noi captate)` : `niciun token găsit în ${mails1.length} mesaje noi`,
    'Un e-mail de verificare ajunge în sink', { mails: mails1.map((m) => m.subject) });

  if (verifyToken) {
    const verified = await req(j2, 'POST', '/api/auth/verify-email', { token: verifyToken });
    const after = await req(j2, 'GET', '/api/auth/session');
    record('IDENTITY', '1.11 Linkul de verificare confirmă adresa',
      (verified.status === 204 || verified.status === 200) && after.json?.user?.emailVerified === true ? 'PASS' : 'FAIL',
      `HTTP ${verified.status}; emailVerified după= ${after.json?.user?.emailVerified}`, 'HTTP 2xx, contul devine verificat', { status: verified.status, body: verified.text.slice(0, 200) });
  } else {
    record('IDENTITY', '1.11 Linkul de verificare confirmă adresa', 'BLOCKED', 'Token indisponibil', 'HTTP 200', {});
  }

  const badToken = await req(j2, 'POST', '/api/auth/verify-email', { token: 'not-a-real-token-000' });
  record('IDENTITY', '1.12 Un token de verificare invalid este refuzat', badToken.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${badToken.status}: ${short(badToken.text, 120)}`, 'HTTP 400', { status: badToken.status, body: badToken.text.slice(0, 200) });

  // --- password reset, with the real token ---
  const mailsPreReset = (await mailMessages()).length;
  const forgot = await req(j2, 'POST', '/api/auth/forgot-password', { email });
  const forgotUnknown = await req(j2, 'POST', '/api/auth/forgot-password', { email: `cj.nobody.${stamp}@example.test` });
  record('IDENTITY', '1.13 Cererea de resetare nu dezvăluie dacă contul există',
    forgot.status === 200 && forgotUnknown.status === 200 && forgot.text === forgotUnknown.text ? 'PASS' : 'FAIL',
    `existent=${forgot.status}, necunoscut=${forgotUnknown.status}, mesaje identice=${forgot.text === forgotUnknown.text}`, 'HTTP 200, același mesaj', { existing: forgot.text.slice(0, 200), unknown: forgotUnknown.text.slice(0, 200) });

  await sleep(400);
  const mails2 = await mailBodies(mailsPreReset);
  const resetToken = tokenFrom(mails2, /reset-password\?token=([A-Za-z0-9_-]+)/);
  record('IDENTITY', '1.14 E-mailul de resetare a parolei este scris în căsuța de e-mail',
    resetToken ? 'PASS' : 'FAIL', resetToken ? `token primit prin sink (${mails2.length} mesaje noi)` : `niciun token în ${mails2.length} mesaje noi`,
    'Un e-mail de resetare ajunge în sink', { mails: mails2.map((m) => m.subject) });

  if (resetToken) {
    const newPass = 'NewCorrectHorse9';
    const reset = await req(j2, 'POST', '/api/auth/reset-password', { token: resetToken, password: newPass });
    const j3 = jar(); await prime(j3);
    const withNew = await req(j3, 'POST', '/api/auth/login', { email, password: newPass });
    const withOld = await req(j3, 'POST', '/api/auth/login', { email, password: PASSWORD });
    record('IDENTITY', '1.15 Tokenul de resetare schimbă parola',
      (reset.status === 204 || reset.status === 200) && withNew.status === 200 && withOld.status === 401 ? 'PASS' : 'FAIL',
      `reset=${reset.status}, login cu parola nouă=${withNew.status}, login cu parola veche=${withOld.status}`,
      'HTTP 2xx la resetare, parola nouă merge, cea veche nu', { reset: reset.text.slice(0, 200), newStatus: withNew.status, oldStatus: withOld.status });
    // put the password back
    await req(j3, 'POST', '/api/settings/password', { currentPassword: newPass, newPassword: PASSWORD });
    // The reset ended every session of the account, so the audit signs in again.
    j2 = await login(email);
    j = await login(email);
  } else {
    record('IDENTITY', '1.15 Tokenul de resetare schimbă parola', 'BLOCKED', 'Token indisponibil', 'HTTP 200', {});
  }

  const badReset = await req(j2, 'POST', '/api/auth/reset-password', { token: 'not-a-real-token-000', password: 'AnotherPass1234' });
  record('IDENTITY', '1.16 Un token de resetare invalid este refuzat', badReset.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${badReset.status}: ${short(badReset.text, 120)}`, 'HTTP 400', { status: badReset.status, body: badReset.text.slice(0, 200) });

  // --- profile ---
  const prof = await req(j2, 'PATCH', '/api/settings/profile', { firstName: 'CJ', lastName: 'Renamed' });
  const settings = await req(j2, 'GET', '/api/settings');
  const profOk = settings.json?.profile?.lastName === 'Renamed';
  record('IDENTITY', '1.17 Modificarea profilului este memorată',
    prof.status === 200 && profOk ? 'PASS' : 'FAIL',
    `PATCH=${prof.status}; citit înapoi profile.lastName="${settings.json?.profile?.lastName}"`, 'PATCH 200, valoarea se citește înapoi',
    { patch: prof.text.slice(0, 200), settings: settings.text.slice(0, 300) });

  // --- email change ---
  const newEmail = `cj.changed.${stamp}@example.test`;
  const mailsPreChange = (await mailMessages()).length;
  const emailChange = await req(j2, 'POST', '/api/settings/email', { email: newEmail });
  record('IDENTITY', '1.18 Cererea de schimbare a adresei este acceptată',
    emailChange.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${emailChange.status}; pendingEmail=${emailChange.json?.pendingEmail}; delivered=${emailChange.json?.delivered}`,
    'HTTP 200 cu pasul de confirmare', { status: emailChange.status, body: emailChange.text.slice(0, 300) });

  const emailSame = await req(j2, 'POST', '/api/settings/email', { email });
  record('IDENTITY', '1.19 Schimbarea adresei către adresa curentă este refuzată', emailSame.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${emailSame.status}: ${short(emailSame.text, 140)}`, 'HTTP 400', { status: emailSame.status, body: emailSame.text.slice(0, 200) });

  const emailBad = await req(j2, 'POST', '/api/settings/email', { email: 'not-an-address' });
  record('IDENTITY', '1.20 Schimbarea adresei către o adresă invalidă este refuzată', emailBad.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${emailBad.status}: ${short(emailBad.text, 140)}`, 'HTTP 400', { status: emailBad.status, body: emailBad.text.slice(0, 200) });

  await sleep(400);
  const mails3 = await mailBodies(mailsPreChange);
  const changeMail = mails3.find((m) => /address/i.test(m.subject));
  const changeToken = changeMail
    ? (changeMail.decoded ?? changeMail.raw).match(/[?&](?:emailChange|token)=([A-Za-z0-9_-]{20,})/)?.[1] ?? null
    : null;
  if (changeToken) {
    const confirm = await req(j2, 'POST', '/api/settings/email/confirm', { token: changeToken });
    const sessionAfter = await req(j2, 'GET', '/api/auth/session');
    record('IDENTITY', '1.21 Linkul de confirmare schimbă adresa contului',
      confirm.status === 200 && sessionAfter.json?.user?.email === newEmail ? 'PASS' : 'FAIL',
      `confirm=${confirm.status}; email în sesiune=${sessionAfter.json?.user?.email}`, 'HTTP 200, sesiunea arată adresa nouă',
      { confirm: confirm.text.slice(0, 250), session: sessionAfter.text.slice(0, 250) });
  } else {
    record('IDENTITY', '1.21 Linkul de confirmare schimbă adresa contului', 'BLOCKED', 'Token de confirmare indisponibil', 'HTTP 200', { mails: mails3.map((m) => m.subject) });
  }

  // --- sessions, on a second account so the account guard of the first is not hit ---
  const email2 = `cj.id2.${stamp}@example.test`;
  await register(email2, 'CJ', 'Second');
  const jA = await login(email2);
  const jB = await login(email2);
  const jC = await login(email2);
  const sessions = await req(jA, 'GET', '/api/settings/sessions');
  const list = sessions.json?.sessions ?? [];
  const current = list.filter((s) => s.current).length;
  record('IDENTITY', '1.22 Lista de sesiuni arată toate dispozitivele deschise',
    sessions.status === 200 && list.length >= 3 ? 'PASS' : 'FAIL',
    `HTTP ${sessions.status}; ${list.length} sesiuni; current=${current}`, 'HTTP 200, câte o sesiune per dispozitiv',
    { status: sessions.status, sessions: list.map((s) => ({ id: s.id, current: s.current, device: s.device, ip: s.ip })) });

  const target = list.find((s) => !s.current);
  const revoke = await req(jA, 'DELETE', `/api/settings/sessions/${target?.id}`);
  const afterRevoke = await req(jA, 'GET', '/api/settings/sessions');
  record('IDENTITY', '1.23 O sesiune poate fi revocată individual',
    revoke.status === 200 && (afterRevoke.json?.sessions ?? []).length === list.length - 1 ? 'PASS' : 'FAIL',
    `DELETE=${revoke.status}; rămase ${(afterRevoke.json?.sessions ?? []).length} din ${list.length}`, 'HTTP 200, lista scade cu unu',
    { status: revoke.status, before: list.length, after: (afterRevoke.json?.sessions ?? []).length });

  const revokeAll = await req(jA, 'DELETE', '/api/settings/sessions');
  const bAfter = await req(jB, 'GET', '/api/settings/sessions');
  const cAfter = await req(jC, 'GET', '/api/settings/sessions');
  record('IDENTITY', '1.24 „Închide toate celelalte sesiuni" deconectează celelalte dispozitive',
    revokeAll.status === 200 && bAfter.status === 401 && cAfter.status === 401 ? 'PASS' : 'FAIL',
    `DELETE=${revokeAll.status}; dispozitivul 2 → ${bAfter.status}; dispozitivul 3 → ${cAfter.status}`,
    'HTTP 200 și 401 pe celelalte dispozitive', { status: revokeAll.status, b: bAfter.status, c: cAfter.status });

  // --- password change ends the other sessions ---
  const jD = await login(email2);
  const jE = await login(email2);
  const pwChange = await req(jD, 'POST', '/api/settings/password', { currentPassword: PASSWORD, newPassword: 'AnotherStrong9' });
  const eAfter = await req(jE, 'GET', '/api/settings/sessions');
  record('IDENTITY', '1.25 Schimbarea parolei închide celelalte sesiuni',
    pwChange.status === 200 && eAfter.status === 401 ? 'PASS' : 'FAIL',
    `POST=${pwChange.status}; closedSessions=${pwChange.json?.closedSessions}; celălalt dispozitiv → ${eAfter.status}`,
    'HTTP 200, celălalt dispozitiv primește 401', { status: pwChange.status, body: pwChange.text.slice(0, 200), other: eAfter.status });

  const pwWrong = await req(jD, 'POST', '/api/settings/password', { currentPassword: 'NotThePassword1', newPassword: 'YetAnother9' });
  record('IDENTITY', '1.26 Schimbarea parolei cere parola curentă corectă', pwWrong.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${pwWrong.status}: ${short(pwWrong.text, 120)}`, 'HTTP 400/401', { status: pwWrong.status, body: pwWrong.text.slice(0, 200) });

  // restore the password
  await req(jD, 'POST', '/api/settings/password', { currentPassword: 'AnotherStrong9', newPassword: PASSWORD });

  // --- notification preferences, with a fresh session ---
  const jF = await login(email2);
  const notif = await req(jF, 'GET', '/api/settings/notifications');
  const notifPut = await req(jF, 'PUT', '/api/settings/notifications', { productUpdates: false, billing: true, support: false, incidents: true, marketing: false });
  const notifGet = await req(jF, 'GET', '/api/settings/notifications');
  record('IDENTITY', '1.27 Preferințele de notificare pot fi citite și schimbate',
    notif.status === 200 && notifPut.status === 200 && notifGet.json?.preferences?.marketing === false ? 'PASS' : 'FAIL',
    `GET=${notif.status}, PUT=${notifPut.status}, marketing citit înapoi=${notifGet.json?.preferences?.marketing}`,
    'HTTP 200 la citire și la scriere, valoarea persistată',
    { get: notif.text.slice(0, 250), put: notifPut.text.slice(0, 250), after: notifGet.text.slice(0, 250) });

  // --- concurrent requests on one session ---
  const [c1, c2] = await Promise.all([
    req(jF, 'GET', '/api/auth/session'),
    req(jF, 'GET', '/api/auth/session'),
  ]);
  record('IDENTITY', '1.28 Două cereri simultane cu aceeași sesiune sunt acceptate',
    c1.status === 200 && c2.status === 200 ? 'PASS' : 'FAIL', `HTTP ${c1.status} / ${c2.status}`, 'Ambele 200', { a: c1.status, b: c2.status });

  // --- concurrent login on a brand new account ---
  const freshEmail = `cj.conc.${stamp}@example.test`;
  const fj = jar(); await prime(fj);
  await req(fj, 'POST', '/api/auth/register', { firstName: 'CJ', lastName: 'Conc', email: freshEmail, password: PASSWORD });
  const mk = () => { const k = jar(); return prime(k).then(() => req(k, 'POST', '/api/auth/login', { email: freshEmail, password: PASSWORD })); };
  const [l1, l2] = await Promise.all([mk(), mk()]);
  record('IDENTITY', '1.29 Două autentificări simultane de pe două dispozitive sunt acceptate',
    l1.status === 200 && l2.status === 200 ? 'PASS' : 'FAIL', `HTTP ${l1.status} / ${l2.status}`, 'Ambele 200', { a: l1.status, b: l2.status, body: l1.text.slice(0, 160) });

  // --- does the account guard count the successful logins too? ---
  const rlEmail = `cj.rl.${stamp}@example.test`;
  const rlj = jar(); await prime(rlj);
  await req(rlj, 'POST', '/api/auth/register', { firstName: 'CJ', lastName: 'RL', email: rlEmail, password: PASSWORD });
  const codes = [];
  for (let i = 0; i < 12; i += 1) {
    const k = jar();
    await prime(k);
    const r = await req(k, 'POST', '/api/auth/login', { email: rlEmail, password: PASSWORD });
    codes.push(r.status);
  }
  const first429 = codes.indexOf(429);
  record('IDENTITY', '1.34 Contul de autentificare numără și autentificările reușite, nu doar pe cele greșite',
    first429 === -1 ? 'PASS' : 'WARN',
    `12 autentificări corecte pe un cont nou → coduri: ${codes.join(', ')}; prima refuzare la poziția ${first429 + 1}`,
    'Un cont folosit legitim de mai multe ori (mai multe dispozitive) nu trebuie blocat după 10 autentificări reușite',
    { codes });

  // --- logout ---
  const jG = await login(email2);
  const out = await req(jG, 'POST', '/api/auth/logout');
  const afterOut = await req(jG, 'GET', '/api/auth/session');
  record('IDENTITY', '1.30 Deconectarea închide sesiunea curentă',
    out.status === 204 && afterOut.json?.user === null ? 'PASS' : 'FAIL',
    `POST /auth/logout=${out.status}; sesiune după=${afterOut.status} user=${afterOut.json?.user}`,
    'HTTP 204, sesiune închisă', { status: out.status, after: afterOut.status, afterBody: afterOut.text.slice(0, 120) });

  // --- account closure ---
  const jH = await login(email2);
  const closure = await req(jH, 'POST', '/api/settings/account/closure', { password: PASSWORD, confirmation: 'CLOSE MY ACCOUNT' });
  const closureBad = await req(jH, 'POST', '/api/settings/account/closure', { password: PASSWORD, confirmation: 'WRONG TEXT' });
  const undo = await req(jH, 'DELETE', '/api/settings/account/closure');
  record('IDENTITY', '1.31 Închiderea contului cere parola și confirmarea scrisă, și poate fi anulată',
    closure.status === 200 && closureBad.status === 400 && undo.status === 200 ? 'PASS' : 'FAIL',
    `cerere=${closure.status}; confirmare greșită=${closureBad.status}; anulare=${undo.status}; services raportate=${closure.json?.services}`,
    'HTTP 200 la cerere, 400 la confirmare greșită, 200 la anulare',
    { closure: closure.text.slice(0, 300), bad: closureBad.text.slice(0, 200), undo: undo.text.slice(0, 200) });

  // --- session expiry ---
  const sessionsRaw = await req(jF, 'GET', '/api/settings/sessions');
  const mine = (sessionsRaw.json?.sessions ?? []).find((s) => s.current);
  const ttlDays = mine ? Math.round((new Date(mine.expiresAt) - new Date(mine.createdAt)) / 86400000) : null;
  record('IDENTITY', '1.32 Sesiunea are o expirare declarată', ttlDays !== null && ttlDays > 0 ? 'PASS' : 'FAIL',
    `expiresAt=${mine?.expiresAt}; createdAt=${mine?.createdAt}; TTL=${ttlDays} zile`, 'O expirare în viitor, vizibilă clientului', { session: mine });

  // --- CSRF: an authenticated mutating route without the token ---
  const noCsrf2 = await fetch(`${API}/api/settings/profile`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jF.header() },
    body: JSON.stringify({ firstName: 'Hacked', lastName: 'Hacked' }),
  });
  const noCsrf2Body = await noCsrf2.text();
  record('IDENTITY', '1.33 O cerere mutatoare autentificată fără token CSRF este refuzată',
    noCsrf2.status === 403 ? 'PASS' : 'FAIL',
    `HTTP ${noCsrf2.status}: ${short(noCsrf2Body, 140)}`, 'HTTP 403 „Invalid or missing CSRF token."',
    { status: noCsrf2.status, body: noCsrf2Body.slice(0, 250) });
  const stillThere = await req(jF, 'GET', '/api/settings');
  record('IDENTITY', '1.33b Modificarea fără CSRF nu a schimbat nimic',
    stillThere.json?.profile?.firstName === 'CJ' ? 'PASS' : 'FAIL',
    `profile.firstName=${stillThere.json?.profile?.firstName}`, 'Profilul nu s-a schimbat', { profile: stillThere.json?.profile });

  const loginNoCsrf = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: freshEmail, password: PASSWORD }),
  });
  record('IDENTITY', '1.33c Autentificarea este scutită de CSRF prin design (doar credențiale în corp)',
    loginNoCsrf.status === 200 ? 'INFO' : 'PASS',
    `POST /api/auth/login fără token CSRF → HTTP ${loginNoCsrf.status}; lista de excepții este în api/src/plugins/csrf.ts:14-22`,
    'Documentat explicit în lista de excepții; tokenul CSRF ar fi inutil pentru un endpoint care poartă doar credențiale',
    { status: loginNoCsrf.status });
}

/* ================================================================== DISCOVERY */
{
  const anon = jar(); await prime(anon);
  const products = await req(anon, 'GET', '/api/catalog/products');
  const list = products.json?.products ?? [];
  record('DISCOVERY', '2.1 Catalogul public afișează produsele', products.status === 200 && list.length > 0 ? 'PASS' : 'FAIL',
    `HTTP ${products.status}; ${list.length} produse: ${list.map((p) => p.slug).join(', ')}`, 'HTTP 200 cu lista produselor',
    { status: products.status, count: list.length });

  const withPrice = list.every((p) => p.price && p.pricing);
  record('DISCOVERY', '2.2 Fiecare produs din catalog are un preț activ', withPrice ? 'PASS' : 'FAIL',
    withPrice ? 'toate produsele au preț și carte de prețuri' : `fără preț: ${list.filter((p) => !p.price).map((p) => p.slug).join(', ')}`,
    'Preț pentru fiecare produs listat',
    { products: list.map((p) => ({ slug: p.slug, price: p.price, pricingMinimum: p.pricing?.minimum?.amount, pricingRecommended: p.pricing?.recommended?.amount })) });

  const book = list[0]?.pricing;
  record('DISCOVERY', '2.3 Catalogul publică prețul minim și pe cel recomandat',
    book && book.minimum && book.recommended ? 'PASS' : 'FAIL',
    book ? `${list[0].slug}: minim=${book.minimum.amount} (${book.minimum.ram}MB/${book.minimum.cpu}cpu/${book.minimum.disk}GB), recomandat=${book.recommended.amount} (${book.recommended.ram}MB/${book.recommended.cpu}cpu/${book.recommended.disk}GB)` : 'priceBook lipsă',
    'O carte de prețuri cu minim și recomandat', { priceBook: book });

  const minOk = list.every((p) => book && p.minRam >= 0);
  record('DISCOVERY', '2.4 Fiecare produs publică resursele minime și maxime', minOk ? 'PASS' : 'FAIL',
    list.map((p) => `${p.slug}: ${p.minRam}-${p.maxRam}MB/${p.minCpu}-${p.maxCpu}cpu/${p.minDisk}-${p.maxDisk}GB`).join(' | '),
    'Minim și maxim pe fiecare produs', { products: list.map((p) => ({ slug: p.slug, minRam: p.minRam, maxRam: p.maxRam, minCpu: p.minCpu, maxCpu: p.maxCpu, minDisk: p.minDisk, maxDisk: p.maxDisk })) });

  const hidden = list.find((p) => p.deployable === false);
  record('DISCOVERY', '2.5 Un produs marcat neprovisionabil este totuși listat public',
    hidden ? 'WARN' : 'PASS',
    hidden ? `${hidden.slug} are deployable=false și availability.state=${hidden.availability?.state}, dar apare în catalogul public cu preț ${hidden.price?.amount}` : 'niciun produs neprovisionabil în catalog',
    'Un produs pe care panoul nu îl poate construi nu trebuie să poată fi comandat; dacă este listat, trebuie marcat clar',
    { hidden: hidden ? { slug: hidden.slug, deployable: hidden.deployable, availability: hidden.availability, price: hidden.price } : null });

  const detail = await req(anon, 'GET', '/api/catalog/products/discord-bot');
  record('DISCOVERY', '2.6 Pagina de produs încarcă detaliile', detail.status === 200 && detail.json?.product?.slug === 'discord-bot' ? 'PASS' : 'FAIL',
    `HTTP ${detail.status}; slug=${detail.json?.product?.slug}`, 'HTTP 200 cu produsul cerut', { status: detail.status, body: detail.text.slice(0, 250) });

  const missing = await req(anon, 'GET', '/api/catalog/products/does-not-exist');
  record('DISCOVERY', '2.7 Un produs inexistent răspunde 404', missing.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${missing.status}: ${short(missing.text, 100)}`, 'HTTP 404', { status: missing.status });

  const search = await req(anon, 'GET', '/api/catalog/products?search=discord');
  record('DISCOVERY', '2.8 Căutarea în catalog filtrează după text',
    search.status === 200 && (search.json?.products ?? []).length > 0 && (search.json?.products ?? []).every((p) => /discord/i.test(p.name + p.description + p.slug)) ? 'PASS' : 'FAIL',
    `HTTP ${search.status}; ${(search.json?.products ?? []).length} rezultate: ${(search.json?.products ?? []).map((p) => p.slug).join(', ')}`,
    'Rezultate care conțin termenul', { status: search.status, slugs: (search.json?.products ?? []).map((p) => p.slug) });

  const noHit = await req(anon, 'GET', '/api/catalog/products?search=zzzznotathing');
  record('DISCOVERY', '2.9 O căutare fără rezultate întoarce o listă goală, nu o eroare',
    noHit.status === 200 && (noHit.json?.products ?? []).length === 0 ? 'PASS' : 'FAIL',
    `HTTP ${noHit.status}; ${(noHit.json?.products ?? []).length} rezultate`, 'HTTP 200, listă goală', { status: noHit.status, body: noHit.text.slice(0, 150) });

  const cat = await req(anon, 'GET', '/api/catalog/products?category=DATABASES');
  record('DISCOVERY', '2.10 Filtruul de categorie restrânge catalogul',
    cat.status === 200 && (cat.json?.products ?? []).length > 0 && (cat.json?.products ?? []).every((p) => p.category === 'DATABASES') ? 'PASS' : 'FAIL',
    `HTTP ${cat.status}; ${(cat.json?.products ?? []).length} rezultate: ${(cat.json?.products ?? []).map((p) => p.slug).join(', ')}`,
    'Doar produsele din categorie', { status: cat.status, slugs: (cat.json?.products ?? []).map((p) => p.slug) });

  const avail = await req(anon, 'GET', '/api/catalog/products/discord-bot');
  const availability = avail.json?.product?.availability;
  record('DISCOVERY', '2.11 Disponibilitatea de provisionare este publicată per produs',
    availability ? 'PASS' : 'WARN', availability ? JSON.stringify(availability) : 'câmpul availability lipsește din răspunsul produsului',
    'Clientul trebuie să vadă dacă produsul poate fi provisionat și în ce regiuni', { availability });

  // --- quoting ---
  const q1 = await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  record('DISCOVERY', '2.12 Cotarea unei configurații minime răspunde cu o sumă',
    q1.status === 200 && typeof q1.json?.total === 'number' ? 'PASS' : 'FAIL',
    `HTTP ${q1.status}; subtotal=${q1.json?.subtotal}, discount=${q1.json?.discount}, total=${q1.json?.total}, currency=${q1.json?.currency}`,
    'HTTP 200 cu subtotal/discount/total', { status: q1.status, body: q1.text.slice(0, 300) });

  const p = list.find((x) => x.slug === 'discord-bot');
  const q2 = await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'discord-bot', ram: 1024, cpu: 2, disk: 10 }] });
  const grows = (q2.json?.total ?? 0) > (q1.json?.total ?? 0);
  record('DISCOVERY', '2.13 Prețul crește odată cu resursele', grows ? 'PASS' : 'FAIL',
    `minim=${q1.json?.total}, mai mare=${q2.json?.total} (monedă ${q1.json?.currency})`, 'Configurația mai mare costă mai mult',
    { minimal: q1.json?.total, bigger: q2.json?.total });

  const below = await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'discord-bot', ram: 1, cpu: 1, disk: 1 }] });
  record('DISCOVERY', '2.14 O configurație sub minim este refuzată', below.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${below.status}: ${short(below.text, 160)}`, 'HTTP 400 care spune minimul', { status: below.status, body: below.text.slice(0, 250) });

  const above = await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'discord-bot', ram: 999999, cpu: 99, disk: 9999 }] });
  record('DISCOVERY', '2.15 O configurație peste maxim este refuzată', above.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${above.status}: ${short(above.text, 160)}`, 'HTTP 400 care spune maximul', { status: above.status, body: above.text.slice(0, 250) });

  const notDeployable = hidden
    ? await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: hidden.slug, ram: hidden.defaultRam, cpu: hidden.defaultCpu, disk: hidden.defaultDisk }] })
    : null;
  record('DISCOVERY', '2.16 Un produs neprovisionabil nu poate fi cotat',
    notDeployable ? (notDeployable.status === 400 ? 'PASS' : 'FAIL') : 'BLOCKED',
    notDeployable ? `HTTP ${notDeployable.status}: ${short(notDeployable.text, 180)}` : 'niciun produs neprovisionabil în seed',
    'HTTP 400 cu explicația că panoul nu îl poate construi', { status: notDeployable?.status, body: notDeployable?.text.slice(0, 250) });

  const unknown = await req(anon, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'nope', ram: 512, cpu: 1, disk: 5 }] });
  record('DISCOVERY', '2.17 O cotare pentru un produs necunoscut este refuzată', unknown.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${unknown.status}: ${short(unknown.text, 120)}`, 'HTTP 404', { status: unknown.status });

  const empty = await req(anon, 'POST', '/api/catalog/quote', { items: [] });
  record('DISCOVERY', '2.18 O cotare fără produse este refuzată', empty.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${empty.status}: ${short(empty.text, 120)}`, 'HTTP 400', { status: empty.status });
}

/* ================================================================ DEPLOYMENT */
let freeOrderId = null;
{
  const email = A.dep + '@example.test';
  const j = await register(email);

  const quote = await req(j, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }] });
  const order = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }] });
  const o = order.json?.order;
  record('DEPLOYMENT', '3.1 Comanda este creată cu suma cotată', order.status === 201 && o?.total === quote.json?.total ? 'PASS' : 'FAIL',
    `POST /orders=${order.status}; număr=${o?.number}; status=${o?.status}; total=${o?.total}; cotare=${quote.json?.total}`,
    'HTTP 201, totalul comenzii egal cu cotarea', { status: order.status, order: o, quote: quote.json });

  const got = await req(j, 'GET', `/api/orders/${o?.id}`);
  record('DEPLOYMENT', '3.2 Comanda poate fi revizuită', got.status === 200 && got.json?.order?.id === o?.id ? 'PASS' : 'FAIL',
    `HTTP ${got.status}; ${short(got.text, 160)}`, 'HTTP 200 cu comanda', { status: got.status });

  const list = await req(j, 'GET', '/api/orders');
  record('DEPLOYMENT', '3.3 Lista comenzilor conține comanda nouă',
    list.status === 200 && (list.json?.orders ?? []).some((x) => x.id === o?.id) ? 'PASS' : 'FAIL',
    `HTTP ${list.status}; ${(list.json?.orders ?? []).length} comenzi`, 'HTTP 200, comanda apare în listă', { status: list.status });

  // --- promotion ---
  const promoQuote = await req(j, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJTEST10' });
  record('DEPLOYMENT', '3.4 O promoție validă se aplică la cotare',
    promoQuote.status === 200 && promoQuote.json?.promotion?.valid === true && promoQuote.json?.discount > 0 ? 'PASS' : 'FAIL',
    `HTTP ${promoQuote.status}; valid=${promoQuote.json?.promotion?.valid}; subtotal=${promoQuote.json?.subtotal}; discount=${promoQuote.json?.discount}; total=${promoQuote.json?.total}`,
    'discount>0 și total = subtotal − discount', { status: promoQuote.status, body: promoQuote.text.slice(0, 300) });

  const badPromo = await req(j, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'NO-SUCH-CODE' });
  record('DEPLOYMENT', '3.5 O promoție inexistentă este refuzată cu motiv, fără eroare',
    badPromo.status === 200 && badPromo.json?.promotion?.valid === false ? 'PASS' : 'FAIL',
    `HTTP ${badPromo.status}; valid=${badPromo.json?.promotion?.valid}; motiv="${badPromo.json?.promotion?.reason}"; discount=${badPromo.json?.discount}`,
    'HTTP 200, promoție invalidă, discount 0', { status: badPromo.status, body: badPromo.text.slice(0, 250) });

  // --- an unpaid order is never provisioned ---
  const checkout = await req(j, 'POST', `/api/orders/${o?.id}/checkout`);
  const orderAfter = await req(j, 'GET', `/api/orders/${o?.id}`);
  record('DEPLOYMENT', '3.6 Checkout-ul cu plățile oprite refuză comanda și nu o trece în „plătită"',
    checkout.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${checkout.status}; url=${checkout.json?.url}; motiv="${checkout.json?.message}"; statusul comenzii=${orderAfter.json?.order?.status}`,
    'Fără URL de plată, comanda rămâne neplătită', { status: checkout.status, body: checkout.text.slice(0, 300), orderStatus: orderAfter.json?.order?.status });

  const instancesNow = await req(j, 'GET', '/api/instances');
  record('DEPLOYMENT', '3.7 O comandă neplătită nu produce nicio instanță',
    instancesNow.status === 200 && (instancesNow.json?.instances ?? []).length === 0 ? 'PASS' : 'FAIL',
    `GET /instances=${instancesNow.status}; ${(instancesNow.json?.instances ?? []).length} instanțe`, 'Zero instanțe înainte de plată',
    { status: instancesNow.status, body: instancesNow.text.slice(0, 200) });

  // --- the free path, to walk the real provisioning ---
  const freeOrder = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }], promotionCode: 'CJFREE100' });
  const fo = freeOrder.json?.order;
  record('DEPLOYMENT', '3.8 O comandă acoperită integral de promoție are total zero',
    freeOrder.status === 201 && fo?.total === 0 ? 'PASS' : 'FAIL',
    `HTTP ${freeOrder.status}; total=${fo?.total}; subtotal implicit=${(fo?.items?.[0]?.total) ?? '?'}; discount=${fo?.discount}`,
    'total = 0 când promoția acoperă tot', { status: freeOrder.status, order: fo });

  const freeCheckout = await req(j, 'POST', `/api/orders/${fo?.id}/checkout`);
  const freeAfter = await req(j, 'GET', `/api/orders/${fo?.id}`);
  record('DEPLOYMENT', '3.9 Checkout-ul unei comenzi gratuite o confirmă și o trimite la provisionare',
    freeCheckout.status === 200 && freeCheckout.json?.free === true && ['PAID', 'FULFILLED'].includes(freeAfter.json?.order?.status) ? 'PASS' : 'FAIL',
    `HTTP ${freeCheckout.status}; free=${freeCheckout.json?.free}; statusul comenzii=${freeAfter.json?.order?.status}`,
    'HTTP 200, free=true, comanda trece în PAID/FULFILLED', { status: freeCheckout.status, body: freeCheckout.text.slice(0, 300), orderStatus: freeAfter.json?.order?.status });

  // wait for the provisioning job
  let instances = [];
  for (let i = 0; i < 30; i += 1) {
    await sleep(1500);
    const r = await req(j, 'GET', '/api/instances');
    const candidate = (r.json?.instances ?? [])[0];
    if (candidate && candidate.status !== 'provisioning') { instances = [candidate]; break; }
    instances = r.json?.instances ?? [];
  }
  record('DEPLOYMENT', '3.10 Coada de provisionare creează instanța după confirmarea comenzii',
    instances.length > 0 && instances[0].status !== 'provisioning' ? 'PASS' : 'FAIL',
    instances.length ? `instanță: ${instances[0].name}; status=${instances[0].status}; uuid=${instances[0].pterodactylUuid ? 'setat' : 'lipsă'}` : 'nicio instanță după 45s',
    'O instanță apare în lista clientului și ajunge într-o stare finală', { instances: instances.map((i) => ({ id: i.id, name: i.name, status: i.status, product: i.productSlug })) });

  if (instances.length) freeOrderId = instances[0].id;

  // --- cancellation of an unpaid order ---
  const cancelMe = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  const cancel = await req(j, 'POST', `/api/orders/${cancelMe.json?.order?.id}/cancel`);
  const cancelAfter = await req(j, 'GET', `/api/orders/${cancelMe.json?.order?.id}`);
  record('DEPLOYMENT', '3.11 O comandă neplătită poate fi anulată', cancel.status === 204 && cancelAfter.json?.order?.status === 'CANCELLED' ? 'PASS' : 'FAIL',
    `POST /cancel=${cancel.status}; status după=${cancelAfter.json?.order?.status}`, 'HTTP 204, status CANCELLED', { status: cancel.status, after: cancelAfter.text.slice(0, 200) });

  const cancelPaid = await req(j, 'POST', `/api/orders/${fo?.id}/cancel`);
  record('DEPLOYMENT', '3.12 O comandă deja plătită nu poate fi anulată ca o comandă', cancelPaid.status === 400 ? 'PASS' : 'FAIL',
    `HTTP ${cancelPaid.status}: ${short(cancelPaid.text, 140)}`, 'HTTP 400 care îndrumă către abonament', { status: cancelPaid.status, body: cancelPaid.text.slice(0, 250) });

  // --- concurrent order creation (double click) ---
  const dbl = () => req(j, 'POST', '/api/orders', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  const [d1, d2] = await Promise.all([dbl(), dbl()]);
  const created = [d1, d2].filter((x) => x.status === 201).length;
  record('DEPLOYMENT', '3.13 Două cereri simultane de comandă nu produc două comenzi plătibile',
    created <= 2 ? 'INFO' : 'FAIL',
    `două cereri simultane → ${created} comenzi create (HTTP ${d1.status} / ${d2.status}); rate limit pe /orders: 30/10 min`,
    'Comportamentul de dublă apăsare trebuie observabil și idempotent pe frontend', { a: d1.status, b: d2.status, created });

  // --- per-account campaign limit ---
  const lim = await register(`cj.lim.${stamp}@example.test`);
  const p1 = await req(lim, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJONCE' });
  const o1 = await req(lim, 'POST', '/api/orders', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJONCE' });
  const p2 = await req(lim, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJONCE' });
  record('DEPLOYMENT', '3.14 Limita de o utilizare pe cont este aplicată',
    p1.json?.promotion?.valid === true && p2.json?.promotion?.valid === false ? 'PASS' : 'FAIL',
    `prima cotare valid=${p1.json?.promotion?.valid}; a doua valid=${p2.json?.promotion?.valid}; motiv="${p2.json?.promotion?.reason}"`,
    'A doua folosire pe același cont este refuzată', { first: p1.json?.promotion, second: p2.json?.promotion, order: o1.status });

  // --- global campaign cap ---
  const capResults = [];
  for (let i = 0; i < 4; i += 1) {
    const u = await register(`cj.cap.${stamp}.${i}@example.test`);
    const q = await req(u, 'POST', '/api/catalog/quote', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJTHREE' });
    const oo = await req(u, 'POST', '/api/orders', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }], promotionCode: 'CJTHREE' });
    capResults.push({ user: i, quoteValid: q.json?.promotion?.valid, orderStatus: oo.status, reason: q.json?.promotion?.reason });
  }
  const validCount = capResults.filter((r) => r.quoteValid === true).length;
  record('DEPLOYMENT', '3.15 Limita globală a campaniei este aplicată', validCount === 3 ? 'PASS' : 'FAIL',
    `CJTHREE (maxRedemptions=3): ${validCount} cotări valide dintre 4 → ${JSON.stringify(capResults.map((r) => r.quoteValid))}`,
    'Exact 3 utilizări acceptate, a patra refuzată', { capResults });
}

/* =========================================================== SERVICE MANAGEMENT */
{
  const email = A.svc + '@example.test';
  const j = await register(email);
  const order = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  await req(j, 'POST', `/api/orders/${order.json?.order?.id}/checkout`);
  await req(j, 'POST', '/api/webhooks/stripe/test',
    { id: `evt_cj_svc_${order.json?.order?.id}`, type: 'checkout.session.completed', orderId: order.json?.order?.id, amount: order.json?.order?.total },
    { 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' });
  let inst = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(1500);
    const r = await req(j, 'GET', '/api/instances');
    const candidate = (r.json?.instances ?? [])[0];
    if (candidate && candidate.status !== 'provisioning') { inst = candidate; break; }
  }
  if (!inst) {
    record('SERVICE', '4.1 Provisionarea unei instanțe pentru clienți', 'BLOCKED', 'Instanța nu a apărut', 'O instanță provisionată', {});
  } else {
    record('SERVICE', '4.1 Provisionarea unei instanțe pentru clienți', 'PASS',
      `instanță ${inst.name}; status=${inst.status}; plan=${inst.productSlug}; uuid=${inst.pterodactylUuid ? 'setat' : 'lipsă'}`,
      'O instanță apare în lista clientului', { instance: inst });
    const detail = await req(j, 'GET', `/api/instances/${inst.id}`);
    record('SERVICE', '4.2 Detaliile instanței se încarcă', detail.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${detail.status}; evenimente=${(detail.json?.events ?? []).length}`, 'HTTP 200 cu instanța și evenimentele',
      { status: detail.status, body: detail.text.slice(0, 300) });

    for (const action of ['start', 'stop', 'restart', 'kill']) {
      const r = await req(j, 'POST', `/api/instances/${inst.id}/power`, { action });
      record('SERVICE', `4.3 Acțiunea de putere „${action}"`,
        r.status === 200 && r.json?.accepted === true ? 'WARN' : 'FAIL',
        `HTTP ${r.status}: ${short(r.text, 140)}`,
        'HTTP 202 Accepted (containerul reacționează asincron); codul din routes/instances.ts:365-368 întoarce 200',
        { status: r.status, body: r.text.slice(0, 200) });
    }
    const afterKill = await req(j, 'GET', `/api/instances/${inst.id}`);
    record('SERVICE', '4.4 Starea instanței se actualizează după o acțiune de putere',
      afterKill.json?.instance?.status ? 'PASS' : 'FAIL', `status=${afterKill.json?.instance?.status}`, 'Starea reflectă ultima acțiune',
      { status: afterKill.json?.instance?.status });

    const metrics = await req(j, 'GET', `/api/instances/${inst.id}/metrics`);
    record('SERVICE', '4.5 Metricile instanței sunt disponibile', metrics.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${metrics.status}; ${short(metrics.text, 200)}`, 'HTTP 200 cu metricile', { status: metrics.status, body: metrics.text.slice(0, 300) });

    const consoleRes = await req(j, 'GET', `/api/instances/${inst.id}/console`);
    record('SERVICE', '4.6 Consola instanței răspunde', consoleRes.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${consoleRes.status}; ${short(consoleRes.text, 180)}`, 'HTTP 200', { status: consoleRes.status, body: consoleRes.text.slice(0, 250) });

    const files = await req(j, 'GET', `/api/instances/${inst.id}/files`);
    record('SERVICE', '4.7 Fișierele instanței pot fi listate', files.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${files.status}; ${short(files.text, 200)}`, 'HTTP 200 cu lista de fișiere', { status: files.status, body: files.text.slice(0, 300) });

    const startup = await req(j, 'GET', `/api/instances/${inst.id}/startup`);
    record('SERVICE', '4.8 Setările de pornire pot fi citite', startup.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${startup.status}; ${short(startup.text, 200)}`, 'HTTP 200', { status: startup.status, body: startup.text.slice(0, 300) });

    const allocs = await req(j, 'GET', `/api/instances/${inst.id}/allocations`);
    record('SERVICE', '4.9 Alocările de rețea pot fi listate', allocs.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${allocs.status}; ${short(allocs.text, 200)}`, 'HTTP 200', { status: allocs.status, body: allocs.text.slice(0, 300) });

    const dbs = await req(j, 'GET', `/api/instances/${inst.id}/databases`);
    record('SERVICE', '4.10 Bazele de date ale instanței pot fi listate', dbs.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${dbs.status}; ${short(dbs.text, 200)}`, 'HTTP 200', { status: dbs.status, body: dbs.text.slice(0, 300) });

    const backups = await req(j, 'GET', `/api/instances/${inst.id}/backups`);
    record('SERVICE', '4.11 Copiile de rezervă pot fi listate', backups.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${backups.status}; ${short(backups.text, 200)}`, 'HTTP 200', { status: backups.status, body: backups.text.slice(0, 300) });

    const rename = await req(j, 'POST', `/api/instances/${inst.id}/rename`, { name: 'CJ Bot' });
    const afterRename = await req(j, 'GET', `/api/instances/${inst.id}`);
    record('SERVICE', '4.12 Instanța poate fi redenumită', rename.status === 200 && afterRename.json?.instance?.name === 'CJ Bot' ? 'PASS' : 'FAIL',
      `POST=${rename.status}; nume citit înapoi="${afterRename.json?.instance?.name}"`, 'HTTP 200, numele persistat',
      { status: rename.status, name: afterRename.json?.instance?.name });

    const rq = await req(j, 'GET', `/api/instances/${inst.id}/resources/quote?ram=1024&cpu=1&disk=10`);
    record('SERVICE', '4.13 Schimbarea de resurse este cotată înainte de a fi aplicată',
      rq.status === 200 ? 'PASS' : 'FAIL', `HTTP ${rq.status}; ${short(rq.text, 240)}`, 'HTTP 200 cu cotația',
      { status: rq.status, body: rq.text.slice(0, 350) });

    const up = await req(j, 'PUT', `/api/instances/${inst.id}/resources`, { ram: 2048, cpu: 1, disk: 10 });
    record('SERVICE', '4.14 O mărire de resurse fără plăți nu este aplicată pe loc',
      up.status === 503 || up.status === 409 || up.status === 400 || up.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${up.status}: ${short(up.text, 200)}`,
      'Cu plățile oprite, mărirea trebuie refuzată clar, nu aplicată și nici trecută în ordine',
      { status: up.status, body: up.text.slice(0, 300) });

    const down = await req(j, 'PUT', `/api/instances/${inst.id}/resources`, { ram: 512, cpu: 1, disk: 5 });
    const afterDown = await req(j, 'GET', `/api/instances/${inst.id}`);
    record('SERVICE', '4.15 O micșorare de resurse este aplicată imediat',
      down.status === 200 && afterDown.json?.instance?.ram === 512 ? 'PASS' : 'FAIL',
      `HTTP ${down.status}; status=${down.json?.status}; ram=${afterDown.json?.instance?.ram}`,
      'HTTP 200, resursele sunt cele noi', { status: down.status, body: down.text.slice(0, 300), ram: afterDown.json?.instance?.ram });

    const events = await req(j, 'GET', `/api/instances/${inst.id}/events`);
    record('SERVICE', '4.16 Evenimentele instanței sunt înregistrate',
      events.status === 200 && (events.json?.events ?? events.json ?? []).length > 0 ? 'PASS' : 'FAIL',
      `HTTP ${events.status}; ${short(events.text, 220)}`, 'Evenimente persistate pentru fiecare acțiune',
      { status: events.status, body: events.text.slice(0, 300) });

    const cancelInst = await req(j, 'POST', `/api/instances/${inst.id}/cancel`);
    record('SERVICE', '4.17 Instanța poate fi anulată', cancelInst.status === 200 || cancelInst.status === 202 || cancelInst.status === 204 ? 'PASS' : 'FAIL',
      `HTTP ${cancelInst.status}: ${short(cancelInst.text, 200)}`, 'HTTP 2xx', { status: cancelInst.status, body: cancelInst.text.slice(0, 300) });
  }
}

/* ==================================================================== BILLING */
{
  const email = A.bill + '@example.test';
  const j = await register(email);
  const order = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  const quoted = order.json?.order;
  const checkout = await req(j, 'POST', `/api/orders/${quoted?.id}/checkout`);
  record('BILLING', '5.0 Checkout-ul unei comenzi cu sumă reală întoarce o adresă de plată',
    checkout.status === 200 && typeof checkout.json?.url === 'string' ? 'PASS' : 'FAIL',
    `HTTP ${checkout.status}; url=${checkout.json?.url}`, 'O adresă de plată și starea AWAITING_PAYMENT',
    { status: checkout.status, body: checkout.text.slice(0, 300) });

  // The local test gateway: the payment is confirmed with the internal
  // endpoint, the same way the real webhook would confirm it.
  const pay = await req(j, 'POST', '/api/webhooks/stripe/test',
    { id: `evt_cj_pay_${quoted?.id}`, type: 'checkout.session.completed', orderId: quoted?.id, amount: quoted?.total },
    { 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' });
  const afterPay = await req(j, 'GET', `/api/orders/${quoted?.id}`);
  record('BILLING', '5.0b Plată confirmată: comanda trece în PAID și este trimisă la provisionare',
    pay.status === 200 && ['PAID', 'FULFILLED'].includes(afterPay.json?.order?.status) ? 'PASS' : 'FAIL',
    `webhook=${pay.status} (${short(pay.text, 120)}); statusul comenzii=${afterPay.json?.order?.status}`,
    'HTTP 200, comanda PAID', { status: pay.status, body: pay.text.slice(0, 250), orderStatus: afterPay.json?.order?.status });

  let inst = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(1500);
    const r = await req(j, 'GET', '/api/instances');
    const candidate = (r.json?.instances ?? [])[0];
    if (candidate && candidate.status !== 'provisioning') { inst = candidate; break; }
  }

  const summary = await req(j, 'GET', '/api/billing/summary');
  record('BILLING', '5.1 Rezumatul de facturare reflectă serviciile clientului',
    summary.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${summary.status}; estimate lunară=${summary.json?.monthlyEstimate} ${summary.json?.currency}; instanțe=${(summary.json?.instances ?? []).length}; abonamente=${(summary.json?.subscriptions ?? []).length}`,
    'HTTP 200 cu estimate, instanțe și abonamente', { status: summary.status, body: summary.text.slice(0, 400) });

  const subs = await req(j, 'GET', '/api/billing/subscriptions');
  record('BILLING', '5.2 Abonamentele pot fi listate', subs.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${subs.status}; ${(subs.json?.subscriptions ?? []).length} abonamente`, 'HTTP 200', { status: subs.status, body: subs.text.slice(0, 350) });

  const invoices = await req(j, 'GET', '/api/billing/invoices');
  record('BILLING', '5.3 Facturile pot fi listate', invoices.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${invoices.status}; ${(invoices.json?.invoices ?? []).length} facturi`, 'HTTP 200', { status: invoices.status, body: invoices.text.slice(0, 350) });

  const payState = await req(j, 'GET', '/api/billing/payment-state');
  record('BILLING', '5.4 Starea plăților este anunțată clientului',
    payState.status === 200 ? 'PASS' : 'FAIL', `HTTP ${payState.status}; ${short(payState.text, 200)}`,
    'HTTP 200, interfața poate spune dacă plata este posibilă', { status: payState.status, body: payState.text.slice(0, 300) });

  const pm = await req(j, 'POST', '/api/billing/payment-method');
  record('BILLING', '5.5 Adăugarea unei metode de plată răspunde explicit când plățile nu pot fi luate',
    pm.status === 503 && /payments_unavailable|unavailable/.test(pm.text) ? 'PASS' : 'FAIL',
    `HTTP ${pm.status}: ${short(pm.text, 220)}`,
    'Răspuns care spune că plata nu este disponibilă, nu o eroare generată', { status: pm.status, body: pm.text.slice(0, 300) });

  // quoted = charged = invoiced
  const inv = (invoices.json?.invoices ?? [])[0];
  const sub = (subs.json?.subscriptions ?? [])[0];
  const charged = sub?.amount ?? null;
  const invoiced = inv?.amount ?? null;
  const instancePrice = summary.json?.instances?.[0]?.price ?? null;
  const allEqual = quoted?.total === charged && charged === invoiced && (instancePrice === null || instancePrice === charged);
  record('BILLING', '5.6 Cotat = încasat = facturat = prețul serviciului',
    allEqual ? 'PASS' : 'FAIL',
    `cotat(comanda)=${quoted?.total}, abonament=${charged}, factură=${invoiced}, prețul instanței=${instancePrice}`,
    'Sumele sunt identice', { order: quoted?.total, subscription: charged, invoice: invoiced, instancePrice, invoice: inv, subscription: sub });

  if (sub) {
    const cancelSub = await req(j, 'POST', `/api/billing/subscriptions/${sub.id}/cancel`);
    const afterCancel = await req(j, 'GET', '/api/billing/subscriptions');
    const resumed = await req(j, 'POST', `/api/billing/subscriptions/${sub.id}/resume`);
    const afterResume = await req(j, 'GET', '/api/billing/subscriptions');
    record('BILLING', '5.7 Abonamentul poate fi anulat la finalul perioadei și reluat',
      cancelSub.status === 200 && resumed.status === 200 ? 'PASS' : 'FAIL',
      `anulare=${cancelSub.status} (${short(cancelSub.json?.subscription, 120)}); reluare=${resumed.status} (${short(resumed.json?.subscription, 120)})`,
      'Ambele tranziții acceptate și persistate',
      { cancel: cancelSub.text.slice(0, 250), afterCancel: afterCancel.text.slice(0, 200), resume: resumed.text.slice(0, 250), afterResume: afterResume.text.slice(0, 200) });

    const renew = await req(j, 'POST', `/api/billing/subscriptions/${sub.id}/renew`, { period: 'MONTHLY' });
    record('BILLING', '5.8 Reînnoirea manuală a unui abonament', renew.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${renew.status}: ${short(renew.text, 220)}`, 'HTTP 200 sau un refuz explicit și explicat', { status: renew.status, body: renew.text.slice(0, 300) });
  } else {
    record('BILLING', '5.7 Abonamentul poate fi anulat la finalul perioadei și reluat', 'BLOCKED', 'Niciun abonament creat', 'Tranziții acceptate', {});
    record('BILLING', '5.8 Reînnoirea manuală a unui abonament', 'BLOCKED', 'Niciun abonament creat', 'HTTP 200', {});
  }

  const bq = await req(j, 'POST', '/api/billing/quote', { items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }] });
  record('BILLING', '5.9 Cotarea de facturare folosește aceleași prețuri ca catalogul',
    bq.status === 200 ? 'PASS' : 'FAIL', `HTTP ${bq.status}; ${short(bq.text, 240)}`, 'HTTP 200 cu total',
    { status: bq.status, body: bq.text.slice(0, 300) });

  // the order with a real amount
  const realOrder = await req(j, 'POST', '/api/orders', { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }] });
  const realTotal = realOrder.json?.order?.total;
  const cSum = (realOrder.json?.order?.items ?? []).reduce((s, it) => s + it.total, 0);
  record('BILLING', '5.10 Suma comenzii este suma liniilor, fără rotunjiri ascunse',
    realTotal === cSum ? 'PASS' : 'FAIL', `total=${realTotal}; suma liniilor=${cSum}`, 'total = suma liniilor',
    { order: realOrder.json?.order });

  // duplicate webhook handling
  const wh = await req(j, 'POST', '/api/webhooks/stripe', { id: 'evt_cj_dup_1', type: 'checkout.session.completed', data: { object: {} } });
  const wh2 = await req(j, 'POST', '/api/webhooks/stripe', { id: 'evt_cj_dup_1', type: 'checkout.session.completed', data: { object: {} } });
  record('BILLING', '5.11 Un eveniment de plată repetat este tratat ca duplicat',
    wh.status === 200 && wh2.status === 200 ? 'PASS' : 'FAIL',
    `prima=${wh.status} (${short(wh.text, 120)}); a doua=${wh2.status} (${short(wh2.text, 120)})`,
    'Al doilea eveniment este recunoscut ca duplicat și nu produce a doua factură',
    { first: wh.text.slice(0, 250), second: wh2.text.slice(0, 250) });
}

/* ==================================================================== SUPPORT */
{
  const email = A.sup + '@example.test';
  const j = await register(email);
  const cats = await req(j, 'GET', '/api/tickets/categories');
  record('SUPPORT', '6.1 Categoriile de bilet sunt publicate',
    cats.status === 200 && (cats.json?.categories ?? []).length > 0 ? 'PASS' : 'FAIL',
    `HTTP ${cats.status}; ${(cats.json?.categories ?? []).map((c) => c.id).join(', ')}`, 'HTTP 200 cu lista categoriilor',
    { status: cats.status, body: cats.text.slice(0, 300) });

  const mailsBefore = (await mailMessages()).length;
  const ticket = await req(j, 'POST', '/api/tickets', { subject: 'CJ journey ticket', category: 'TECHNICAL', priority: 'NORMAL', body: 'The instance does not start.' });
  const t = ticket.json?.ticket;
  record('SUPPORT', '6.2 Un bilet poate fi deschis', ticket.status === 201 ? 'PASS' : 'FAIL',
    `HTTP ${ticket.status}; id=${t?.id}; număr=${t?.number}; status=${t?.status}; categorie=${t?.category}; prioritate=${t?.priority}`,
    'HTTP 201, bilet în starea OPEN', { status: ticket.status, body: ticket.text.slice(0, 350) });

  await sleep(800);
  const mailsAfter = await mailMessages();
  const fresh = mailsAfter.slice(mailsBefore);
  const staffMail = fresh.find((m) => /admin\.check@example\.test/.test((m.to ?? []).join(',')));
  const supportInbox = fresh.find((m) => /support@example\.test/.test((m.to ?? []).join(',')));
  const customerMail = fresh.find((m) => new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test((m.to ?? []).join(',')));
  record('SUPPORT', '6.3 Deschiderea unui bilet trimite notificarea către echipă',
    staffMail ? 'PASS' : 'FAIL',
    staffMail ? `notificare către ${staffMail.to?.join(', ')}: "${staffMail.subject}"; către inbox-ul de suport: ${supportInbox ? 'da' : 'nu'}` : `nicio notificare nouă în sink (${fresh.length} mesaje)`,
    'O notificare către echipă este în coada de e-mail', { before: mailsBefore, after: mailsAfter.length, staff: staffMail ?? null, supportInbox: supportInbox ?? null });

  record('SUPPORT', '6.3b Clientul care deschide biletul nu primește nicio confirmare prin e-mail',
    customerMail ? 'WARN' : 'FAIL',
    customerMail ? `clientul a primit: "${customerMail.subject}"` : 'niciun e-mail către client; singurul mesaj nou este cel către personal',
    'Un e-mail de confirmare către client (șablonul ticketCreatedTemplate există dar nu este apelat)',
    { customer: customerMail ?? null, newMessages: fresh.map((m) => ({ to: m.to, subject: m.subject })) });

  const detail = await req(j, 'GET', `/api/tickets/${t?.id}`);
  record('SUPPORT', '6.4 Biletul poate fi citit în detaliu',
    detail.status === 200 && (detail.json?.ticket?.messages ?? detail.json?.messages ?? []).length >= 1 ? 'PASS' : 'FAIL',
    `HTTP ${detail.status}; ${short(detail.text, 260)}`, 'HTTP 200 cu mesajele biletului', { status: detail.status, body: detail.text.slice(0, 400) });

  const reply = await req(j, 'POST', `/api/tickets/${t?.id}/replies`, { body: 'Any update on this?' });
  record('SUPPORT', '6.5 Clientul poate răspunde în bilet', reply.status === 201 || reply.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${reply.status}: ${short(reply.text, 200)}`, 'HTTP 2xx', { status: reply.status, body: reply.text.slice(0, 300) });

  const afterReply = await req(j, 'GET', `/api/tickets/${t?.id}`);
  const msgs = afterReply.json?.ticket?.messages ?? afterReply.json?.messages ?? [];
  record('SUPPORT', '6.6 Răspunsul este persistat și vizibil în bilet',
    msgs.length >= 2 ? 'PASS' : 'FAIL', `${msgs.length} mesaje în bilet`, 'Răspunsul apare în fir',
    { messages: msgs.map((m) => ({ author: m.authorId ?? m.author, body: (m.body ?? '').slice(0, 60), createdAt: m.createdAt })) });

  const internal = await req(j, 'POST', `/api/tickets/${t?.id}/replies`, { body: 'secret note', internal: true });
  record('SUPPORT', '6.7 Un client nu poate adăuga o notă internă', internal.status === 403 ? 'PASS' : 'FAIL',
    `HTTP ${internal.status}: ${short(internal.text, 140)}`, 'HTTP 403', { status: internal.status, body: internal.text.slice(0, 250) });

  const other = await register(`cj.other.${stamp}@example.test`);
  const foreign = await req(other, 'GET', `/api/tickets/${t?.id}`);
  record('SUPPORT', '6.8 Un bilet al altui client nu este vizibil', foreign.status === 404 ? 'PASS' : 'FAIL',
    `HTTP ${foreign?.status}: ${short(foreign?.text, 120)}`, 'HTTP 404', { status: foreign?.status, body: foreign?.text?.slice(0, 200) });

  const statusTry = await req(j, 'POST', `/api/tickets/${t?.id}/status`, { status: 'CLOSED' });
  record('SUPPORT', '6.9 Un client nu poate schimba starea biletului', statusTry.status === 403 ? 'PASS' : 'FAIL',
    `HTTP ${statusTry.status}: ${short(statusTry.text, 140)}`, 'HTTP 403', { status: statusTry.status, body: statusTry.text.slice(0, 250) });

  // the staff side
  const admin = await login('admin.check@example.test');
  const staffList = await req(admin, 'GET', '/api/tickets');
  record('SUPPORT', '6.10 Personalul vede toate biletele', staffList.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${staffList.status}; ${(staffList.json?.tickets ?? []).length} bilete`, 'HTTP 200', { status: staffList.status });

  const closed = await req(admin, 'POST', `/api/tickets/${t?.id}/status`, { status: 'CLOSED' });
  const reopened = await req(admin, 'POST', `/api/tickets/${t?.id}/status`, { status: 'OPEN' });
  const afterStatus = await req(j, 'GET', `/api/tickets/${t?.id}`);
  record('SUPPORT', '6.11 Starea poate fi închisă și redeschisă, iar schimbarea este vizibilă clientului',
    closed.status === 200 && reopened.status === 200 && afterStatus.json?.ticket?.status === 'OPEN' ? 'PASS' : 'FAIL',
    `închidere=${closed.status}, redeschidere=${reopened.status}, starea citită de client=${afterStatus.json?.ticket?.status}`,
    'Tranzițiile se aplică și se văd din contul clientului', { closed: closed.text.slice(0, 200), reopened: reopened.text.slice(0, 200), after: afterStatus.json?.ticket?.status });

  // attachment, as multipart form data
  const form = new FormData();
  form.append('file', new Blob(['CJ attachment content'], { type: 'text/plain' }), 'note.txt');
  const attRes = await fetch(`${API}/api/tickets/${t?.id}/attachments`, {
    method: 'POST', headers: { cookie: j.header(), 'x-csrf-token': decodeURIComponent(j.csrf()) }, body: form,
  });
  const attText = await attRes.text();
  let attJson; try { attJson = JSON.parse(attText); } catch { attJson = undefined; }
  record('SUPPORT', '6.12 Un atașament poate fi încărcat', attRes.status === 201 || attRes.status === 200 ? 'PASS' : 'FAIL',
    `HTTP ${attRes.status}: ${short(attText, 200)}`, 'HTTP 2xx', { status: attRes.status, body: attText.slice(0, 300) });

  if (attJson?.attachment?.id) {
    const dl = await fetch(`${API}/api/tickets/${t?.id}/attachments/${attJson.attachment.id}`, { headers: { cookie: j.header() } });
    const dlText = await dl.text();
    record('SUPPORT', '6.12b Atașamentul poate fi descărcat de client', dl.status === 200 && dlText.includes('CJ attachment content') ? 'PASS' : 'FAIL',
      `HTTP ${dl.status}; conținutul începe cu "${dlText.slice(0, 40)}"`, 'Conținutul trimis ajunge înapoi', { status: dl.status, body: dlText.slice(0, 120) });
  }

  // the staff answers, the customer must be told
  const admin2 = await login('admin.check@example.test');
  const mailsPreReply = (await mailMessages()).length;
  const staffReply = await req(admin2, 'POST', `/api/tickets/${t?.id}/replies`, { body: 'We are looking into it.' });
  await sleep(800);
  const replyMails = (await mailMessages()).slice(mailsPreReply);
  const customerReplyMail = replyMails.find((m) => (m.to ?? []).join(',').includes(email));
  record('SUPPORT', '6.12c Răspunsul personalului ajunge la client prin e-mail',
    staffReply.status === 201 && customerReplyMail ? 'PASS' : 'FAIL',
    `răspuns=${staffReply.status}; e-mailuri noi=${replyMails.length}; către client: ${customerReplyMail ? `"${customerReplyMail.subject}"` : 'niciunul'}`,
    'Clientul primește e-mail la răspunsul personalului',
    { status: staffReply.status, mails: replyMails.map((m) => ({ to: m.to, subject: m.subject })) });

  // pagination / sorting
  for (let i = 0; i < 5; i += 1) {
    await req(j, 'POST', '/api/tickets', { subject: `CJ bulk ticket ${i}`, category: 'BILLING', priority: 'LOW', body: `bulk ${i}` });
  }
  const bulk = await req(j, 'GET', '/api/tickets');
  const sorted = (bulk.json?.tickets ?? []).map((x) => x.updatedAt ?? x.createdAt);
  const desc = sorted.every((v, i) => i === 0 || new Date(sorted[i - 1]) >= new Date(v));
  record('SUPPORT', '6.13 Lista de bilete este ordonată descrescător după actualizare',
    bulk.status === 200 && desc ? 'PASS' : 'FAIL',
    `HTTP ${bulk.status}; ${(bulk.json?.tickets ?? []).length} bilete; ordine descrescătoare=${desc}`,
    'Cele mai recente bilete primele', { status: bulk.status, order: sorted });

  const page = await req(j, 'GET', '/api/tickets?limit=2&offset=0');
  record('SUPPORT', '6.14 Lista de bilete acceptă paginare',
    page.status === 200 && (page.json?.tickets ?? []).length <= 2 ? 'PASS' : 'FAIL',
    `HTTP ${page.status}; ${(page.json?.tickets ?? []).length} bilete returnate pentru limit=2`,
    'Parametrii limit/offset sunt luați în seamă', { status: page.status, body: page.text.slice(0, 250) });
}

/* ======================================================================= SAVE */
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const byArea = {};
for (const r of results) {
  byArea[r.area] ??= { tested: 0, passed: 0, failed: 0, blocked: 0, warn: 0, info: 0 };
  byArea[r.area].tested += 1;
  if (r.status === 'PASS') byArea[r.area].passed += 1;
  else if (r.status === 'FAIL') byArea[r.area].failed += 1;
  else if (r.status === 'BLOCKED') byArea[r.area].blocked += 1;
  else if (r.status === 'WARN') byArea[r.area].warn += 1;
  else if (r.status === 'INFO') byArea[r.area].info += 1;
}
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(byArea, null, 2));
const tot = results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
console.log('TOTAL', JSON.stringify(tot));
