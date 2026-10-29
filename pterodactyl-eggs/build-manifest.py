#!/usr/bin/env python3
"""
Builds the catalogue of the platform out of the eggs of Pterodactyl.

For every product it writes:
  * the egg in `pterodactyl-eggs/<slug>.json`, copied from the upstream
    repository under a name of our own;
  * an entry in `pterodactyl-eggs/manifest.json`, with everything the platform
    needs to make the product: the name, the category, the icon, the resources
    and the price.

The manifest is the truth of the catalogue: the importer reads it, the
products are created out of it, and the documentation quotes it.

The upstream repositories are read from a directory that holds the three
clones, and the eggs are written next to this script:

    python3 pterodactyl-eggs/build-manifest.py /path/to/the/clones
"""
import json
import os
import sys

TARGET = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = "/tmp/ptero-eggs"

# The resources of a product: the least it runs with, what it gets by default
# and the most the platform lets it have.
# name: (minRam, defaultRam, minCpu, defaultCpu, minDisk, defaultDisk, maxRam, maxCpu, maxDisk)
LIGHT = (512, 1024, 1, 1, 5, 10, 4096, 2, 50)
APP = (1024, 2048, 1, 1, 10, 20, 8192, 4, 100)
DATA = (1024, 2048, 1, 1, 10, 20, 16384, 4, 200)
SMALL_GAME = (2048, 4096, 1, 1, 20, 30, 16384, 4, 100)
BIG_GAME = (4096, 8192, 2, 2, 40, 60, 32768, 8, 250)

# The resources of the products whose egg states what it needs.
#
# The tiers above are the floor of the platform: they are a commercial
# choice, not a measurement. When the egg of a product states a requirement of
# its own, that requirement wins: a customer must not be able to buy a
# configuration that the egg of the product says is too small.
#
# Every entry below carries the line of the upstream file it was read from.
# name: (minRam, defaultRam, minCpu, defaultCpu, maxRam, maxCpu, evidence)
EVIDENCE = {
    "cs2d": (1024, 2048, 1, 1, 4096, 2,
             "game-eggs/cs2d/README.md:17, one gigabyte of memory is recommended"),
    "conan-exiles": (6144, 8192, 2, 2, 32768, 8,
                     "game-eggs/conan_exiles/README.md:9, about six gigabytes of memory"),
    "loki": (3072, 4096, 1, 1, 8192, 4,
             "application-eggs/loki/README.md:15, a minimum of three gigabytes of memory"),
    "palworld": (16384, 16384, 4, 4, 32768, 8,
                 "game-eggs/palworld/README.md:86 and :90, sixteen gigabytes of memory and four processors"),
    "prometheus": (3072, 4096, 1, 1, 8192, 4,
                   "application-eggs/prometheus/README.md:10, a minimum of three gigabytes of memory"),
    "redis": (4096, 4096, 1, 1, 4096, 2,
              "application-eggs/redis/README.md:13, four gigabytes of memory are recommended"),
    "satisfactory": (8192, 8192, 2, 2, 32768, 8,
                     "game-eggs/satisfactory/README.md:111, eight gigabytes of memory"),
    "sons-of-the-forest": (8192, 8192, 2, 2, 32768, 8,
                           "game-eggs/sons_of_the_forest/README.md:29, a minimum of eight gigabytes of memory"),
    "space-engineers": (6144, 8192, 2, 2, 32768, 8,
                        "game-eggs/space_engineers/README.md:33, about six gigabytes of memory"),
    "team-fortress-2": (2048, 4096, 2, 2, 16384, 4,
                        "game-eggs/team_fortress_2/README.md:11, two processors"),
}

