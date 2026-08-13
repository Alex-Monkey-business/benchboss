#!/bin/bash
# Daglig sikkerhetskopi av BenchBoss-databasen.
#
# Supabase-planen dette prosjektet ligger på har INGEN automatiske backups og
# ingen PITR. Uten denne jobben er eneste kopi den man tilfeldigvis tok sist.
# Det er like mye et vern mot en feil i en egen migrasjon som mot en angriper.
#
# Dumpene legges UTENFOR repoet med vilje: de inneholder navn på mindreårige
# og telefonnumre, og skal ikke kunne havne i en commit.
#
# Kjøres daglig av ~/Library/LaunchAgents/no.benchboss.backup.plist

set -euo pipefail

REPO="$HOME/dev/Private-projects/bench-boss"
DEST="$HOME/dev/benchboss-backups"
KEEP=14

cd "$REPO"

# shellcheck disable=SC1091
set -a && . ./.env.local && set +a

STAMP=$(date +%Y-%m-%d)
OUT="$DEST/$STAMP"
mkdir -p "$OUT"

npx --yes supabase db dump -f "$OUT/schema.sql" >/dev/null 2>&1
npx --yes supabase db dump --data-only -f "$OUT/data.sql" >/dev/null 2>&1
npx --yes supabase db dump --role-only -f "$OUT/roles.sql" >/dev/null 2>&1

# En tom dump er verre enn ingen: den ser ut som en backup.
if [ ! -s "$OUT/data.sql" ]; then
  echo "$(date '+%F %T')  FEILET: data.sql er tom" >> "$DEST/backup.log"
  exit 1
fi

echo "$(date '+%F %T')  OK  $(du -sh "$OUT" | cut -f1)" >> "$DEST/backup.log"

# Behold de siste 14 dagene.
cd "$DEST"
ls -1d 20*/ 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | xargs -r rm -rf
