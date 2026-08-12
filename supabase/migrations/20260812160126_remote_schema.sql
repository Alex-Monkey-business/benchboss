


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "pin" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coaches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cup_match_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cup_match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cup_match_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cup_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cup_id" "uuid" NOT NULL,
    "our_team" "text" NOT NULL,
    "opponent" "text",
    "match_date" "date",
    "match_time" time without time zone,
    "pitch" "text",
    "round" "text",
    "home_score" integer,
    "away_score" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "report" "text",
    CONSTRAINT "cup_matches_our_team_check" CHECK (("our_team" = ANY (ARRAY['goat'::"text", 'han'::"text", 'halsen'::"text", 'halsen2'::"text"])))
);


ALTER TABLE "public"."cup_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cup_squad" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cup_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "cup_team" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cup_squad_cup_team_check" CHECK (("cup_team" = ANY (ARRAY['goat'::"text", 'han'::"text", 'halsen'::"text", 'halsen2'::"text"])))
);


ALTER TABLE "public"."cup_squad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "venue" "text",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cups_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."cups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "paid_by" "uuid" NOT NULL,
    "amount" integer DEFAULT 200 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_coaches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL
);


ALTER TABLE "public"."match_coaches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "clock_seconds" integer
);


ALTER TABLE "public"."match_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL
);


