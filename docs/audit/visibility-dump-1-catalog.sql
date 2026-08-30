-- ============================================================================
-- Koncept Studio — read-only visibility dump 1/2 (database catalog)
-- Safe to run: contains ONLY SELECT statements against system catalogs.
-- Run in Supabase Dashboard -> SQL Editor, then copy the single result cell
-- (or use "Export" / download) and paste it back.
-- ============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'meta', jsonb_build_object(
     'db', current_database(),
     'pg_version', version(),
     'generated_at', now()
  ),
  'extensions', (
     SELECT jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) ORDER BY extname)
     FROM pg_extension
  ),
  'functions_public', (
     SELECT jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'security_definer', p.prosecdef,
        'volatility', p.provolatile,
        'proconfig', p.proconfig,
        'acl', p.proacl::text,
        'definition', pg_get_functiondef(p.oid)
     ) ORDER BY p.proname)
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  ),
  'triggers_public_and_auth', (
     SELECT jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'name', t.tgname,
        'enabled', t.tgenabled,
        'definition', pg_get_triggerdef(t.oid)
     ) ORDER BY n.nspname, c.relname, t.tgname)
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public','auth') AND NOT t.tgisinternal
  ),
  'rls_policies', (
     SELECT jsonb_agg(to_jsonb(pol) ORDER BY pol.tablename, pol.policyname)
     FROM pg_policies pol
     WHERE pol.schemaname = 'public'
  ),
  'rls_enabled', (
     SELECT jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity
     ) ORDER BY c.relname)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  'constraints', (
     SELECT jsonb_agg(jsonb_build_object(
        'table', conrelid::regclass::text,
        'name', conname,
        'definition', pg_get_constraintdef(oid)
     ) ORDER BY conrelid::regclass::text, conname)
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
  ),
  'indexes', (
     SELECT jsonb_agg(jsonb_build_object(
        'table', tablename, 'name', indexname, 'definition', indexdef
     ) ORDER BY tablename, indexname)
     FROM pg_indexes WHERE schemaname = 'public'
  ),
  'views', (
     SELECT jsonb_agg(jsonb_build_object('view', viewname, 'definition', definition) ORDER BY viewname)
     FROM pg_views WHERE schemaname = 'public'
  ),
  'columns', (
     SELECT jsonb_agg(jsonb_build_object(
        'table', table_name, 'column', column_name, 'type', data_type,
        'default', column_default, 'nullable', is_nullable
     ) ORDER BY table_name, ordinal_position)
     FROM information_schema.columns WHERE table_schema = 'public'
  ),
  'table_grants', (
     SELECT jsonb_agg(jsonb_build_object(
        'table', table_name, 'grantee', grantee, 'privilege', privilege_type
     ) ORDER BY table_name, grantee, privilege_type)
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon','authenticated','service_role')
  ),
  'function_grants', (
     SELECT jsonb_agg(jsonb_build_object(
        'function', routine_name, 'grantee', grantee, 'privilege', privilege_type
     ) ORDER BY routine_name, grantee)
     FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND grantee IN ('anon','authenticated','service_role')
  )
));
