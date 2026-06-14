-- 061_employee_profile_fields.sql (UP)
-- Volunteer-editable profile fields so "Complete your profile (contact details +
-- emergency contact)" has somewhere to store real data and can auto-complete from
-- it. Additive + nullable — existing rows + old code are unaffected.
-- DOWN: 061_employee_profile_fields.down.sql

alter table ess_employees
  add column if not exists address text,
  add column if not exists date_of_birth date,
  add column if not exists emergency_contact_name varchar(200),
  add column if not exists emergency_contact_phone varchar(50),
  add column if not exists emergency_contact_relationship varchar(100);
