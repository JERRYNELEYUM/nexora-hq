
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS description text;
