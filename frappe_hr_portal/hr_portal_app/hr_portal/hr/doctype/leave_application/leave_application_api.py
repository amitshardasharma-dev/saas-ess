# Copyright (c) 2025, ULX and contributors
# API methods for Leave Application workflow

import frappe
from frappe.utils import now_datetime
from frappe import _


@frappe.whitelist()
def approve_leave(leave_id, action, remarks=None):
    """
    Approve or reject a leave application
    Args:
        leave_id: Leave Application ID
        action: 'approve' or 'reject'
        remarks: Optional remarks from approver
    """
    # Validate parameters
    if action not in ["approve", "reject"]:
        frappe.throw(_("Invalid action. Use 'approve' or 'reject'"))
    
    # Get leave application
    leave_app = frappe.get_doc("Leave Application", leave_id)
    current_user = frappe.session.user
    
    # Find current pending entry for this user
    current_entry = None
    for entry in leave_app.leave_approval_entry:
        if entry.status == "Pending" and entry.approver == current_user:
            current_entry = entry
            break
    
    if not current_entry:
        frappe.throw(_("You are not authorized to approve this leave or it's already processed"))
    
    # Update the approval entry
    current_entry.status = "Approved" if action == "approve" else "Rejected"
    current_entry.action_by = current_user
    current_entry.action_time = now_datetime()
    current_entry.remarks = remarks
    
    # Handle workflow logic
    if action == "reject":
        leave_app.workflow_state = "Rejected"
        leave_app.leave_status = "Rejected"
    else:
        # Check if there are more pending levels
        next_pending = None
        for entry in leave_app.leave_approval_entry:
            if entry.status == "Pending" and entry.level_no > current_entry.level_no:
                next_pending = entry
                break
        
        if next_pending:
            # Move to next level
            leave_app.workflow_state = "Pending Approval"
            assign_todo_to_approver(leave_app, next_pending.approver)
        else:
            # All levels approved
            leave_app.workflow_state = "Approved"
            leave_app.leave_status = "Approved"
            if leave_app.docstatus == 0:  # Only submit if draft
                leave_app.submit()
    
    # Set flag for on_update method
    if not hasattr(leave_app, '_flags'):
        leave_app._flags = frappe._dict()
    leave_app._flags.workflow_action = True
    leave_app.save(ignore_permissions=True)
    
    return {
        "message": f"Leave application {action}d successfully",
        "workflow_state": leave_app.workflow_state
    }


@frappe.whitelist()
def get_pending_approvals():
    """Get pending leave applications for current user"""
    current_user = frappe.session.user
    
    # Get leave applications with pending entries for current user
    pending_entries = frappe.get_all("Leave Approval Entry",
        filters={
            "approver": current_user,
            "status": "Pending"
        },
        fields=["parent", "level_no"]
    )
    
    leave_apps = []
    for entry in pending_entries:
        leave_app = frappe.get_doc("Leave Application", entry.parent)
        employee_name = frappe.get_value("Employee", leave_app.link_lmbb, "full_name")
        
        leave_apps.append({
            "name": leave_app.name,
            "employee": leave_app.link_lmbb,
            "employee_name": employee_name,
            "leave_type": leave_app.leave_type,
            "from_date": leave_app.from_date,
            "till_date": leave_app.till_date,
            "total_days": leave_app.total_leave_days,
            "reason": leave_app.leave_reason,
            "level_no": entry.level_no,
            "workflow_state": leave_app.workflow_state
        })
    
    return leave_apps


@frappe.whitelist()
def get_leave_approval_chain(leave_id):
    """Get the complete approval chain for a leave application"""
    leave_app = frappe.get_doc("Leave Application", leave_id)
    
    chain = []
    for entry in leave_app.leave_approval_entry:
        approver_name = frappe.get_value("User", entry.approver, "full_name")
        chain.append({
            "level_no": entry.level_no,
            "approver": entry.approver,
            "approver_name": approver_name,
            "status": entry.status,
            "action_by": entry.action_by,
            "action_time": entry.action_time,
            "remarks": entry.remarks,
            "sla_deadline": entry.sla_deadline
        })
    
    return {
        "leave_id": leave_id,
        "workflow_state": leave_app.workflow_state,
        "approval_chain": chain
    }


@frappe.whitelist()
def get_employee_leave_status(employee=None):
    """Get leave status for an employee (defaults to current user's employee record)"""
    if not employee:
        employee = frappe.get_value("Employee", {"user_id": frappe.session.user}, "name")
        if not employee:
            return {"error": "No employee record found for current user"}
    
    # Get pending leaves
    pending_leaves = frappe.get_all("Leave Application",
        filters={
            "link_lmbb": employee,
            "docstatus": 0,
            "workflow_state": ["like", "Pending%"]
        },
        fields=["name", "leave_type", "from_date", "till_date", "workflow_state"]
    )
    
    # Get approved leaves
    approved_leaves = frappe.get_all("Leave Application",
        filters={
            "link_lmbb": employee,
            "leave_status": "Approved"
        },
        fields=["name", "leave_type", "from_date", "till_date", "total_leave_days"]
    )
    
    return {
        "employee": employee,
        "pending_leaves": pending_leaves,
        "approved_leaves": approved_leaves
    }


