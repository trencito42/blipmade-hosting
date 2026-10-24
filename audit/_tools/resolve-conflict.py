#!/usr/bin/env python3
"""Rezolva marcajele de conflict dintr-un fisier, pastrand latura care conteaza.

Regula pentru cazul intalnit la integrarea loturilor de performanta:
  - "al nostru" (ramura de reparare) este gol
  - "baza comuna" are o linie
  - "al lor" (workerul) are aceeasi linie, urmata de linii noi

Rezultatul: se pastreaza liniile noi ale workerului, fara linia repetata, si se
pastreaza si partea "noastra" daca ea nu e vida. Nimic nu se arunca in tarziu:
scriptul tipareste exact ce a eliminat si ce a pastrat.
"""
import re
import sys

PATTERN = re.compile(
    r"^<<<<<<< [^\n]*\n"
    r"(?P<ours>.*?)"
    r"^\|\|\|\|\|\|\| [^\n]*\n"
    r"(?P<base>.*?)"
    r"^=======\n"
    r"(?P<theirs>.*?)"
    r"^>>>>>>> [^\n]*\n",
    re.M | re.S,
)


def resolve(path):
    with open(path) as handle:
        text = handle.read()

    def replace(match):
        ours = match.group("ours")
        base = match.group("base")
        theirs = match.group("theirs")
        base_lines = [line for line in base.splitlines() if line.strip()]
        their_lines = theirs.splitlines(keepends=True)

        # "al lor" incepe cu aceeasi linie ca baza: linia a fost mutata de fazele
        # 14-16, deci nu se ia inapoi.
        if base_lines and their_lines and their_lines[0].strip() == base_lines[0].strip():
            their_lines = their_lines[1:]

        kept = []
        if ours.strip():
            kept.append(ours)
        kept.extend(their_lines)
        print(f"  {path}: rezolvat -> {' '.join(line.strip() for line in kept)[:160]}")
        return "".join(kept)

    new_text = PATTERN.sub(replace, text)
    if new_text == text:
        print(f"  {path}: niciun conflict")
        return False
    with open(path, "w") as handle:
        handle.write(new_text)
    return True


if __name__ == "__main__":
    for argument in sys.argv[1:]:
        resolve(argument)
