# Retestul fluxurilor pe ramura candidat

Dovezile retestului de fluxuri, rulat pe stiva izolată construită **din ramura
`integration/release-candidate-1`** (`fea5363`), pe baza de test
`blipmade_rc1_e2e_test`, cu baza 8 de Redis și porturile 30040 (web) și 3111
(API). Producția nu a fost atinsă.

`journey.txt` — rezumatul, cu statusul fiecărei rute.
`journey.json` — aceleași date, în format de mașină.
`*.png` — capturile fiecărei pagini.

## Ce a fost verificat

- toate cele 15 rute răspund `HTTP 200` și rămân pe ruta cerută;
- autentificarea de client și de administrator merge;
- în tabelele de administrare, numărul de coloane din antet e același cu al
  coloanelor din prima linie de date, lățimile se potrivesc, nu e necesară
  derularea orizontală și nu apare starea goală;
- pagina de produs arată butonul de deploy pentru un produs care poate fi
  deployat.

## Cele două erori de consolă și cererile eșuate

Cele două erori de consolă de pe fiecare rută și cererile eșuate sunt
aceleași: `GET /fonts/proxima-nova-400.woff2` și
`GET /fonts/proxima-nova-700.woff2` răspund `404`.

Nu e un defect al ramurii. Fonturile Proxima Nova sunt licențiate și nu sunt
instalate nici pe gazda de producție: `web/fonts.mjs` raportează lipsa lor și
interfața cade pe Geist Variable, cum e prevăzut. **Producția are aceleași
404-uri** (`10.77.0.13:3000/fonts/proxima-nova-400.woff2` → `404`), deci
condiția e de mediu, nu de cod. Constatarea e deja în registru, ca `UX-20`.

## Stiva

Stiva a fost construită de `audit/_tools/rc1-e2e-stack.sh`, care verifică
simbolurile ramurii în artefactele construite înainte de a o porni, ca o
stivă veche să nu poată da un verdict despre alt cod.
