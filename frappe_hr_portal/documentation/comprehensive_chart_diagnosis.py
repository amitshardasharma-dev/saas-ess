import frappe
import json
import os

def comprehensive_chart_diagnosis():
    print("=" * 60)
    print("COMPREHENSIVE CHART DIAGNOSIS FOR guru@ulx.in")
    print("=" * 60)
    
    issues_found = []
    
    # Test 1: Basic User and Role Check
    print("\n🔍 TEST 1: USER AND ROLES")
    print("-" * 30)
    try:
        user_roles = frappe.get_roles('guru@ulx.in')
        print(f"✅ User roles: {user_roles}")
        
        if 'System Manager' in user_roles:
            print("⚠️  WARNING: User has System Manager role - chart should be visible")
        
        required_roles = ['Hr User', 'Leave Approver', 'Leave Applier', 'Employee']
        has_required = any(role in user_roles for role in required_roles)
        
        if has_required:
            print("✅ User has required HR roles")
        else:
            print("❌ ISSUE: User missing required HR roles")
            issues_found.append("User missing required HR roles")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"User check failed: {e}")
    
    # Test 2: Dashboard Chart Document Check
    print("\n🔍 TEST 2: DASHBOARD CHART DOCUMENT")
    print("-" * 30)
    try:
        chart = frappe.get_doc("Dashboard Chart", "Leave Type")
        print(f"✅ Chart exists: {chart.name}")
        print(f"   Owner: {chart.owner}")
        print(f"   Chart Type: {chart.chart_type}")
        print(f"   Source: {chart.source}")
        print(f"   Is Standard: {getattr(chart, 'is_standard', 'Not set')}")
        
        # Test user access to this specific chart
        frappe.set_user("guru@ulx.in")
        try:
            chart_access = frappe.get_doc("Dashboard Chart", "Leave Type")
            print("✅ guru@ulx.in CAN access Dashboard Chart document")
        except frappe.PermissionError:
            print("❌ ISSUE: guru@ulx.in CANNOT access Dashboard Chart document")
            issues_found.append("No access to Dashboard Chart document")
        except Exception as e:
            print(f"❌ ERROR accessing chart: {e}")
            issues_found.append(f"Chart access error: {e}")
        finally:
            frappe.set_user("Administrator")
            
    except frappe.DoesNotExistError:
        print("❌ CRITICAL: Dashboard Chart 'Leave Type' does not exist")
        issues_found.append("Dashboard Chart 'Leave Type' missing")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"Dashboard Chart check failed: {e}")
    
    # Test 3: Dashboard Chart Source Check
    print("\n🔍 TEST 3: DASHBOARD CHART SOURCE")
    print("-" * 30)
    try:
        source = frappe.get_doc("Dashboard Chart Source", "Leave Type")
        print(f"✅ Chart Source exists: {source.name}")
        
        # Test data generation as guru
        frappe.set_user("guru@ulx.in")
        try:
            from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
            result = get()
            print(f"✅ Chart data generated successfully")
            print(f"   Labels: {result.get('labels', [])}")
            print(f"   Datasets: {len(result.get('datasets', []))}")
        except Exception as e:
            print(f"❌ ISSUE: Chart data generation failed: {e}")
            issues_found.append(f"Chart data generation failed: {e}")
        finally:
            frappe.set_user("Administrator")
            
    except frappe.DoesNotExistError:
        print("❌ CRITICAL: Dashboard Chart Source 'Leave Type' does not exist")
        issues_found.append("Dashboard Chart Source 'Leave Type' missing")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"Chart Source check failed: {e}")
    
    # Test 4: Workspace Configuration Check
    print("\n🔍 TEST 4: WORKSPACE CONFIGURATION")
    print("-" * 30)
    try:
        workspace = frappe.get_doc("Workspace", "Leave Management")
        print(f"✅ Workspace exists: {workspace.name}")
        print(f"   Is Public: {workspace.public}")
        
        # Parse content
        if isinstance(workspace.content, str):
            try:
                content = json.loads(workspace.content)
                print("✅ Workspace content is valid JSON")
            except:
                print("❌ ISSUE: Workspace content is invalid JSON")
                issues_found.append("Invalid workspace JSON")
                return
        else:
            content = workspace.content or []
            print("✅ Workspace content is array")
        
        # Find chart in content
        chart_found = False
        chart_details = None
        for item in content:
            if item.get('type') == 'chart':
                chart_found = True
                chart_details = item
                chart_name = item.get('data', {}).get('chart_name')
                print(f"✅ Chart found in workspace: '{chart_name}'")
                print(f"   Chart details: {item}")
                
                # Check if chart name matches existing Dashboard Chart
                if chart_name == "Leave Type":
                    print("✅ Chart name matches existing Dashboard Chart")
                else:
                    print(f"❌ ISSUE: Chart name '{chart_name}' doesn't match 'Leave Type'")
                    issues_found.append(f"Chart name mismatch: workspace has '{chart_name}', need 'Leave Type'")
                break
        
        if not chart_found:
            print("❌ CRITICAL: No chart found in workspace content")
            issues_found.append("No chart block in workspace content")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"Workspace check failed: {e}")
    
    # Test 5: DocPerm Permissions Check
    print("\n🔍 TEST 5: DOCTYPE PERMISSIONS")
    print("-" * 30)
    try:
        # Check DocPerm for Dashboard Chart
        user_roles = frappe.get_roles('guru@ulx.in')
        has_dashboard_chart_perm = False
        
        docperms = frappe.get_all("DocPerm", 
                                filters={"parent": "Dashboard Chart", "read": 1},
                                fields=["role", "read"])
        
        print("Dashboard Chart permissions:")
        for perm in docperms:
            print(f"   Role: {perm.role}, Read: {perm.read}")
            if perm.role in user_roles:
                has_dashboard_chart_perm = True
                
        if has_dashboard_chart_perm:
            print("✅ User has Dashboard Chart DocPerm")
        else:
            print("❌ ISSUE: User lacks Dashboard Chart DocPerm")
            issues_found.append("Missing Dashboard Chart DocPerm")
            
    except Exception as e:
        print(f"❌ ERROR checking permissions: {e}")
        issues_found.append(f"Permission check failed: {e}")
    
    # Test 6: File System Check
    print("\n🔍 TEST 6: FILE SYSTEM CHECK")
    print("-" * 30)
    try:
        # Check workspace JSON file
        workspace_file = "/workspace/development/frappe-bench/apps/hr_portal/hr_portal/hr/workspace/leave_management/leave_management.json"
        if os.path.exists(workspace_file):
            print("✅ Workspace JSON file exists")
            with open(workspace_file, 'r') as f:
                file_data = json.load(f)
            
            file_content = file_data.get('content', [])
            if isinstance(file_content, str):
                file_content = json.loads(file_content)
                
            # Check chart in file
            file_chart_found = False
            for item in file_content:
                if item.get('type') == 'chart':
                    file_chart_found = True
                    chart_name = item.get('data', {}).get('chart_name')
                    print(f"✅ Chart in file: '{chart_name}'")
                    break
                    
            if not file_chart_found:
                print("❌ ISSUE: No chart in workspace file")
                issues_found.append("No chart in workspace file")
        else:
            print("❌ ISSUE: Workspace JSON file missing")
            issues_found.append("Workspace JSON file missing")
            
        # Check chart source files
        chart_js_file = "/workspace/development/frappe-bench/apps/hr_portal/hr_portal/hr/dashboard_chart_source/leave_type/leave_type.js"
        if os.path.exists(chart_js_file):
            print("✅ Chart JavaScript file exists")
        else:
            print("❌ ISSUE: Chart JavaScript file missing")
            issues_found.append("Chart JavaScript file missing")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"File system check failed: {e}")
    
    # Test 7: Chart API Endpoint Test
    print("\n🔍 TEST 7: CHART API ENDPOINT")
    print("-" * 30)
    try:
        frappe.set_user("guru@ulx.in")
        
        # Test the API endpoint that the frontend calls
        try:
            result = frappe.call('hr_portal.hr.dashboard_chart_source.leave_type.leave_type.get')
            print("✅ Chart API endpoint works")
            print(f"   Data: {len(result.get('datasets', []))} datasets")
        except Exception as e:
            print(f"❌ ISSUE: Chart API endpoint failed: {e}")
            issues_found.append(f"Chart API endpoint failed: {e}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        issues_found.append(f"API endpoint test failed: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # DIAGNOSIS SUMMARY
    print("\n" + "=" * 60)
    print("🏥 DIAGNOSIS SUMMARY")
    print("=" * 60)
    
    if not issues_found:
        print("🎉 NO ISSUES FOUND!")
        print("The chart should be working. Possible frontend/cache issue.")
        print("\nTry:")
        print("1. Hard refresh (Ctrl+Shift+R)")
        print("2. Clear all browser data")
        print("3. Try incognito/private mode")
        print("4. Check browser console for JavaScript errors")
    else:
        print("🚨 ISSUES FOUND:")
        for i, issue in enumerate(issues_found, 1):
            print(f"{i}. {issue}")
        
        print("\n🔧 RECOMMENDED FIXES:")
        
        if "Chart name mismatch" in str(issues_found):
            print("• Update workspace content to use correct chart name")
            
        if "Missing Dashboard Chart DocPerm" in str(issues_found):
            print("• Add DocPerm for Dashboard Chart for user roles")
            
        if "No chart block in workspace content" in str(issues_found):
            print("• Add chart block to workspace content")
            
        if "Dashboard Chart 'Leave Type' missing" in str(issues_found):
            print("• Create Dashboard Chart document")
            
        if "Chart data generation failed" in str(issues_found):
            print("• Fix chart source Python code")
    
    print("\n" + "=" * 60)
    print("DIAGNOSIS COMPLETED")
    print("=" * 60)

# Run the comprehensive diagnosis
comprehensive_chart_diagnosis() 