# slug: (egg file in the upstream repository, name, category, icon, resources,
#         description, price band)
# The price band is one of the three that the platform already uses:
#   bot     149 — a small service
#   tool    299 — a tool of a developer
#   data    449 — a database
GAMES = {
    "minecraft-paper": ("game-eggs/minecraft/java/paper/egg-paper.json", "Minecraft Paper", "gamepad", SMALL_GAME,
                        "The most played sandbox in the world, on Paper: the server that runs the plugins.", "tool"),
    "minecraft-folia": ("game-eggs/minecraft/java/folia/egg-folia.json", "Minecraft Folia", "gamepad", BIG_GAME,
                        "The version of Minecraft built for many players at once, with the regions of the world spread over many cores.", "tool"),
    "minecraft-forge": ("game-eggs/minecraft/java/forge/egg-forge-enhanced.json", "Minecraft Forge", "gamepad", BIG_GAME,
                        "Minecraft with the mod loader, for the servers that run mods.", "tool"),
    "minecraft-bedrock": ("game-eggs/minecraft/bedrock/bedrock/egg-vanilla-bedrock.json", "Minecraft Bedrock", "gamepad", SMALL_GAME,
                          "The edition of Minecraft that runs on phones and consoles, playable with the Java edition too.", "tool"),
    "counter-strike-2": ("game-eggs/counter_strike/counter_strike_2/egg-counter--strike2.json", "Counter-Strike 2", "gamepad", BIG_GAME,
                         "The competitive shooter, on the server of Steam.", "tool"),
    "counter-strike-1-6": ("game-eggs/counter_strike/counter_strike_1.6_rehlds/egg-cs 1.6-rehlds.json", "Counter-Strike 1.6", "gamepad", SMALL_GAME,
                           "The classic of the competitive shooters, on the reHLDS engine.", "bot"),
    "cs2d": ("game-eggs/cs2d/egg-c-s2-d.json", "CS2D", "gamepad", LIGHT,
             "The two dimensional counterpart of Counter-Strike, light and free.", "bot"),
    "team-fortress-2": ("game-eggs/team_fortress_2/egg-team-fortress-2.json", "Team Fortress 2", "gamepad", SMALL_GAME,
                        "The free shooter of Valve, with its classes and its modes.", "bot"),
    "left-4-dead-2": ("game-eggs/left4dead_2/egg-left4dead_2.json", "Left 4 Dead 2", "gamepad", SMALL_GAME,
                      "The cooperative shooter of Valve, with the survivors and the infected.", "bot"),
    "garrys-mod": ("game-eggs/gmod/egg-garry-s-mod.json", "Garry's Mod", "gamepad", BIG_GAME,
                   "The sandbox of Valve, where the server is a playground of contraptions.", "tool"),
    "fivem": ("game-eggs/gta/fivem/egg-five-m.json", "FiveM", "gamepad", BIG_GAME,
              "The server of the role play of Grand Theft Auto, with the resources of the community.", "tool"),
    "samp": ("game-eggs/gta/samp/egg-s-a--m-p.json", "SA-MP", "gamepad", SMALL_GAME,
             "The multiplayer of Grand Theft Auto that runs on a small server.", "bot"),
    "terraria": ("game-eggs/terraria/tshock/egg-tshock.json", "Terraria", "gamepad", SMALL_GAME,
                 "The two dimensional adventure of sandbox and of bosses, on TShock.", "bot"),
    "vintage-story": ("game-eggs/vintage_story/egg-vintage-story.json", "Vintage Story", "gamepad", SMALL_GAME,
                      "The voxel survival that asks for a long craft, and it is free.", "bot"),
    "unturned": ("game-eggs/unturned/egg-unturned.json", "Unturned", "gamepad", SMALL_GAME,
                 "The survival of the zombies that runs on any machine.", "bot"),
    "dont-starve-together": ("game-eggs/dont_starve/egg-don-t-starve-together.json", "Don't Starve Together", "gamepad", SMALL_GAME,
                             "The survival of the dark, with the seasons of the world.", "bot"),
    "rust": ("game-eggs/rust/rust_depotdownloader/egg-rust-depotdownloader.json", "Rust", "gamepad", BIG_GAME,
             "The survival of the raiders, on the server of Steam.", "tool"),
    "ark-survival-evolved": ("game-eggs/ark_survival_evolved/egg-ark--survival-evolved.json", "ARK: Survival Evolved", "gamepad", BIG_GAME,
                              "The survival of the dinosaurs, on the server of Steam.", "tool"),
    "valheim": ("game-eggs/valheim/valheim_vanilla/egg-valheim.json", "Valheim", "gamepad", BIG_GAME,
                "The survival of the vikings, on the server of Steam.", "tool"),
    "palworld": ("game-eggs/palworld/egg-palworld.json", "Palworld", "gamepad", BIG_GAME,
                 "The survival of the creatures, with the factories of the bases.", "tool"),
    "satisfactory": ("game-eggs/satisfactory/egg-satisfactory.json", "Satisfactory", "gamepad", BIG_GAME,
                     "The factory of the planets, on the server of Steam.", "tool"),
    "dayz": ("game-eggs/dayz/egg-dayz.json", "DayZ", "gamepad", BIG_GAME,
             "The survival of Chernarus, on the server of Steam.", "tool"),
    "conan-exiles": ("game-eggs/conan_exiles/egg-conan-exiles.json", "Conan Exiles", "gamepad", BIG_GAME,
                     "The survival of the age of Conan, on the server of Steam.", "tool"),
    "the-forest": ("game-eggs/the_forest/egg-the-forest.json", "The Forest", "gamepad", BIG_GAME,
                   "The survival of the cannibal, on the server of Steam.", "tool"),
    "sons-of-the-forest": ("game-eggs/sonsoftheforest/egg-sons-of-the-forest.json", "Sons of the Forest", "gamepad", BIG_GAME,
                           "The survival of the forest that followed The Forest, on the server of Steam.", "tool"),
    "factorio": ("game-eggs/factorio/factorio/egg-factorio.json", "Factorio", "gamepad", BIG_GAME,
                 "The factory that has to be free of itself.", "tool"),
    "space-engineers": ("game-eggs/space_engineers/default/egg-space-engineers.json", "Space Engineers", "gamepad", BIG_GAME,
                        "The engineering in space, on the server of Steam.", "tool"),
    "stationeers": ("game-eggs/stationeers/stationeers_vanilla/egg-stationeers.json", "Stationeers", "gamepad", BIG_GAME,
                     "The engineering of the station, in the universe of Kerbal.", "tool"),
    "subnautica": ("game-eggs/subnautica_nitrox_mod/egg-subnautica.json", "Subnautica", "gamepad", BIG_GAME,
                    "The survival under the water, on the server of Steam.", "tool"),
    "project-zomboid": ("game-eggs/project_zomboid/egg-project-zomboid.json", "Project Zomboid", "gamepad", SMALL_GAME,
                         "The survival of the zombies that tells a story, on the server of Steam.", "tool"),
    "core-keeper": ("game-eggs/core_keeper/egg-core-keeper.json", "Core Keeper", "gamepad", SMALL_GAME,
                    "The mining of the dungeon, with the guardians of the core.", "tool"),
    "7-days-to-die": ("game-eggs/7_days_to_die/egg-7-days-to-die.json", "7 Days to Die", "gamepad", BIG_GAME,
                      "The survival of the horde, on the server of Steam.", "tool"),
    "hytale": ("game-eggs/hytale/egg-hytale.json", "Hytale", "gamepad", SMALL_GAME,
               "The sandbox that Hypixel is building, with the worlds of the players.", "tool"),
}

