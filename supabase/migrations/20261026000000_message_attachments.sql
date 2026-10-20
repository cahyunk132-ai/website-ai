-- Attachments share the message's existing conversation ownership/RLS rules.
-- Inline generated files are bounded to 1 MiB per artifact in the tool layer.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments jsonb;
