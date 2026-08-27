CREATE TYPE public.approval_mode AS ENUM ('sequential', 'parallel');

ALTER TABLE public.approval_rules
  ADD COLUMN approval_mode public.approval_mode NOT NULL DEFAULT 'sequential';