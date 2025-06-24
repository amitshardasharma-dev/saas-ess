import frappe
import frappe.utils.logger
import logging

# Set log level to DEBUG
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@frappe.whitelist()
def get(filters=None):
    # Get current employee from user
    current_employee = frappe.get_cached_value('Employee', {'user_id': frappe.session.user}, 'name')
    frappe.log_error(f"Employee ID: {current_employee}", "Leave Chart Debug")
    
    # Fetch all Leave Types with eligible days and BC Leave Code
    leave_types = frappe.get_all('Leave Type', fields=['bc_leave_code', 'eligible_days', 'name'])
    
    # Log each leave type separately
    for lt in leave_types:
        frappe.log_error(
            f"Leave Type: {lt['name']}, Code: {lt['bc_leave_code']}, Days: {lt['eligible_days']}", 
            "Leave Chart Debug"
        )

    labels = []
    total_leave = []
    taken_leave = []
    available_leave = []

    for lt in leave_types:
        # Use bc_leave_code for x-axis label
        code = lt.get('bc_leave_code') or lt.get('name')
        labels.append(code)

        total = lt.get('eligible_days') or 0

        # Get approved taken leave for this type and current employee
        query = """
            SELECT COUNT(*)
            FROM `tabLeave Application` la
            INNER JOIN `tabLeave Type` lt ON la.leave_type = lt.name
            WHERE lt.bc_leave_code = %s 
            AND la.workflow_state = 'Approved'
            AND la.link_lmbb = %s
        """
        
        # Log query details
        frappe.log_error(
            f"Query for {code}: bc_leave_code={code}, employee={current_employee}", 
            "Leave Chart Debug"
        )
        
        taken = frappe.db.sql(query, (code, current_employee))[0][0] or 0
        
        # Log results for this leave type
        frappe.log_error(
            f"Results for {code}: Total={total}, Taken={taken}, Available={max(0, total - taken)}", 
            "Leave Chart Debug"
        )

        total_leave.append(total)
        taken_leave.append(taken)
        available_leave.append(max(0, total - taken))

    chart_data = {
        "labels": labels,  # bc_leave_code as x-axis label
        "datasets": [
            {"name": "Total Leave", "values": total_leave},
            {"name": "Available Leave", "values": available_leave},
            {"name": "Taken Leave", "values": taken_leave}
        ],
        "type": "bar",
        "barOptions": {
            "stacked": 0,
            "spaceRatio": 0.5,
            "height": 350,
            "axisOptions": {
                "xAxisMode": "span",
                "yAxisMode": "span"
            }
        },
        "valuesOverPoints": 1  # Always show value/count on top of each bar
    }
    
    # Log final data in chunks
    frappe.log_error(f"Chart Labels: {labels}", "Leave Chart Debug")
    frappe.log_error(f"Total Leave: {total_leave}", "Leave Chart Debug")
    frappe.log_error(f"Taken Leave: {taken_leave}", "Leave Chart Debug")
    frappe.log_error(f"Available Leave: {available_leave}", "Leave Chart Debug")
    
    return chart_data
