-- Cierra la Data API de EduControl.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de desplegar la app
-- y de definir SUPABASE_SERVICE_ROLE_KEY en el servidor.
-- Las tablas quedan inaccesibles para anon y authenticated.
-- El servidor sigue entrando con service_role, que no pasa por estas políticas.

CREATE TABLE IF NOT EXISTS public.auth_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Tabla omitida: %', table_name;
    END;
  END LOOP;
END $$;

DO $$
DECLARE
  view_name text;
BEGIN
  FOR view_name IN
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', view_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Función omitida: %', fn;
    END;
  END LOOP;
END $$;