APPS = {
    "grafana": ("application-eggs/grafana/egg-grafana.json", "Grafana", "MONITORING", "chart", APP,
                "The panels of the metrics, with the graphs of everything the platform measures.", "tool"),
    "prometheus": ("application-eggs/monitoring/prometheus/egg-prometheus.json", "Prometheus", "MONITORING", "mon", APP,
                   "The collection of the metrics that the monitoring reads.", "tool"),
    "loki": ("application-eggs/monitoring/loki/egg-loki.json", "Loki", "MONITORING", "flow", APP,
             "The logs of the services, gathered where the metrics live.", "tool"),
    "forgejo": ("application-eggs/forgejo/egg-forgejo.json", "Forgejo", "DEVELOPER_TOOLS", "code", APP,
                "The git of the code, on your own server, without a licence.", "tool"),
    "gitea": ("application-eggs/gitea/egg-gitea.json", "Gitea", "DEVELOPER_TOOLS", "code", APP,
              "The git of the code, with the wiki and the issues.", "tool"),
    "minio": ("application-eggs/minio/egg-minio-s3.json", "MinIO", "DEVELOPER_TOOLS", "folder", DATA,
              "The storage of the objects, with the API of S3.", "tool"),
    "meilisearch": ("application-eggs/meilisearch/egg-meilisearch.json", "Meilisearch", "DEVELOPER_TOOLS", "bolt", LIGHT,
                    "The search that is fast and that forgives a typo.", "bot"),
    "nats": ("application-eggs/nats/egg-n-a-t-s.json", "NATS", "AUTOMATION", "flow", LIGHT,
             "The messages between the services, with the subject of the message.", "bot"),
    "rabbitmq": ("application-eggs/rabbitmq/egg-rabbit-m-q.json", "RabbitMQ", "AUTOMATION", "flow", APP,
                 "The queue of the messages, with the consumers that wait for them.", "tool"),
    "elasticsearch": ("application-eggs/elasticsearch/egg-elasticsearch.json", "Elasticsearch", "DEVELOPER_TOOLS", "chart", DATA,
                      "The search of the documents, with the index of the text.", "tool"),
    "yarr": ("application-eggs/yarr/egg-yarr.json", "Yarr", "AUTOMATION", "box", APP,
             "The manager of the downloads, with the search of what was wanted.", "bot"),
    "owncast": ("application-eggs/owncast/egg-owncast-online.json", "Owncast", "AUTOMATION", "rocket", APP,
                "The streaming of the video, with the page of the channel.", "bot"),
    "reposilite": ("application-eggs/reposilite/egg-reposilite.json", "Reposilite", "DEVELOPER_TOOLS", "code", LIGHT,
                   "The repository of the packages, for the teams that build with them.", "bot"),
    "languagetool": ("application-eggs/languagetool/egg-language-tool.json", "LanguageTool", "DEVELOPER_TOOLS", "doc", APP,
                     "The proofreader of the text, in the language of the reader.", "bot"),
    "lavalink": ("application-eggs/lavalink/egg-lavalink.json", "Lavalink", "AUTOMATION", "bot", LIGHT,
                 "The music of the bots of Discord, served from your own node.", "bot"),
    "haste-server": ("application-eggs/haste-server/egg-haste-server.json", "Haste", "DEVELOPER_TOOLS", "code", LIGHT,
                     "The paste of the code, the files that are shared with a link.", "bot"),
    "mariadb": ("application-eggs/database/sql/mariadb/egg-maria-d-b.json", "MariaDB", "DATABASES", "db", DATA,
                "The database of MySQL, for the applications that ask for it.", "data"),
    "mongodb": ("application-eggs/database/nosql/mongodb/egg-mongo-d-b8.json", "MongoDB", "DATABASES", "db", DATA,
                "The database of the documents, for the data that has no shape.", "data"),
    "redis": ("application-eggs/database/redis/redis-7/egg-redis-7.json", "Redis", "DATABASES", "bolt", LIGHT,
              "The cache and the queue in memory, for the fast part of an application.", "bot"),
    "teamspeak-6": ("application-eggs/voice/teamspeak6_server/egg-teamspeak6-server.json", "TeamSpeak 6", "BOTS", "bot", APP,
                    "The voice of the teams and of the games, with the channels of your own server.", "bot"),
    "sftp-share": ("application-eggs/sftp_storage_share/egg-s-f-t-p-storage-share.json", "SFTP Share", "AUTOMATION", "folder", LIGHT,
                   "The files of the team, reached over SFTP and over the browser.", "bot"),
    "folding-at-home": ("application-eggs/foldingathome/egg-folding--home.json", "Folding@Home", "AUTOMATION", "rocket", LIGHT,
                        "The computing that helps the research, with the team of the projects.", "bot"),
    "5e-tools": ("application-eggs/5e-tools/egg-5e-tools.json", "5e Tools", "AUTOMATION", "term", APP,
                 "The tools of the counter-strike, for the server that plays it.", "bot"),
}

