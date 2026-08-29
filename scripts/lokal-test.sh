#!/usr/bin/env bash
# Lokal testrigg for BenchBoss.
#
#   ./scripts/lokal-test.sh lenke [e-post]   fersk innloggingslenke (engangs)
#   ./scripts/lokal-test.sh nullstill        Stag G2018 tilbake til tomt kull
#   ./scripts/lokal-test.sh status           hva ligger i basen nå
#
# Krever at `supabase start` og dev-serveren kjører.
set -euo pipefail

DB=supabase_db_halsen-dommerutlegg
API=http://127.0.0.1:54321
APP=http://localhost:5173
SVC=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
STAG=30064ef2-2a5d-4f62-aea9-3cf9a1f18726

psql_() { docker exec -e PGPASSWORD=postgres "$DB" psql -U supabase_admin -h 127.0.0.1 -d postgres "$@"; }

case "${1:-status}" in
  lenke)
    EPOST="${2:-alexander.samnoy@gmail.com}"
    curl -s -X POST "$API/auth/v1/admin/generate_link" \
      -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
      -d "{\"type\":\"magiclink\",\"email\":\"$EPOST\"}" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['action_link'])"
    ;;

  nullstill)
    # Stag tilbake til det Sten møter første gang: klubb koblet, ingenting annet.
    psql_ -qc "
      delete from match_coaches where match_id in (select id from matches where cohort_id='$STAG');
      delete from matches where cohort_id='$STAG';
      delete from team_coaches where cohort_id='$STAG';
      delete from players where cohort_id='$STAG';
      delete from teams where cohort_id='$STAG';
      update cohorts set birth_year=null, uses_referees=true, players_on_pitch=7, period_count=2, period_minutes=30 where id='$STAG';
      update clubs set fiks_id=null where short_name='Stag';"
    echo "Stag G2018 er tomt. Logg inn, bytt kull i /admin, og veiviseren tar over."
    ;;

  status)
    psql_ -c "
      select cl.name klubb, cl.fiks_id, c.name kull, c.birth_year, c.uses_referees dommere,
             (select count(*) from teams t where t.cohort_id=c.id) lag,
             (select count(*) from players p where p.cohort_id=c.id) spillere,
             (select count(*) from matches m where m.cohort_id=c.id) kamper
      from cohorts c join clubs cl on cl.id=c.club_id order by cl.name;"
    echo "App:      $APP"
    echo "Postkasse: http://127.0.0.1:54324   (alle e-poster appen sender lokalt)"
    echo "Studio:    http://127.0.0.1:54323"
    ;;
esac
