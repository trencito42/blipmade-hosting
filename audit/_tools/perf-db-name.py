import sys
import urllib.parse

print(urllib.parse.urlsplit(sys.argv[1]).path.lstrip("/"))
