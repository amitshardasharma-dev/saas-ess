-- 061_employee_profile_fields.down.sql (DOWN — reverses 061 up)
alter table ess_employees
  drop column if exists emergency_contact_relationship,
  drop column if exists emergency_contact_phone,
  drop column if exists emergency_contact_name,
  drop column if exists date_of_birth,
  drop column if exists address;
