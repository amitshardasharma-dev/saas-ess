#!/usr/bin/env python3

import frappe

def test_team_doctype():
    """Test the Team DocType functionality"""
    frappe.init(site="hr.portal")
    frappe.connect()
    
    try:
        print("🧪 Testing Team DocType...")
        
        # Check if Team DocType exists
        if frappe.db.exists("DocType", "Team"):
            print("✅ Team DocType exists in database")
        else:
            print("❌ Team DocType not found in database")
            return
        
        # Try to create a test team
        test_team = frappe.get_doc({
            "doctype": "Team",
            "team_name": "Test Development Team",
            "department": "Engineering",  # This might need to be adjusted based on existing departments
            "description": "Test team for validation"
        })
        
        # Check if we can save it
        test_team.insert(ignore_permissions=True)
        print(f"✅ Successfully created test team: {test_team.name}")
        
        # Try to fetch it back
        fetched_team = frappe.get_doc("Team", test_team.name)
        print(f"✅ Successfully fetched team: {fetched_team.team_name}")
        
        # Clean up - delete the test record
        frappe.delete_doc("Team", test_team.name, ignore_permissions=True)
        print("✅ Test team deleted successfully")
        
        print("🎉 Team DocType test completed successfully!")
        
    except Exception as e:
        print(f"❌ Error testing Team DocType: {str(e)}")
        import traceback
        traceback.print_exc()
    
    finally:
        frappe.db.commit()
        frappe.destroy()

if __name__ == "__main__":
    test_team_doctype() 