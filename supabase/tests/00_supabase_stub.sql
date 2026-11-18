-- =============================================================================
-- 00_supabase_stub.sql
--
-- Minimal emulation of what a hosted Supabase project provides out of the box,
-- so supabase/migrations/*.sql can be applied to a plain Postgres 16 for tests.
--
-- NOT a faithful copy of Supabase internals -- just enough surface for the
-- migrations and RLS tests: roles, auth / storage / extensions schemas,
-- auth.users + auth.uid()/role()/jwt(), storage.buckets/objects + path helpers,
-- the supabase_realtime publication, and no-op stubs for pg_net and vault.
--
-- Test-only. Never run this against a real Supabase project.
-- =============================================================================

\set ON_ERROR_STOP 1
SET client_min_messages = warning;


-- -----------------------------------------------------------------------------
-- 1 · Roles (cluster-wide, so create only if missing)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
  END IF;
END $$;

-- PostgREST connects as authenticator and SET ROLEs into these.
GRANT anon, authenticated, service_role TO authenticator;
-- Let the (superuser) test runner SET ROLE freely as well.
GRANT anon, authenticated, service_role TO postgres;


-- -----------------------------------------------------------------------------
-- 2 · Schemas + extensions
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS vault;

CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
-- gen_random_uuid() is core since PG 13; pgcrypto/uuid-ossp live in
-- `extensions` as on Supabase, which keeps that schema on the search_path.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = "$user", public, extensions',
                 current_database());
END $$;
SET search_path = "$user", public, extensions;

GRANT USAGE ON SCHEMA public, extensions, auth, storage
  TO anon, authenticated, service_role;

-- Supabase default privileges: tables / functions / sequences created in
-- `public` by postgres are granted to the API roles; RLS does the narrowing.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3 · auth schema
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id          uuid,
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud                  varchar(255) DEFAULT 'authenticated',
  role                 varchar(255) DEFAULT 'authenticated',
  email                varchar(255),
  encrypted_password   varchar(255),
  email_confirmed_at   timestamptz,
  invited_at           timestamptz,
  confirmation_token   varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token       varchar(255),
  recovery_sent_at     timestamptz,
  last_sign_in_at      timestamptz,
  raw_app_meta_data    jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data   jsonb DEFAULT '{}'::jsonb,
  is_super_admin       boolean,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  phone                text UNIQUE,
  phone_confirmed_at   timestamptz,
  confirmed_at         timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  banned_until         timestamptz,
  deleted_at           timestamptz,
  is_sso_user          boolean NOT NULL DEFAULT false,
  is_anonymous         boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key
  ON auth.users (email) WHERE is_sso_user = false;

-- Same definitions as Supabase GoTrue: read the PostgREST request settings,
-- preferring the legacy per-claim GUC, falling back to the claims JSON.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
  TO anon, authenticated, service_role;
-- Supabase does not expose auth.users to the API roles.
REVOKE ALL ON auth.users FROM anon, authenticated;
GRANT ALL ON auth.users TO service_role;


-- -----------------------------------------------------------------------------
-- 4 · storage schema
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  owner_id           text,
  public             boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bname ON storage.buckets (name);

CREATE TABLE IF NOT EXISTS storage.objects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id        text REFERENCES storage.buckets (id),
  name             text,
  owner            uuid,
  owner_id         text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata         jsonb,
  user_metadata    jsonb,
  version          text,
  path_tokens      text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects (bucket_id, name);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;

-- Path helpers, same semantics as the storage-api migrations.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;

GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text), storage.extension(text)
  TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5 · Realtime publication
-- -----------------------------------------------------------------------------
-- (wal_level is usually not 'logical' locally; silence that WARNING.)
SET client_min_messages = error;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
SET client_min_messages = warning;


-- -----------------------------------------------------------------------------
-- 6 · No-op stubs: pg_net and vault
-- -----------------------------------------------------------------------------
-- pg_net queues an async HTTP request and returns its id. Here it records the
-- call so tests can assert on it, and never touches the network.
CREATE TABLE IF NOT EXISTS net.http_request_queue (
  id                   bigserial PRIMARY KEY,
  method               text NOT NULL,
  url                  text NOT NULL,
  headers              jsonb,
  body                 jsonb,
  timeout_milliseconds integer,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION net.http_post(
  url                  text,
  body                 jsonb   DEFAULT '{}'::jsonb,
  params               jsonb   DEFAULT '{}'::jsonb,
  headers              jsonb   DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint
LANGUAGE sql VOLATILE AS $$
  INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  VALUES ('POST', url, headers, body, timeout_milliseconds)
  RETURNING id
$$;

CREATE OR REPLACE FUNCTION net.http_get(
  url                  text,
  params               jsonb   DEFAULT '{}'::jsonb,
  headers              jsonb   DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint
LANGUAGE sql VOLATILE AS $$
  INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  VALUES ('GET', url, headers, params, timeout_milliseconds)
  RETURNING id
$$;

-- vault: plain-text stand-in (no encryption -- test data only).
CREATE TABLE IF NOT EXISTS vault.secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE,
  description text NOT NULL DEFAULT '',
  secret      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret, secret AS decrypted_secret, created_at, updated_at
    FROM vault.secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret      text,
  new_name        text DEFAULT NULL,
  new_description text DEFAULT ''
) RETURNS uuid
LANGUAGE sql VOLATILE AS $$
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (new_secret, new_name, coalesce(new_description, ''))
  RETURNING id
$$;
