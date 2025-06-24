#!/usr/bin/env python3

"""
Test script for Phase 1: Schema Completion
Tests all the newly created DocTypes and field updates
"""

import os
import sys
import json

def test_doctype_files():
    """Test that all DocType JSON files are valid and complete"""
    print("🧪 Testing Phase 1 Schema Completion...")
    
    doctypes_to_test = [
        ("Team", "apps/hr_portal/hr_portal/hr/doctype/team/team.json"),
        ("Leave Approval Level", "apps/hr_portal/hr_portal/hr/doctype/leave_approval_level/leave_approval_level.json"),
        ("Leave Approval Entry", "apps/hr_portal/hr_portal/hr/doctype/leave_approval_entry/leave_approval_entry.json"),
        ("Leave Escalation Log", "apps/hr_portal/hr_portal/hr/doctype/leave_escalation_log/leave_escalation_log.json"),
        ("Leave Application", "apps/hr_portal/hr_portal/hr/doctype/leave_application/leave_application.json"),
    ]
    
    for doctype_name, file_path in doctypes_to_test:
        try:
            if not os.path.exists(file_path):
                print(f"❌ {doctype_name}: File not found at {file_path}")
                continue
                
            with open(file_path, 'r') as f:
                doctype_config = json.load(f)
            
            # Basic validation
            if doctype_config.get("name") != doctype_name:
                print(f"❌ {doctype_name}: Name mismatch in JSON")
                continue
                
            if not doctype_config.get("fields"):
                print(f"❌ {doctype_name}: No fields defined")
                continue
                
            print(f"✅ {doctype_name}: JSON structure valid ({len(doctype_config['fields'])} fields)")
            
        except json.JSONDecodeError as e:
            print(f"❌ {doctype_name}: Invalid JSON - {str(e)}")
        except Exception as e:
            print(f"❌ {doctype_name}: Error - {str(e)}")
    
    # Test specific requirements
    print("\n🔍 Testing Specific Requirements...")
    
    # Test Leave Approval Level has delegation fields
    try:
        with open("apps/hr_portal/hr_portal/hr/doctype/leave_approval_level/leave_approval_level.json", 'r') as f:
            lal_config = json.load(f)
        
        required_fields = ["level_no", "approver_type", "sla_days", "delegate_to_employee", "delegate_to_role", "mandatory"]
        field_names = [field["fieldname"] for field in lal_config["fields"]]
        
        missing_fields = [field for field in required_fields if field not in field_names]
        if missing_fields:
            print(f"❌ Leave Approval Level: Missing required fields: {missing_fields}")
        else:
            print("✅ Leave Approval Level: All delegation fields present")
            
    except Exception as e:
        print(f"❌ Leave Approval Level: Field validation error - {str(e)}")
    
    # Test Leave Application has workflow fields
    try:
        with open("apps/hr_portal/hr_portal/hr/doctype/leave_application/leave_application.json", 'r') as f:
            la_config = json.load(f)
        
        required_fields = ["team", "workflow_state", "leave_approval_entry", "leave_escalation_log"]
        field_names = [field["fieldname"] for field in la_config["fields"]]
        
        missing_fields = [field for field in required_fields if field not in field_names]
        if missing_fields:
            print(f"❌ Leave Application: Missing workflow fields: {missing_fields}")
        else:
            print("✅ Leave Application: All workflow fields present")
            
    except Exception as e:
        print(f"❌ Leave Application: Field validation error - {str(e)}")
    
    print("\n🎉 Phase 1 Schema Test Completed!")

if __name__ == "__main__":
    test_doctype_files() 