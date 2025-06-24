#!/usr/bin/env python3

# Test script for get_approved_by_user API
# Run this in Frappe console: bench --site hr.portal execute test_approved_api_console.py

import frappe
from hr_portal.hr.doctype.leave_application.leave_application_api import get_approved_by_user

def test_api():
    """Test the get_approved_by_user API for different users"""
    
    print("🚀 Testing get_approved_by_user API")
    print("=" * 50)
    
    # Test users who should have approved leaves
    test_users = ["jnanesh", "guru", "sahil"]
    
    for username in test_users:
        print(f"\n{'='*20} Testing {username.upper()} {'='*20}")
        
        try:
            # Set the user context
            frappe.set_user(username)
            
            # Call the API
            result = get_approved_by_user(username)
            
            print(f"✅ API call successful for {username}")
            print(f"📊 Found {len(result)} leave applications approved by {username}")
            
            if result:
                print("\n📋 Approved Leave Applications:")
                for i, leave in enumerate(result, 1):
                    print(f"\n{i}. Leave Application: {leave['name']}")
                    print(f"   Employee: {leave['employee_name']} ({leave['employee']})")
                    print(f"   Leave Type: {leave['leave_type']}")
                    print(f"   Duration: {leave['from_date']} to {leave['till_date']} ({leave['total_days']} days)")
                    print(f"   Reason: {leave['reason']}")
                    print(f"   Current Status: {leave['workflow_state']} / {leave['leave_status']}")
                    print(f"   Approved at Level: {leave['approved_level']}")
                    print(f"   Approval Time: {leave['approval_time']}")
                    if leave['approval_remarks']:
                        print(f"   Approval Remarks: {leave['approval_remarks']}")
            else:
                print(f"ℹ️  No leave applications have been approved by {username} yet")
                
        except Exception as e:
            print(f"❌ Error testing {username}: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print(f"\n{'='*50}")
    print("✅ Testing completed!")

if __name__ == "__main__":
    test_api() 