ALTER TABLE "public"."match_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_sessions" (
    "match_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'setup'::"text" NOT NULL,
    "clock_base_seconds" integer DEFAULT 0 NOT NULL,
    "running_since" timestamp with time zone,
    "period" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lineup" "jsonb",
    CONSTRAINT "match_sessions_status_check" CHECK (("status" = ANY (ARRAY['setup'::"text", 'running'::"text", 'paused'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."match_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_stints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'field'::"text" NOT NULL,
    "position" "text",
    "on_clock" integer NOT NULL,
    "off_clock" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "match_stints_role_check" CHECK (("role" = ANY (ARRAY['field'::"text", 'keeper'::"text"])))
);


ALTER TABLE "public"."match_stints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "season_id" "uuid" NOT NULL,
    "round" "text",
    "match_date" "date" NOT NULL,
    "match_day" "text",
    "match_time" time without time zone,
    "home_team" "text" NOT NULL,
    "away_team" "text" NOT NULL,
    "division" "text",
    "referee" "text",
    "fee_amount" integer DEFAULT 200 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "home_score" integer,
    "away_score" integer,
    "report" "text"
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_season_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "team" "text",
    "loan_eligible" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_season_teams_team_check" CHECK (("team" = ANY (ARRAY['gronn'::"text", 'rod'::"text", 'hvit'::"text"])))
);


ALTER TABLE "public"."player_season_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "primary_team" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "loan_eligible" boolean DEFAULT false,
    CONSTRAINT "players_primary_team_check" CHECK (("primary_team" = ANY (ARRAY['gronn'::"text", 'rod'::"text", 'hvit'::"text"])))
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "seasons_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'none'::"text" NOT NULL,
    "tema" "text",
    "organisering" "text",
    "laeringsmomenter" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "link" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    CONSTRAINT "training_exercises_type_check" CHECK (("type" = ANY (ARRAY['diff'::"text", 'mix'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."training_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "lead" "text",
    "accent" "text" DEFAULT 'warm'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_periods_accent_check" CHECK (("accent" = ANY (ARRAY['warm'::"text", 'sage'::"text", 'cornflower'::"text", 'peach'::"text", 'sky'::"text", 'olive'::"text"])))
);


ALTER TABLE "public"."training_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "drills" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "accent" "text" DEFAULT 'warm'::"text" NOT NULL,
    "focus" "text",
    "illustration" "text",
    "weekday" integer,
    CONSTRAINT "training_sessions_accent_check" CHECK (("accent" = ANY (ARRAY['warm'::"text", 'sage'::"text", 'cornflower'::"text", 'peach'::"text", 'sky'::"text", 'olive'::"text"]))),
    CONSTRAINT "training_sessions_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."training_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cup_match_goals"
    ADD CONSTRAINT "cup_match_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cup_matches"
    ADD CONSTRAINT "cup_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cup_squad"
    ADD CONSTRAINT "cup_squad_cup_id_player_id_key" UNIQUE ("cup_id", "player_id");



ALTER TABLE ONLY "public"."cup_squad"
    ADD CONSTRAINT "cup_squad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cups"
    ADD CONSTRAINT "cups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_match_id_key" UNIQUE ("match_id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_absences"
    ADD CONSTRAINT "match_absences_match_id_player_id_key" UNIQUE ("match_id", "player_id");



ALTER TABLE ONLY "public"."match_absences"
    ADD CONSTRAINT "match_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_coaches"
    ADD CONSTRAINT "match_coaches_match_id_coach_id_key" UNIQUE ("match_id", "coach_id");



ALTER TABLE ONLY "public"."match_coaches"
    ADD CONSTRAINT "match_coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_goals"
    ADD CONSTRAINT "match_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_players"
    ADD CONSTRAINT "match_players_match_id_player_id_key" UNIQUE ("match_id", "player_id");



ALTER TABLE ONLY "public"."match_players"
    ADD CONSTRAINT "match_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_sessions"
    ADD CONSTRAINT "match_sessions_pkey" PRIMARY KEY ("match_id");



ALTER TABLE ONLY "public"."match_stints"
    ADD CONSTRAINT "match_stints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_season_teams"
    ADD CONSTRAINT "player_season_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_season_teams"
    ADD CONSTRAINT "player_season_teams_player_id_season_id_key" UNIQUE ("player_id", "season_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referees"
    ADD CONSTRAINT "referees_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."referees"
    ADD CONSTRAINT "referees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_exercises"
    ADD CONSTRAINT "training_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_periods"
    ADD CONSTRAINT "training_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_cup_match_goals_match" ON "public"."cup_match_goals" USING "btree" ("cup_match_id");



CREATE INDEX "idx_cup_matches_cup" ON "public"."cup_matches" USING "btree" ("cup_id");



CREATE INDEX "idx_cup_squad_cup" ON "public"."cup_squad" USING "btree" ("cup_id");



CREATE INDEX "idx_expenses_match" ON "public"."expenses" USING "btree" ("match_id");



CREATE INDEX "idx_expenses_paid_by" ON "public"."expenses" USING "btree" ("paid_by");



CREATE INDEX "idx_match_absences_match" ON "public"."match_absences" USING "btree" ("match_id");



CREATE INDEX "idx_match_coaches_match" ON "public"."match_coaches" USING "btree" ("match_id");



CREATE INDEX "idx_match_goals_match" ON "public"."match_goals" USING "btree" ("match_id");



CREATE INDEX "idx_match_goals_player" ON "public"."match_goals" USING "btree" ("player_id");



CREATE INDEX "idx_match_players_match" ON "public"."match_players" USING "btree" ("match_id");



CREATE INDEX "idx_match_players_player" ON "public"."match_players" USING "btree" ("player_id");



CREATE INDEX "idx_match_stints_match" ON "public"."match_stints" USING "btree" ("match_id");



CREATE INDEX "idx_match_stints_player" ON "public"."match_stints" USING "btree" ("player_id");



CREATE INDEX "idx_matches_date" ON "public"."matches" USING "btree" ("match_date");



CREATE INDEX "idx_matches_season" ON "public"."matches" USING "btree" ("season_id");



CREATE INDEX "idx_training_sessions_period" ON "public"."training_sessions" USING "btree" ("period_id");



CREATE INDEX "player_season_teams_season_idx" ON "public"."player_season_teams" USING "btree" ("season_id");



ALTER TABLE ONLY "public"."cup_match_goals"
    ADD CONSTRAINT "cup_match_goals_cup_match_id_fkey" FOREIGN KEY ("cup_match_id") REFERENCES "public"."cup_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cup_match_goals"
    ADD CONSTRAINT "cup_match_goals_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cup_matches"
    ADD CONSTRAINT "cup_matches_cup_id_fkey" FOREIGN KEY ("cup_id") REFERENCES "public"."cups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cup_squad"
    ADD CONSTRAINT "cup_squad_cup_id_fkey" FOREIGN KEY ("cup_id") REFERENCES "public"."cups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cup_squad"
    ADD CONSTRAINT "cup_squad_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."coaches"("id");



ALTER TABLE ONLY "public"."match_absences"
    ADD CONSTRAINT "match_absences_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_absences"
    ADD CONSTRAINT "match_absences_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_coaches"
    ADD CONSTRAINT "match_coaches_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_coaches"
    ADD CONSTRAINT "match_coaches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_goals"
    ADD CONSTRAINT "match_goals_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_goals"
    ADD CONSTRAINT "match_goals_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."match_players"
    ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_players"
    ADD CONSTRAINT "match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_sessions"
    ADD CONSTRAINT "match_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_stints"
    ADD CONSTRAINT "match_stints_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_stints"
    ADD CONSTRAINT "match_stints_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_season_teams"
    ADD CONSTRAINT "player_season_teams_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_season_teams"
    ADD CONSTRAINT "player_season_teams_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."training_periods"("id") ON DELETE CASCADE;



CREATE POLICY "allow_all" ON "public"."coaches" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."cup_match_goals" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."cup_matches" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."cup_squad" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."cups" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_absences" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_coaches" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_goals" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_players" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_sessions" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."match_stints" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."matches" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."player_season_teams" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."players" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."referees" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."seasons" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."training_exercises" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."training_periods" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all" ON "public"."training_sessions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cup_match_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cup_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cup_squad" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_coaches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_stints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_season_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."coaches" TO "anon";
GRANT ALL ON TABLE "public"."coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."coaches" TO "service_role";



GRANT ALL ON TABLE "public"."cup_match_goals" TO "anon";
GRANT ALL ON TABLE "public"."cup_match_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."cup_match_goals" TO "service_role";



GRANT ALL ON TABLE "public"."cup_matches" TO "anon";
GRANT ALL ON TABLE "public"."cup_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."cup_matches" TO "service_role";



GRANT ALL ON TABLE "public"."cup_squad" TO "anon";
GRANT ALL ON TABLE "public"."cup_squad" TO "authenticated";
GRANT ALL ON TABLE "public"."cup_squad" TO "service_role";



GRANT ALL ON TABLE "public"."cups" TO "anon";
GRANT ALL ON TABLE "public"."cups" TO "authenticated";
GRANT ALL ON TABLE "public"."cups" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."match_absences" TO "anon";
GRANT ALL ON TABLE "public"."match_absences" TO "authenticated";
GRANT ALL ON TABLE "public"."match_absences" TO "service_role";



GRANT ALL ON TABLE "public"."match_coaches" TO "anon";
GRANT ALL ON TABLE "public"."match_coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."match_coaches" TO "service_role";



GRANT ALL ON TABLE "public"."match_goals" TO "anon";
GRANT ALL ON TABLE "public"."match_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."match_goals" TO "service_role";



GRANT ALL ON TABLE "public"."match_players" TO "anon";
GRANT ALL ON TABLE "public"."match_players" TO "authenticated";
GRANT ALL ON TABLE "public"."match_players" TO "service_role";



GRANT ALL ON TABLE "public"."match_sessions" TO "anon";
GRANT ALL ON TABLE "public"."match_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."match_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."match_stints" TO "anon";
GRANT ALL ON TABLE "public"."match_stints" TO "authenticated";
GRANT ALL ON TABLE "public"."match_stints" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."player_season_teams" TO "anon";
GRANT ALL ON TABLE "public"."player_season_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."player_season_teams" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."referees" TO "anon";
GRANT ALL ON TABLE "public"."referees" TO "authenticated";
GRANT ALL ON TABLE "public"."referees" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."training_exercises" TO "anon";
GRANT ALL ON TABLE "public"."training_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."training_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."training_periods" TO "anon";
GRANT ALL ON TABLE "public"."training_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."training_periods" TO "service_role";



GRANT ALL ON TABLE "public"."training_sessions" TO "anon";
GRANT ALL ON TABLE "public"."training_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


