-- Migration: 068_user_ui_theme.sql
-- Per-user choice of interface design. 'classic' is the existing look (default,
-- so nobody is switched without opting in); 'pro' is the Professional
-- (Northbridge) design. Stored on the account so the preference follows the
-- person across devices.
alter table public.ess_app_users
  add column if not exists ui_theme text not null default 'classic';

alter table public.ess_app_users
  drop constraint if exists ess_app_users_ui_theme_check;
alter table public.ess_app_users
  add constraint ess_app_users_ui_theme_check check (ui_theme in ('classic','pro'));

comment on column public.ess_app_users.ui_theme is
  'Interface design chosen by this user: classic (default) | pro';