GENERICS = {
    "python": ("generic-eggs/python/egg-python-generic.json", "Python", "DEVELOPER_TOOLS", "code", LIGHT,
               "The runtime of Python, for the script and for the service of your own code.", "bot"),
    "nodejs": ("generic-eggs/nodejs/egg-node-js-generic.json", "Node.js", "DEVELOPER_TOOLS", "code", LIGHT,
               "The runtime of Node.js, for the service of your own code.", "bot"),
    "java": ("generic-eggs/java/egg-java.json", "Java", "DEVELOPER_TOOLS", "code", APP,
             "The runtime of Java, for the service that runs on a jar.", "bot"),
    "golang": ("generic-eggs/golang/egg-golang-generic.json", "Go", "DEVELOPER_TOOLS", "code", LIGHT,
               "The runtime of Go, for the service that is built in Go.", "bot"),
    # The name of the product is "Rust Runtime" and its slug is "rust-runtime",
    # because the game of Rust is already a product of the catalogue and the
    # two would write the same file of eggs.
    "rust-runtime": ("generic-eggs/rust/egg-rust-generic.json", "Rust Runtime", "DEVELOPER_TOOLS", "code", LIGHT,
                     "The runtime of Rust, for the service that is built in Rust.", "bot"),
    "lua": ("generic-eggs/lua/luvit/egg-luvit-generic.json", "Lua", "DEVELOPER_TOOLS", "code", LIGHT,
            "The runtime of Lua, for the script of the game and for the small service.", "bot"),
    "deno": ("generic-eggs/deno/egg-deno-generic.json", "Deno", "DEVELOPER_TOOLS", "code", LIGHT,
             "The runtime of Deno, for the service of your own code.", "bot"),
    "dotnet": ("generic-eggs/c#/egg-generic-c.json", ".NET", "DEVELOPER_TOOLS", "code", APP,
               "The runtime of .NET, for the service that is built with C#.", "bot"),
    "dart": ("generic-eggs/dart/egg-dart-generic.json", "Dart", "DEVELOPER_TOOLS", "code", LIGHT,
             "The runtime of Dart, for the service that is built with Flutter.", "bot"),
    "elixir": ("generic-eggs/elixir/egg-elixir.json", "Elixir", "DEVELOPER_TOOLS", "code", LIGHT,
               "The runtime of Elixir, for the service that is built with the BEAM.", "bot"),
}