def assign_todo_to_approver(leave_app, approver_user):
    """Create a ToDo item for the next approver"""
    try:
        # Check if ToDo already exists
        existing_todo = frappe.get_all("ToDo",
            filters={
                "reference_type": "Leave Application",
                "reference_name": leave_app.name,
                "owner": approver_user,
                "status": "Open"
            })
        
        if existing_todo:
            return  # ToDo already exists
            
        todo = frappe.get_doc({
            "doctype": "ToDo",
            "description": f"Leave application {leave_app.name} requires your approval",
            "owner": approver_user,
            "reference_type": "Leave Application",
            "reference_name": leave_app.name,
            "priority": "Medium",
            "status": "Open"
        })
        todo.insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        # Log error but don't fail the workflow
        frappe.log_error(f"Failed to create ToDo for {approver_user}: {str(e)}")


@frappe.whitelist()
def preview_approval_chain(leave_type, department=None, team=None, total_days=1):
    """Preview what the approval chain would look like for given parameters"""
    try:
        # Convert total_days to int if it's a string
        total_days = int(total_days)
        
        # Find applicable rule using similar logic as Leave Application
        filters_list = [
            # Team-specific rule (highest priority)
            {
                "leave_type": leave_type,
                "team": team,
                "min_days": ("<=", total_days),
                "max_days": (">=", total_days),
                "active": 1
            } if team else None,
            # Department-specific rule
            {
                "leave_type": leave_type,
                "department": department,
                "team": ["in", ["", None]],
                "min_days": ("<=", total_days),
                "max_days": (">=", total_days),
                "active": 1
            } if department else None,
            # Global rule (lowest priority)
            {
                "leave_type": leave_type,
                "department": ["in", ["", None]],
                "team": ["in", ["", None]],
                "min_days": ("<=", total_days),
                "max_days": (">=", total_days),
                "active": 1
            }
        ]
        
        # Remove None entries
        filters_list = [f for f in filters_list if f is not None]
        
        rule = None
        for filters in filters_list:
            rules = frappe.get_all("Leave Approval Rule",
                                  filters=filters,
                                  order_by="modified desc",
                                  limit=1)
            if rules:
                rule = frappe.get_doc("Leave Approval Rule", rules[0].name)
                break
        
        if not rule:
            return {
                "error": "No approval rule found",
                "message": f"No approval rule configured for {leave_type} with {total_days} days"
            }
        
        # Build preview chain
        preview_chain = []
        for level in sorted(rule.approval_levels, key=lambda x: x.level_no):
            approver_info = ""
            if level.approver_type == "Employee" and level.approver_employee:
                emp_name = frappe.get_value("Employee", level.approver_employee, "employee_name")
                approver_info = f"{emp_name} (Employee)"
            elif level.approver_type == "Role" and level.approver_role:
                approver_info = f"{level.approver_role} (Role)"
            
            preview_chain.append({
                "level_no": level.level_no,
                "approver_type": level.approver_type,
                "approver_info": approver_info,
                "sla_days": level.sla_days,
                "mandatory": level.mandatory
            })
        
        return {
            "rule_name": rule.name,
            "leave_type": leave_type,
            "total_days": total_days,
            "scope": team or department or "Global",
            "approval_chain": preview_chain
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "message": "Failed to preview approval chain"
        }


@frappe.whitelist()
def get_approved_by_user(user=None):
    """Get all leave applications that have been approved by the specified user"""
    if not user:
        user = frappe.session.user
    
    # Get all approval entries where this user has approved
    approved_entries = frappe.get_all("Leave Approval Entry",
        filters={
            "action_by": user,
            "status": "Approved"
        },
        fields=["parent", "level_no", "action_time", "remarks"],
        order_by="action_time desc"
    )
    
    if not approved_entries:
        return []
    
    # Get unique leave application names
    leave_app_names = list(set([entry.parent for entry in approved_entries]))
    
    # Fetch leave application details
    leave_apps = []
    for leave_name in leave_app_names:
        try:
            leave_app = frappe.get_doc("Leave Application", leave_name)
            employee_name = frappe.get_value("Employee", leave_app.link_lmbb, "full_name")
            
            # Find the specific approval entry for this user
            user_approval = next((entry for entry in approved_entries if entry.parent == leave_name), None)
            
            leave_apps.append({
                "name": leave_app.name,
                "employee": leave_app.link_lmbb,
                "employee_name": employee_name,
                "leave_type": leave_app.leave_type,
                "from_date": leave_app.from_date,
                "till_date": leave_app.till_date,
                "total_days": leave_app.total_leave_days,
                "reason": leave_app.leave_reason,
                "workflow_state": leave_app.workflow_state,
                "leave_status": leave_app.leave_status,
                "approved_level": user_approval.level_no if user_approval else None,
                "approval_time": user_approval.action_time if user_approval else None,
                "approval_remarks": user_approval.remarks if user_approval else None,
                "creation": leave_app.creation,
                "modified": leave_app.modified
            })
        except Exception as e:
            # Skip if leave application is deleted or inaccessible
            frappe.log_error(f"Error fetching leave application {leave_name}: {str(e)}")
            continue
    
    # Sort by approval time (most recent first)
    leave_apps.sort(key=lambda x: x.get('approval_time') or x.get('modified'), reverse=True)
    
    return leave_apps 