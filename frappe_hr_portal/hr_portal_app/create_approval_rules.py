import frappe

frappe.init(site='hr.portal')
frappe.connect()

print('🏗️  CREATING TEST APPROVAL RULES FOR FRONTEND INTEGRATION')
print('=' * 60)

# Get available leave types
leave_types = frappe.get_all('Leave Type', fields=['name', 'bc_leave_code'])
print(f'✅ Found {len(leave_types)} leave types')

# Check employees exist
employees = ['EMP000001', 'EMP000002', 'EMP000013']
for emp in employees:
    if frappe.db.exists('Employee', emp):
        emp_doc = frappe.get_doc('Employee', emp)
        print(f'✅ Employee {emp}: {getattr(emp_doc, "first_name", emp)}')
    else:
        print(f'❌ Employee {emp} not found')

print('\n📋 CREATING APPROVAL RULES:')

# Rule 1: LEAVETYPE02 (CL - Casual Leave) - 1 level
rule1_exists = frappe.db.exists('Leave Approval Rule', {'leave_type': 'LEAVETYPE02'})
if not rule1_exists:
    try:
        rule1 = frappe.get_doc({
            'doctype': 'Leave Approval Rule',
            'leave_type': 'LEAVETYPE02',
            'min_days': 0,
            'max_days': 999,
            'active': 1,
            'approval_levels': [
                {
                    'level_no': 1,
                    'approver_type': 'Employee',
                    'approver_employee': 'EMP000002',
                    'sla_days': 1,
                    'delegate_to_employee': 'EMP000013',
                    'mandatory': 1
                }
            ]
        })
        rule1.insert(ignore_permissions=True)
        print(f'✅ Created: {rule1.name} for LEAVETYPE02 (Casual Leave)')
        print(f'   Approver: EMP000002 (Jnanesh)')
        print(f'   Levels: 1, SLA: 1 day')
    except Exception as e:
        print(f'❌ Failed to create rule for LEAVETYPE02: {str(e)}')
else:
    print('⚠️  Rule for LEAVETYPE02 already exists')

# Rule 2: LEAVETYPE01 (AL - Annual Leave) - 2 levels
rule2_exists = frappe.db.exists('Leave Approval Rule', {'leave_type': 'LEAVETYPE01'})
if not rule2_exists:
    try:
        rule2 = frappe.get_doc({
            'doctype': 'Leave Approval Rule',
            'leave_type': 'LEAVETYPE01',
            'min_days': 0,
            'max_days': 999,
            'active': 1,
            'approval_levels': [
                {
                    'level_no': 1,
                    'approver_type': 'Employee',
                    'approver_employee': 'EMP000002',
                    'sla_days': 2,
                    'delegate_to_employee': 'EMP000013',
                    'mandatory': 1
                },
                {
                    'level_no': 2,
                    'approver_type': 'Employee',
                    'approver_employee': 'EMP000013',
                    'sla_days': 3,
                    'mandatory': 1
                }
            ]
        })
        rule2.insert(ignore_permissions=True)
        print(f'✅ Created: {rule2.name} for LEAVETYPE01 (Annual Leave)')
        print(f'   Level 1: EMP000002 (Jnanesh), SLA: 2 days')
        print(f'   Level 2: EMP000013 (Sahil), SLA: 3 days')
    except Exception as e:
        print(f'❌ Failed to create rule for LEAVETYPE01: {str(e)}')
else:
    print('⚠️  Rule for LEAVETYPE01 already exists')

# Rule 3: LEAVETYPE08 (SL - Sick Leave) - 1 level
rule3_exists = frappe.db.exists('Leave Approval Rule', {'leave_type': 'LEAVETYPE08'})
if not rule3_exists:
    try:
        rule3 = frappe.get_doc({
            'doctype': 'Leave Approval Rule',
            'leave_type': 'LEAVETYPE08',
            'min_days': 0,
            'max_days': 999,
            'active': 1,
            'approval_levels': [
                {
                    'level_no': 1,
                    'approver_type': 'Employee',
                    'approver_employee': 'EMP000002',
                    'sla_days': 1,
                    'delegate_to_employee': 'EMP000013',
                    'mandatory': 1
                }
            ]
        })
        rule3.insert(ignore_permissions=True)
        print(f'✅ Created: {rule3.name} for LEAVETYPE08 (Sick Leave)')
        print(f'   Approver: EMP000002 (Jnanesh)')
        print(f'   Levels: 1, SLA: 1 day')
    except Exception as e:
        print(f'❌ Failed to create rule for LEAVETYPE08: {str(e)}')
else:
    print('⚠️  Rule for LEAVETYPE08 already exists')

print('\n🧪 TESTING LEAVE SUBMISSION WITH APPROVAL RULES:')

# Test leave submission
try:
    test_leave = frappe.get_doc({
        'doctype': 'Leave Application',
        'link_lmbb': 'EMP000001',
        'leave_type': 'LEAVETYPE02',
        'from_date': '2024-12-20',
        'till_date': '2024-12-20',
        'total_leave_days': 1,
        'leave_reason': 'Frontend integration test - approval workflow',
        'half_day': 0
    })
    test_leave.insert(ignore_permissions=True)
    test_leave.submit()
    
    test_leave.reload()
    print(f'✅ Test leave created: {test_leave.name}')
    print(f'   Initial state: {test_leave.workflow_state}')
    print(f'   Approval entries: {len(test_leave.leave_approval_entry)}')
    
    if test_leave.leave_approval_entry:
        for entry in test_leave.leave_approval_entry:
            print(f'     Level {entry.level_no}: {entry.approver} ({entry.status})')
            if entry.sla_deadline:
                print(f'       SLA: {entry.sla_deadline}')
    
except Exception as e:
    print(f'❌ Test leave submission failed: {str(e)}')

print('\n🎉 APPROVAL RULES SETUP COMPLETE!')
print('=' * 50)

# Final summary
all_rules = frappe.get_all('Leave Approval Rule', fields=['name', 'leave_type', 'active'])
print(f'📊 Total approval rules: {len(all_rules)}')
for rule in all_rules:
    print(f'   {rule.name}: {rule.leave_type} ({"Active" if rule.active else "Inactive"})')

print('\n📋 FRONTEND ENGINEER CAN NOW TEST:')
print('   1. Login as guru (EMP000001)')
print('   2. Submit leave applications for LEAVETYPE01, LEAVETYPE02, LEAVETYPE08')
print('   3. Login as Jnanesh (EMP000002) to see pending approvals')
print('   4. Approve/reject leaves to test complete workflow')
print('   5. Use all APIs with real approval data!') 