PRICE_BANDS = {"bot": 149, "tool": 299, "data": 449}

# Two eggs of the platform carry a name that is already in the nest of the
# panel: the old one and the new one would answer to the same name, and the
# resolution of an egg by name would not know which one is meant. The new ones
# are therefore named apart.
RENAMES = {
    "python": "Python 3.13",
    "nodejs": "Node.js 25",
}
CATEGORIES = {
    "GAMES": ("Games", "gamepad"),
    "WEB_CMS": ("Web & CMS", "globe"),
    "DEVELOPER_TOOLS": ("Developer Tools", "code"),
    "MONITORING": ("Monitoring", "mon"),
    "AUTOMATION": ("Automation", "flow"),
    "BOTS": ("Bots", "bot"),
    "DATABASES": ("Databases", "db"),
}

# The variables the customer fills at the order.
#
# They are the values that only the customer holds: the account of a vendor,
# the token of a game, the key of an API, the repository of a service. The
# platform asks for them, keeps them sealed and puts them in the environment
# of the container, so the egg reads them the way it reads its own variables.
#
# A variable is required only when the egg says the server cannot run
# without it. Everything else is optional: the game still starts, it is only
# less visible in the list of the games or it is not registered anywhere.
#
# The names are the names of the variables of the egg: the value the customer
# gives replaces the value of the egg of the same name.
CUSTOMER_VARIABLES = {
    # --- the games that need something from the customer ---------------------
    "counter-strike-2": {
        "STEAM_GSLT": {
            "label": "Steam Gameserver Login Token",
            "type": "text",
            "description": "The token that makes the server appear in the public list of Steam. You get it from https://steamcommunity.com/dev/managegameservers",
        },
    },
    "team-fortress-2": {
        "STEAM_GSLT": {
            "label": "Game Server Login Token (GSLT)",
            "type": "text",
            "description": "The token that makes the server appear in the public list of Steam. You get it from https://steamcommunity.com/dev/managegameservers",
        },
    },
    "garrys-mod": {
        "STEAM_TOKEN": {
            "label": "Steam Account Token",
            "type": "text",
            "description": "The token that makes the server appear in the public list of Steam.",
        },
    },
    "unturned": {
        "GSLT": {
            "label": "Game Server Login Token",
            "type": "text",
            "description": "The token that makes the server appear in the public list of Steam.",
        },
    },
    "the-forest": {
        "STEAM_ACC": {
            "label": "Steam Account Token",
            "required": True,
            "type": "text",
            "description": "The server needs it to save the progress of the players. Use the app id 242760 when you make the token.",
        },
    },
    "dayz": {
        "STEAM_USER": {
            "label": "Steam account",
            "required": True,
            "type": "text",
            "description": "The account that downloads the server and its mods. DayZ cannot be downloaded anonymously.",
        },
        "STEAM_PASS": {
            "label": "Password of the Steam account",
            "required": True,
            "type": "password",
            "description": "Turn the Steam Guard off for this account, or the download stops and asks again for the code.",
        },
    },
    "subnautica": {
        "STEAM_USERNAME": {
            "label": "Steam account",
            "required": True,
            "type": "text",
            "description": "The account that downloads the server and the mods of the base.",
        },
        "STEAM_PASSWORD": {
            "label": "Password of the Steam account",
            "required": True,
            "type": "password",
            "description": "The password of the account that downloads the server.",
        },
        "STEAM_GUARDCODE": {
            "label": "Steam Guard code",
            "type": "text",
            "description": "The code of the Steam Guard, when the account has it. It changes every few minutes, so it is asked again at every update.",
        },
    },
    "dont-starve-together": {
        "SERVER_TOKEN": {
            "label": "Server token",
            "type": "text",
            "description": "Only needed for a server that appears in the public list. You get it from https://accounts.klei.com/account/game/servers",
        },
    },
    "factorio": {
        "SERVER_TOKEN": {
            "label": "Factorio server token",
            "type": "text",
            "description": "Only needed for a server that appears in the public list of Factorio.",
        },
        "SERVER_USERNAME": {
            "label": "Name on the account of Factorio",
            "type": "text",
            "description": "The name the server shows in the list, next to your token.",
        },
    },
    "fivem": {
        "FIVEM_LICENSE": {
            "label": "FiveM licence key",
            "required": True,
            "type": "text",
            "description": "The server does not start without it. You get it from https://portal.cfx.re/",
        },
        "STEAM_WEBAPIKEY": {
            "label": "Steam Web API key",
            "type": "text",
            "description": "Only needed for the parts that talk to Steam. Write 'none' to leave it out. You get it from https://steamcommunity.com/dev/apikey/",
        },
    },
    "project-zomboid": {
        "ADMIN_USER": {
            "label": "Name of the administrator",
            "type": "text",
            "description": "The name of the account that administers the server.",
        },
        "ADMIN_PASSWORD": {
            "label": "Password of the administrator",
            "type": "password",
            "description": "The password of the account that administers the server.",
        },
        "SRCDS_BETAID": {
            "label": "Steam branch",
            "type": "text",
            "description": "The branch of the server to install, such as b41multiplayer. Leave it empty for the normal branch.",
        },
    },
    "satisfactory": {
        "SRCDS_BETAID": {
            "label": "Steam branch",
            "type": "text",
            "description": "Leave it empty for the stable branch, or write 'experimental'.",
        },
        "SRCDS_BETAPASS": {
            "label": "Password of the branch",
            "type": "password",
            "description": "Only for a branch that is protected by a password.",
        },
    },
    "valheim": {
        "SRCDS_BETAID": {
            "label": "Steam branch",
            "type": "text",
            "description": "Leave it empty for the normal branch.",
        },
        "SRCDS_BETAPASS": {
            "label": "Password of the branch",
            "type": "password",
            "description": "Only for a branch that is protected by a password.",
        },
    },
    "core-keeper": {
        "GAME_ID": {
            "label": "Game id",
            "type": "text",
            "description": "The id of the game the server runs, as the egg asks for it. Leave it empty to keep the default of the egg.",
        },
    },
    "7-days-to-die": {
        "PASSWORD": {
            "label": "Password of the telnet interface",
            "type": "password",
            "description": "Only needed when the telnet interface is opened outside the server.",
        },
    },
    # --- the applications that need something from the customer --------------
    "meilisearch": {
        "MEILI_MASTER_KEY": {
            "label": "Master key",
            "required": True,
            "type": "password",
            "description": "The key that protects the search. It has to be at least 16 bytes long.",
        },
    },
    "owncast": {
        "STREAM_KEY": {
            "label": "Stream key",
            "required": True,
            "type": "password",
            "description": "The key that opens the page of the channel and that the encoder sends.",
        },
        "GITHUB_USER": {
            "label": "GitHub account",
            "type": "text",
            "description": "Only needed when the platform asks GitHub more than the anonymous account may.",
        },
        "GITHUB_OAUTH_TOKEN": {
            "label": "GitHub token",
            "type": "password",
            "description": "Only needed when the platform asks GitHub more than the anonymous account may.",
        },
    },
    "nats": {
        "USERNAME": {
            "label": "User",
            "type": "text",
            "description": "The user of the connections. It cannot be used together with a token.",
        },
        "PASSWORD": {
            "label": "Password",
            "type": "password",
            "description": "The password of the user of the connections.",
        },
        "AUTH_TOKEN": {
            "label": "Token",
            "type": "password",
            "description": "The token of the connections. When it is set, the user and the password are ignored.",
        },
    },
    "mongodb": {
        "MONGO_USER": {
            "label": "Administrator of MongoDB",
            "type": "text",
            "description": "The name of the administrator of the database.",
        },
        "MONGO_USER_PASS": {
            "label": "Password of the administrator",
            "type": "password",
            "description": "The password of the administrator of the database.",
        },
    },
    "redis": {
        "SERVER_PASSWORD": {
            "label": "Password of Redis",
            "type": "password",
            "description": "The password that protects the server. Leave it empty and the server listens without a password.",
        },
    },
    "yarr": {
        "USERNAME": {
            "label": "User",
            "type": "text",
            "description": "The user of the interface.",
        },
        "PASSWORD": {
            "label": "Password",
            "type": "password",
            "description": "The password of the interface.",
        },
    },
    "folding-at-home": {
        "FAH_USERNAME": {
            "label": "Folding@Home account",
            "type": "text",
            "description": "The account the computer works for. Leave it empty to work anonymously.",
        },
        "FAH_PASSKEY": {
            "label": "Passkey of Folding@Home",
            "type": "password",
            "description": "The passkey of the account, from https://apps.foldingathome.org/getpasskey",
        },
        "FAH_PASSWORD": {
            "label": "Password of the web interface",
            "type": "password",
            "description": "The password of the page that shows the state of the computer.",
        },
    },
    "teamspeak-6": {
        "TSSERVER_LICENSE_ACCEPTED": {
            "label": "Accept the licence of the server",
            "required": True,
            "type": "text",
            "description": "The server refuses to start until the licence of TeamSpeak is accepted.",
        },
        "TSSERVER_QUERY_ADMIN_PASSWORD": {
            "label": "Password of the query admin",
            "type": "password",
            "description": "The password of the account that reads the state of the server.",
        },
    },
    "5e-tools": {
        "REPOSITORY": {
            "label": "Repository of the tools",
            "type": "text",
            "description": "The repository of the tools of the counter-strike, when you want another one than the default of the egg.",
        },
    },
    # --- the runtimes: the customer brings the code --------------------------
    "python": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "nodejs": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "dotnet": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "dart": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "deno": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "lua": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "elixir": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "GIT_BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "GIT_USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "GIT_ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
    "golang": {
        "GO_PACKAGE": {
            "label": "Go package",
            "required": True,
            "type": "text",
            "description": "The package the container builds and runs, such as github.com/you/your-service.",
        },
    },
    "java": {
        "JARFILE": {
            "label": "Name of the jar file",
            "required": True,
            "type": "text",
            "description": "The name of the file the container runs, such as service.jar.",
        },
    },
    "rust-runtime": {
        "GIT_ADDRESS": {
            "label": "Repository of the service",
            "required": True,
            "type": "text",
            "description": "The repository the container clones when it is built.",
        },
        "BRANCH": {
            "label": "Branch",
            "type": "text",
            "description": "The branch of the repository. Leave it empty for the branch of the repository itself.",
        },
        "USERNAME": {
            "label": "Account of the repository",
            "type": "text",
            "description": "Only for a repository that is not public.",
        },
        "ACCESS_TOKEN": {
            "label": "Token of the repository",
            "type": "password",
            "description": "Only for a repository that is not public. A token of the account is better than its password.",
        },
    },
}

