#!/usr/bin/env python3

import frappe
import json
from frappe.core.doctype.user.user import test_password_strength

def test_ltdc_permissions():
	"""
	Test script to verify LTDC dashboard chart permissions and functionality
	"""
	
	print("=" * 60)
	print("LTDC Dashboard Chart Permission Test")
	print("=" * 60)
	
	
	try:
		ltdc_source = frappe.get_doc("Dashboard Chart Source", "LTDC")
		print(f"✅ Dashboard Chart Source 'LTDC' exists")
		print(f"   - Module: {ltdc_source.module}")
		print(f"   - Source Name: {ltdc_source.source_name}")
	except frappe.DoesNotExistError:
		print("❌ Dashboard Chart Source 'LTDC' not found")
		return False
	

	try:
		from hr_portal.hr.dashboard_chart_source.ltdc.ltdc import get
		print("✅ LTDC method imported successfully")
	except ImportError as e:
		print(f"❌ Failed to import LTDC method: {e}")
		return False
	
	
	try:
		chart_data = get()
		print("✅ Chart data generated successfully")
		print(f"   - Labels: {chart_data.get('labels', [])}")
		print(f"   - Datasets: {len(chart_data.get('datasets', []))} dataset(s)")
		
		# Validate chart structure
		required_keys = ['labels', 'datasets', 'type']
		for key in required_keys:
			if key not in chart_data:
				print(f"❌ Missing required key: {key}")
				return False
		
		print("✅ Chart data structure is valid")
		
	except Exception as e:
		print(f"❌ Error generating chart data: {e}")
		return False
	
s
	try:
		current_user = frappe.session.user
		print(f"✅ Current user: {current_user}")
		
		
		if frappe.has_permission("Employee", "read"):
			print("✅ User has read permission for Employee")
		else:
			print("⚠️  User does not have read permission for Employee")
		
		
		if frappe.has_permission("Dashboard Chart", "read"):
			print("✅ User has read permission for Dashboard Chart")
		else:
			print("⚠️  User does not have read permission for Dashboard Chart")
			
	except Exception as e:
		print(f"❌ Error checking permissions: {e}")
		return False
	
	
	try:
		result = frappe.call("hr_portal.hr.dashboard_chart_source.ltdc.ltdc.get")
		print("✅ Method accessible via frappe.call")
		print(f"   - Result type: {type(result)}")
		
		if isinstance(result, dict) and 'labels' in result:
			print(f"   - Chart labels: {result['labels']}")
		
	except Exception as e:
		print(f"❌ Error calling whitelisted method: {e}")
		return False
	
	print("\n" + "=" * 60)
	print("✅ All LTDC permission tests passed!")
	print("=" * 60)
	
	return True

def create_test_dashboard_chart():
	"""
	Create a test dashboard chart using LTDC source
	"""
	
	try:
		
		if frappe.db.exists("Dashboard Chart", "Test LTDC Chart"):
			print("📊 Test dashboard chart already exists")
			return frappe.get_doc("Dashboard Chart", "Test LTDC Chart")
		
		
		chart_doc = frappe.get_doc({
			"doctype": "Dashboard Chart",
			"chart_name": "Test LTDC Chart",
			"chart_type": "Bar",
			"source": "LTDC",
			"module": "HR",
			"is_public": 1,
			"width": "Half",
			"color": "#7cd6fd"
		})
		
		chart_doc.insert()
		frappe.db.commit()
		
		print(f"✅ Created test dashboard chart: {chart_doc.name}")
		return chart_doc
		
	except Exception as e:
		print(f"❌ Error creating test dashboard chart: {e}")
		return None

def run_tests():
	"""
	Run all tests
	"""
	
	print("Starting LTDC Dashboard Chart Tests...\n")
	
	
	if test_ltdc_permissions():
		print("\n📊 Creating test dashboard chart...")
		chart = create_test_dashboard_chart()
		
		if chart:
			print(f"\n🎉 All tests completed successfully!")
			print(f"📈 You can now test the chart at: /app/dashboard-chart/{chart.name}")
		else:
			print("\n⚠️  Permission tests passed but chart creation failed")
	else:
		print("\n❌ Permission tests failed")

if __name__ == "__main__":
	run_tests() 