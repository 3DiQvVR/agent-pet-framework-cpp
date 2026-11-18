CREATE TABLE IF NOT EXISTS pet_sessions (
 owner text NOT NULL, id text NOT NULL, card text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner,id));
CREATE TABLE IF NOT EXISTS pet_messages (
 owner text NOT NULL, session_id text NOT NULL, seq integer NOT NULL CHECK(seq>0), data jsonb NOT NULL,
 PRIMARY KEY(owner,session_id,seq), FOREIGN KEY(owner,session_id) REFERENCES pet_sessions(owner,id));
CREATE TABLE IF NOT EXISTS pet_facts (
 owner text NOT NULL, scope text NOT NULL, key text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owner,scope,key));
CREATE TABLE IF NOT EXISTS pet_cards (
 owner text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(owner,id));
CREATE TABLE IF NOT EXISTS pet_file_cards (
 owner text NOT NULL, filename text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(owner,filename));
CREATE TABLE IF NOT EXISTS pet_imports (
 owner text PRIMARY KEY, digest text NOT NULL, imported_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS pet_turns (
 owner text NOT NULL, request_id uuid NOT NULL, session_id text NOT NULL, input text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(owner,request_id));
CREATE TABLE IF NOT EXISTS pet_usage (owner text NOT NULL, day date NOT NULL, attempts integer NOT NULL, PRIMARY KEY(owner,day));
