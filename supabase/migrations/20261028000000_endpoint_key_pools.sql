-- Keep legacy encrypted_key as a compatible first-key mirror.
-- New endpoint key pools inherit the service-role-only access of ai_endpoints.
alter table public.ai_endpoints add column if not exists encrypted_keys jsonb;
update public.ai_endpoints
set encrypted_keys = jsonb_build_array(encrypted_key)
where encrypted_keys is null;
