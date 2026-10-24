#!/usr/bin/env python3
"""Reconciles the remediation state file and the register with the work that
was actually done and verified.

The state of a finding is only raised when there is evidence for it: a test
that passes, a run that was observed, or a command whose output is quoted.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
STATE_PATH = ROOT / "audit/_tools/remediation-status.json"
REGISTER_PATH = ROOT / "audit/12-FULL-FINDINGS-REGISTER.md"

state = json.loads(STATE_PATH.read_text(encoding="utf-8"))

UPDATES = {
    "BE-20": {
        "status": "FIXED & VERIFIED",
        "area": "api/src/services/dead-letter.ts",
        "rootCause": "Repunerea pe coada era refuzata pentru coada de e-mail, pentru ca mesajele nu se trimit la fel",
        "fix": "putBackOnQueue accepta acum si coada blipmade.email: mesajul este scos din jobul esuat si pus inapoi pe coada cu enqueueEmail; numarul de incercati se reseteaza la inceputul rularii, iar esecul ramane deschis, cu starea requeued",
        "commit": "97479ee (in main prin c861ea6)",
        "test": "api/tests/email-dead-letter-requeue.test.ts",
        "verification": "3 teste: mesajul ajunge inapoi pe coada, evidenta ramane consistenta, iar o esec repus nu se pierde",
    },
    "SEC-18": {
        "status": "FIXED & VERIFIED",
        "area": "api/src/lib/mailer.ts",
        "rootCause": "Mesajele scrise pe disc erau lizibile de oricine (0644) si se acumulau fara nicio limita, pentru ca transportul de fisiere nu avea o retentie",
        "fix": "Directorul de e-mail este 0700, fiecare fisier este scris cu 0600, iar transportul are o retentie: cel mult 500 de fisiere si cel mult 72 de ore, cu MAIL_FILE_MAX_FILES si MAIL_FILE_MAX_AGE_HOURS. Un fisier al unui mesaj care asteapta in coada nu este eliminat niciodata, iar un fisier eliminat este marcat in tabelul livrarilor ca nementinut",
        "commit": "97479ee (in main prin c861ea6)",
        "test": "api/tests/mail-file-transport.test.ts",
        "verification": "8 teste: fisierele sunt doar pentru contul serviciului, numarul lor este limitat, cele vechi sunt eliminate, un mesaj in asteptare nu este eliminat, iar tabelul livrarilor spune ce a facut transportul",
    },
    "INF-07": {
        "status": "FIXED & VERIFIED",
        "area": "scripts/backup-offsite.sh",
        "rootCause": "Scriptul folosea rclone, care nu este instalat pe gazda, deci nu ar fi rulat",
        "fix": "Transportul se deduce din forma tintei si poate fi rclone, ssh sau un director montat; rclone este necesar doar pentru o tinta rclone. Scriptul ruleaza pe aceasta gazda si cere numele setarilor care lipsesc",
        "commit": "5dbfa94 (in main)",
        "test": "scripts/backup-offsite.sh rulat pe gazda",
        "verification": "Fara tinta, scriptul se opreste cu codul 3 si numele setarilor de care are nevoie; cu --allow-no-target se opreste cu codul 0",
    },
    "INF-02": {
        "status": "BLOCKED: EXTERNAL DEPENDENCY",
        "area": "scripts/backup.sh, scripts/backup-offsite.sh, scripts/backup-common.sh, scripts/backup-alert.sh, scripts/systemd/blipmade-backup.service",
        "rootCause": "Nu exista o copie a datelor in afara hostului",
        "fix": "Lantul de backup nu mai poate declara succes cand nu paraseste hostul: fara tinta, rularea esueaza cu codul 3 si numele setarilor de care are nevoie. Upload-urile clientilor sunt in ambele arhive, baza este dumpata o singura data, iar unitatea apeleaza o alarma la esec. Destinatia, cheia de criptare si decizia raman ale operatorului",
        "commit": "5dbfa94 (in main)",
        "test": "scripts/restore-drill.sh, rulat pe gazda",
        "verification": "Arhiva contine database.dump, config.tar.gz si uploads.tar.gz; drillul compara 33 de tabele, 4 utilizatori, 5 produse si 14 migratii si verifica ca upload-urile si configuratia sunt in arhiva si se pot citi",
    },
    "DR-02": {
        "status": "FIXED & VERIFIED",
        "area": "scripts/systemd/blipmade-backup.{service,timer}, scripts/install-backup-timer.sh, scripts/restore-drill.sh, scripts/backup-common.sh",
        "rootCause": "Timerul exista in repository de doua runde, dar nu era instalat pe gazda: programarea nu rula",
        "fix": "Timerul si unitatea au fost instalate in /etc/systemd/system, activate cu systemctl enable, si o rulare a produs arhiva cu checksum. Drillul verifica acum intreaga arhiva, nu doar baza: si upload-urile si configuratia trebuie sa fie in ea si sa se poata citi",
        "commit": "5dbfa94 (in main, pentru drill si lantul de backup)",
        "test": "scripts/restore-drill.sh, rulat pe gazda",
        "verification": "Drillul a trecut: 33 de tabele, 4 utilizatori, 5 produse si 14 migratii identice, uploads.tar.gz si config.tar.gz prezente si citibile, baza temporara eliminata la final",
    },
}

changed = []
for key, value in UPDATES.items():
    if key in state and state[key].get("status") == value["status"] and state[key].get("commit") == value["commit"]:
        continue
    state[key] = value
    changed.append(key)

STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"the state file changed for: {', '.join(changed) if changed else 'nothing'}")

# The gate table of the register keeps its colours: the blockers of code were
# removed, but the conditions of operation are still open. The note below the
# table says exactly what changed and what is left.
register = REGISTER_PATH.read_text(encoding="utf-8")

NOTE_MARKER = "<!-- LANSA-RE-DUPĂ-REPARATURI -->"
NOTE = """
<!-- LANSA-RE-DUPĂ-REPARATURI -->

