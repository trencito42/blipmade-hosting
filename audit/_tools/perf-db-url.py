import sys
import urllib.parse

env_path, target = sys.argv[1], sys.argv[2]

url = ""
for line in open(env_path, encoding="utf-8"):
    if line.startswith("DATABASE_URL="):
        url = line.split("=", 1)[1].strip()
        break

if not url:
    raise SystemExit("DATABASE_URL nu este in .env")

parts = urllib.parse.urlsplit(url)
netloc = parts.netloc.replace("@postgres:", "@localhost:")
parts = parts._replace(netloc=netloc, path="/" + target, query="", fragment="")
print(urllib.parse.urlunsplit(parts))
