#!/usr/bin/env python3

import frappe
import json
from datetime import datetime, timedelta
from frappe.utils import now_datetime, add_days, getdate

class FrontendIntegrationTester:
    """
    Frontend Integration Testing Suite
    
    This simulates exactly how the frontend (Next.js) will interact with the Frappe backend.
    All test results and JSON structures can be shared directly with the frontend engineer.
    """
    
    def __init__(self):
        self.test_results = {
            "api_endpoints": {},
            "data_structures": {},
            "workflows": {},
            "real_time_events": [],
            "error_scenarios": {}
        }
        self.setup_test_data()
    
    def setup_test_data(self):
        """Setup comprehensive test data that mimics real-world scenarios"""
        print("\n🏗️  SETTING UP TEST DATA FOR FRONTEND INTEGRATION")
        print("=" * 60)
        
        # Ensure we have test employees
        self.create_test_employees()
        
        # Create test approval rules
        self.create_test_approval_rules()
        
        print("✅ Test data setup complete")
    
    def create_test_employees(self):
        """Use existing test employees - no need to create new ones"""
        # Use existing employees provided by user:
        # guru (password: Phagwara@14) - Employee: EMP000001
        # Jnanesh (password: Phagwara@13) - Employee: EMP000002  
        # sahil (password: Phagwara@13) - Employee: EMP000013
        
        self.test_employees = {
            "guru": "EMP000001",
            "jnanesh": "EMP000002", 
            "sahil": "EMP000013"
        }
        
        print("✅ Using existing test employees:")
        for user, emp_id in self.test_employees.items():
            if frappe.db.exists("Employee", emp_id):
                emp = frappe.get_doc("Employee", emp_id)
                # Employee doctype uses 'first_name' instead of 'employee_name'
                name = getattr(emp, 'first_name', '') or getattr(emp, 'employee_name', '') or emp_id
                print(f"   {user} -> {emp_id} ({name})")
            else:
                print(f"   ⚠️  {user} -> {emp_id} (not found)")
        print()
    
    def create_test_approval_rules(self):
        """Check existing approval rules - don't create new ones"""
        existing_rules = frappe.get_all("Leave Approval Rule", fields=["name", "leave_type", "department", "active"])
        
        print(f"✅ Found {len(existing_rules)} existing approval rules:")
        for rule in existing_rules:
            print(f"   {rule.name}: {rule.leave_type} - {rule.department or 'All Departments'} ({'Active' if rule.active else 'Inactive'})")
        
        if not existing_rules:
            print("   ⚠️  No approval rules found - you may need to create some for testing")
        print()
    
    def test_employee_dashboard_apis(self):
        """Test APIs used by Employee Dashboard"""
        print("\n👤 TESTING EMPLOYEE DASHBOARD APIs")
        print("=" * 50)
        
        # Use real test employee
        employee = "EMP000001"  # guru's employee ID
        
        # 1. Get Employee's Leave Applications
        print("\n📋 API: Get Employee Leave Applications")
        leave_applications = frappe.get_all(
            "Leave Application",
            filters={"link_lmbb": employee},  # Employee field is named "link_lmbb"
            fields=[
                "name", "leave_type", "from_date", "till_date",  # "till_date" not "to_date"
                "total_leave_days", "workflow_state", "creation",
                "leave_reason", "half_day", "half_day_date"  # "leave_reason" not "reason"
            ],
            order_by="creation desc"
        )
        
        self.test_results["api_endpoints"]["employee_leave_applications"] = {
            "endpoint": "/api/resource/Leave Application",
            "method": "GET",
            "filters": {"link_lmbb": employee},  # Employee field is "link_lmbb"
            "response_example": leave_applications[:3] if leave_applications else []
        }
        
        print(f"✅ Found {len(leave_applications)} leave applications")
        
        # 2. Get Available Leave Types
        print("\n🏷️  API: Get Available Leave Types")
        leave_types = frappe.get_all(
            "Leave Type",
            fields=["name", "bc_leave_code", "description", "leave_type", "eligible_days"]  # Use actual field names
        )
        
        self.test_results["api_endpoints"]["leave_types"] = {
            "endpoint": "/api/resource/Leave Type",
            "method": "GET", 
            "response_example": leave_types
        }
        
        print(f"✅ Found {len(leave_types)} leave types")
    
    def test_leave_submission_workflow(self):
        """Test complete leave submission workflow"""
        print("\n📤 TESTING LEAVE SUBMISSION WORKFLOW")
        print("=" * 50)
        
        # 1. Preview Approval Chain Before Submission
        print("\n🔍 API: Preview Approval Chain")
        preview_data = {
            "employee": "EMP000001",  # guru's employee ID
            "leave_type": "Annual Leave",
            "total_leave_days": 5,
            "from_date": "2024-01-15",
            "to_date": "2024-01-19"
        }
        
        try:
            # This calls our custom API
            preview_result = frappe.call(
                "hr_portal.hr.doctype.leave_application.leave_application_api.preview_approval_chain",
                **preview_data
            )
            
            self.test_results["api_endpoints"]["preview_approval_chain"] = {
                "endpoint": "/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.preview_approval_chain",
                "method": "POST",
                "payload": preview_data,
                "response_example": preview_result
            }
            
            print("✅ Approval chain preview successful")
            print(f"   Levels: {len(preview_result.get('approval_chain', []))}")
            
        except Exception as e:
            print(f"❌ Preview failed: {str(e)}")
            self.test_results["error_scenarios"]["preview_approval_chain"] = str(e)
        
        # 2. Submit Leave Application
        print("\n📝 API: Submit Leave Application")
        leave_data = {
            "doctype": "Leave Application",
            "link_lmbb": "EMP000001",  # guru's employee ID - field name is "link_lmbb"
            "leave_type": "Annual Leave",
            "from_date": "2024-01-15",
            "till_date": "2024-01-19",   # field name is "till_date"
            "total_leave_days": 5,
            "leave_reason": "Family vacation",  # field name is "leave_reason"
            "half_day": 0
        }
        
        try:
            leave_app = frappe.get_doc(leave_data)
            leave_app.insert(ignore_permissions=True)
            leave_app.submit()
            
            # Get the complete submitted document
            submitted_doc = frappe.get_doc("Leave Application", leave_app.name)
            
            self.test_results["api_endpoints"]["submit_leave_application"] = {
                "endpoint": "/api/resource/Leave Application",
                "method": "POST",
                "payload": leave_data,
                "response_example": {
                    "name": submitted_doc.name,
                    "workflow_state": submitted_doc.workflow_state,
                    "approval_entries": [
                        {
                            "level_no": entry.level_no,
                            "approver": entry.approver,
                            "status": entry.status,
                            "sla_deadline": entry.sla_deadline
                        } for entry in submitted_doc.leave_approval_entry  # field name is "leave_approval_entry"
                    ]
                }
            }
            
            print(f"✅ Leave application submitted: {leave_app.name}")
            print(f"   Workflow State: {submitted_doc.workflow_state}")
            print(f"   Approval Levels: {len(submitted_doc.leave_approval_entry)}")  # field name is "leave_approval_entry"
            
            self.test_leave_doc_name = leave_app.name
            
        except Exception as e:
            print(f"❌ Submission failed: {str(e)}")
            self.test_results["error_scenarios"]["submit_leave_application"] = str(e)
    
    def test_manager_dashboard_apis(self):
        """Test APIs used by Manager Dashboard"""
        print("\n👔 TESTING MANAGER DASHBOARD APIs")
        print("=" * 50)
        
        # Use real test employee as manager
        manager = "EMP000002"  # Jnanesh's employee ID
        
        # 1. Get Pending Approvals
        print("\n⏳ API: Get Pending Approvals")
        try:
            pending_approvals = frappe.call(
                "hr_portal.hr.doctype.leave_application.leave_application_api.get_pending_approvals",
                approver=manager
            )
            
            self.test_results["api_endpoints"]["pending_approvals"] = {
                "endpoint": "/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_pending_approvals",
                "method": "POST",
                "payload": {"approver": manager},
                "response_example": pending_approvals
            }
            
            print(f"✅ Found {len(pending_approvals)} pending approvals")
            
        except Exception as e:
            print(f"❌ Get pending approvals failed: {str(e)}")
            self.test_results["error_scenarios"]["pending_approvals"] = str(e)
    
    def test_approval_workflow_apis(self):
        """Test approval/rejection workflow APIs"""
        print("\n✅ TESTING APPROVAL WORKFLOW APIs")
        print("=" * 50)
        
        if not hasattr(self, 'test_leave_doc_name'):
            print("⚠️  No test leave application available for approval testing")
            return
        
        # 1. Approve Leave Application
        print("\n👍 API: Approve Leave Application")
        try:
            approval_result = frappe.call(
                "hr_portal.hr.doctype.leave_application.leave_application_api.approve_leave",
                leave_application=self.test_leave_doc_name,
                approver="EMP000002",  # Jnanesh as approver
                action="Approve",
                remarks="Approved for family vacation"
            )
            
            self.test_results["api_endpoints"]["approve_leave"] = {
                "endpoint": "/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.approve_leave",
                "method": "POST",
                "payload": {
                    "leave_application": self.test_leave_doc_name,
                    "approver": "EMP000002",  # Jnanesh as approver
                    "action": "Approve",
                    "remarks": "Approved for family vacation"
                },
                "response_example": approval_result
            }
            
            print("✅ Leave approval successful")
            print(f"   New State: {approval_result.get('workflow_state')}")
            
        except Exception as e:
            print(f"❌ Approval failed: {str(e)}")
            self.test_results["error_scenarios"]["approve_leave"] = str(e)
    
    def generate_frontend_specification(self):
        """Generate complete frontend specification document"""
        print("\n📋 GENERATING FRONTEND SPECIFICATION")
        print("=" * 50)
        
        specification = {
            "api_base_url": frappe.utils.get_url(),
            "authentication": {
                "method": "Token-based",
                "header": "Authorization: token <api_key>:<api_secret>",
                "login_endpoint": "/api/method/login"
            },
            "api_endpoints": self.test_results["api_endpoints"],
            "error_handling": self.test_results["error_scenarios"],
            "workflows": {
                "employee_leave_submission": [
                    "1. Preview approval chain",
                    "2. Submit leave application", 
                    "3. Real-time notification to approvers",
                    "4. Track approval status"
                ],
                "manager_approval_process": [
                    "1. Get pending approvals",
                    "2. Review leave details",
                    "3. Approve/Reject with remarks",
                    "4. System processes next level or completion"
                ]
            }
        }
        
        return specification
    
    def run_all_tests(self):
        """Run all frontend integration tests"""
        print("\n🚀 STARTING FRONTEND INTEGRATION TESTING")
        print("=" * 60)
        print("This simulates exactly how the Next.js frontend will interact with Frappe")
        print("=" * 60)
        
        try:
            # Test all workflows
            self.test_employee_dashboard_apis()
            self.test_leave_submission_workflow()
            self.test_manager_dashboard_apis()
            self.test_approval_workflow_apis()
            
            # Generate final specification
            specification = self.generate_frontend_specification()
            
            print("\n" + "=" * 60)
            print("🎉 FRONTEND INTEGRATION TESTING COMPLETE")
            print("=" * 60)
            print("\n📊 SUMMARY:")
            print(f"   API Endpoints Tested: {len(self.test_results['api_endpoints'])}")
            print(f"   Error Scenarios: {len(self.test_results['error_scenarios'])}")
            
            print("\n📋 NEXT STEPS FOR FRONTEND ENGINEER:")
            print("   1. Use the API endpoints and data structures documented above")
            print("   2. Implement error handling for all documented scenarios")
            print("   3. Set up real-time WebSocket connections for notifications")
            print("   4. Test against this Frappe backend using the exact API calls shown")
            
            return specification
            
        except Exception as e:
            print(f"\n❌ TESTING FAILED: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

def run_frontend_integration_tests():
    """Main function to run frontend integration tests"""
    tester = FrontendIntegrationTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    # Run tests when script is executed directly
    result = run_frontend_integration_tests()
    
    if result:
        # Save results to file for frontend engineer
        with open("/tmp/frontend_integration_spec.json", "w") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\n📄 Complete specification saved to: /tmp/frontend_integration_spec.json")
        print("   Share this file with your frontend engineer!") 