**Notă după lansarea din 24 octombrie 2026 (a doua versiune, `5dbfa94`).** Culoarea porților nu s-a
schimbat, dar două dintre blocajele de cod au fost eliminate și unul a fost adăugat:

| Poartă | Ce s-a schimbat | Ce lipsește |
|---:|---|---|
| 5 | Blocajul era lipsa template-ului de mediu al egg-ului 15: **fiecare** provisionare eșua cu „No environment template is known for egg 15". Template-ul există acum pe panou (serverul 16) și codul platformei îl rezolvă: 11 variabile, fără variabile per-server scurse | O provisionare completă, observată: **20 de rulări** comandă → plată → provisionare → activare. Necesită cheile Stripe live, pe care operatorul nu le-a dat |
| 7 | Idem. Produsul vândut (`discord-bot`) are acum runtime-ul de mediu | Un container care rulează efectiv, verificat **de pe nod**, și un panou care raportează o stare, nu `None`. La momentul acestei note panoul raportează `state: None` pentru serverul 16 |
| 12 | Paginile legale există și sunt legate în footer; resetul de parolă nu mai promite o livrare care nu se poate face; retenția transportului de e-mail pe fișiere există (500 de fișiere, 72 de ore, `0600`) | Livrarea e-mailului: `SMTP_URL` real, un e-mail de verificare și unul de resetare **livrate**. Calea SMTP a fost dovedită funcțională pe o copie izolată, dar releul nu e configurat |
| 9 | Lanțul de backup nu mai poate declara succes când nu paraseste gazda: fără țintă, rularea eșuează (cod 3); upload-urile sunt în arhivă; alarma la eșec există | `OFFSITE_TARGET` + cheia de criptare, o copie în afara gazdei și un drill pe acea copie. **Rămâne RED** |
| 8 | Retenția pe transportul de e-mail a fost făcută | Rotirea parolei de panou a clientului, reducerea conturilor `root_admin` |

Dintre cele 13 porți, **5 rămân RED** (5, 7, 9, 12, 13). Conform regulii brief-ului, o singură poartă
RED blochează lansarea. Toate cele cinci au acum o cauză **de operare**, nu de cod, și fiecare are
condiția de inversare în `07-release-gates.md` §3.
"""

if NOTE_MARKER not in register:
    anchor = "\n**Cinci porți RED.**"
    if anchor in register:
        register = register.replace(anchor, NOTE + anchor, 1)
    else:
        register = register.replace("\n<!-- REMEDIATION:START -->", NOTE + "\n<!-- REMEDIATION:START -->", 1)
    REGISTER_PATH.write_text(register, encoding="utf-8")
    print("the note about the gates was added to the register")
else:
    print("the note about the gates is already there")
