alter table public.ess_app_users drop constraint if exists ess_app_users_ui_theme_check;
alter table public.ess_app_users drop column if exists ui_theme;