# Where a product stands in the catalogue. The products that were already on
# the platform keep the numbers they had; the new ones come after them, by
# group, and by name inside the group.
SORT_ORDER = {"games": 100, "apps": 200, "generics": 300}

# The products whose egg does not come from the three repositories of
# Pterodactyl. Their egg file is kept in the repository as it is, and the
# entry of the manifest is written here, so that a rebuild of the catalogue
# does not lose the product.
#
# WordPress is served by the egg of Nginx with PHP of Ym0T: it is the one egg
# of the catalogue that carries a site, and it comes with its own image.
EXTRA = {
    "wordpress": {
        "group": "apps",
        "category": "WEB_CMS",
        "icon": "globe",
        "name": "WordPress",
        "description": "The publishing platform, with Nginx and PHP, for the site of a business or of a blog.",
        "resources": APP,
        "band": "tool",
        "upstream": "https://github.com/Ym0T/pterodactyl-nginx-egg",
        "upstreamPath": "egg-nginx-v3.json",
        "customerVariables": {},
    },
}


def main():
    os.makedirs(TARGET, exist_ok=True)
    manifest = []
    groups = (("games", GAMES), ("apps", APPS), ("generics", GENERICS))

    seen = set()
    for group, products in groups:
        for slug in products:
            if slug in seen:
                raise SystemExit(f"the slug {slug} is used twice: every product writes its own egg file")
            seen.add(slug)

    for group, products in groups:
        for slug, entry in products.items():
            if group == "games":
                source, name, icon, resources, description, band = entry
                category = "GAMES"
            else:
                source, name, category, icon, resources, description, band = entry
            path = os.path.join(UPSTREAM, source)
            if not os.path.isfile(path):
                raise SystemExit(f"the egg {path} does not exist")
            egg = json.load(open(path))
            if slug in RENAMES:
                egg["name"] = RENAMES[slug]
            target_name = f"{slug}.json"
            with open(os.path.join(TARGET, target_name), "w") as handle:
                json.dump(egg, handle, indent=4)
                handle.write("\n")

            variables = CUSTOMER_VARIABLES.get(slug, {})
            unknown = [name for name in variables if name not in [v.get("env_variable") for v in egg.get("variables", [])]]
            if unknown:
                raise SystemExit(f"the egg of {slug} has no variable named {', '.join(unknown)}")

            min_ram, default_ram, min_cpu, default_cpu, min_disk, default_disk, max_ram, max_cpu, max_disk = resources
            evidence = EVIDENCE.get(slug)
            if evidence:
                # The egg states what it needs: its requirement wins over the
                # tier of the platform. The storage is not touched: no egg
                # states how much disk it needs.
                min_ram, default_ram, min_cpu, default_cpu, max_ram, max_cpu = evidence[:6]
                if default_ram > max_ram:
                    default_ram = max_ram
                if min_ram > default_ram:
                    min_ram = default_ram
            manifest.append({
                "slug": slug,
                "name": name,
                "group": group,
                "category": category,
                "icon": icon,
                "description": description,
                "eggFile": target_name,
                "eggName": egg.get("name"),
                "dockerImage": list(egg.get("docker_images", {}).values())[0] if egg.get("docker_images") else None,
                "priceBand": band,
                "baseAmount": PRICE_BANDS[band],
                "minRam": min_ram,
                "defaultRam": default_ram,
                "minCpu": min_cpu,
                "defaultCpu": default_cpu,
                "minDisk": min_disk,
                "defaultDisk": default_disk,
                "maxRam": max_ram,
                "maxCpu": max_cpu,
                "maxDisk": max_disk,
                "upstream": f"https://github.com/pterodactyl/{'game-eggs' if group == 'games' else 'application-eggs' if group == 'apps' else 'generic-eggs'}",
                "upstreamPath": source,
                "variables": [v.get("env_variable") for v in egg.get("variables", []) if v.get("env_variable")],
                "customerVariables": variables,
            })

    # The products whose egg does not come from the three repositories of
    # Pterodactyl. Their egg file is kept in the repository as it is, and the
    # entry of the manifest is written here, so that a rebuild of the
    # catalogue does not lose the product.
    for slug, entry in EXTRA.items():
        group = entry["group"]
        target_name = f"{slug}.json"
        path = os.path.join(TARGET, target_name)
        if not os.path.isfile(path):
            raise SystemExit(f"the egg {path} does not exist")
        egg = json.load(open(path))

        variables = entry.get("customerVariables", {})
        unknown = [name for name in variables if name not in [v.get("env_variable") for v in egg.get("variables", [])]]
        if unknown:
            raise SystemExit(f"the egg of {slug} has no variable named {', '.join(unknown)}")

        min_ram, default_ram, min_cpu, default_cpu, min_disk, default_disk, max_ram, max_cpu, max_disk = entry["resources"]
        band = entry["band"]
        manifest.append({
            "slug": slug,
            "name": entry["name"],
            "group": group,
            "category": entry["category"],
            "icon": entry["icon"],
            "description": entry["description"],
            "eggFile": target_name,
            "eggName": egg.get("name"),
            "dockerImage": list(egg.get("docker_images", {}).values())[0] if egg.get("docker_images") else None,
            "priceBand": band,
            "baseAmount": PRICE_BANDS[band],
            "minRam": min_ram,
            "defaultRam": default_ram,
            "minCpu": min_cpu,
            "defaultCpu": default_cpu,
            "minDisk": min_disk,
            "defaultDisk": default_disk,
            "maxRam": max_ram,
            "maxCpu": max_cpu,
            "maxDisk": max_disk,
            "upstream": entry["upstream"],
            "upstreamPath": entry["upstreamPath"],
            "variables": [v.get("env_variable") for v in egg.get("variables", []) if v.get("env_variable")],
            "customerVariables": variables,
        })

    manifest.sort(key=lambda entry: (entry["group"], entry["name"]))
    # The order of the catalogue: by group, then by name.
    counters = {group: 0 for group, _ in groups}
    for entry in manifest:
        counters[entry["group"]] += 1
        entry["sortOrder"] = SORT_ORDER[entry["group"]] + counters[entry["group"]] * 10

    with open(os.path.join(TARGET, "manifest.json"), "w") as handle:
        json.dump({"categories": CATEGORIES, "products": manifest}, handle, indent=2)
        handle.write("\n")

    print(f"the eggs were written: {len(manifest)}")
    for group, products in groups:
        print(f"  {group}: {len(products)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        UPSTREAM = sys.argv[1]
    main()
