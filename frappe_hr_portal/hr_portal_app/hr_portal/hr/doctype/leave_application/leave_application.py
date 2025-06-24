# Copyright (c) 2025, ULX and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, add_days, now_datetime

class LeaveApplication(Document):
	def validate(self):
		"""Standard Frappe validation method"""
		self.calculate_total_leave_days()
		self.set_leave_approver()
		self.populate_approval_entries()
		self.set_workflow_state()
	
	def calculate_total_leave_days(self):
		"""Calculate total leave days"""
		if self.from_date and self.till_date:
			self.total_leave_days = (getdate(self.till_date) - getdate(self.from_date)).days + 1
	
	def set_leave_approver(self):
		"""Set leave approver based on approval rules"""
		if not self.leave_approver:
			# Get the applicable approval rule with description
			rule_data = frappe.get_value("Leave Approval Rule", 
										{"leave_type": self.leave_type, "active": 1,
										 "min_days": ["<=", self.total_leave_days or 1],
										 "max_days": [">=", self.total_leave_days or 1]}, 
										["name", "description"])
			if rule_data:
				rule_name = rule_data[0] if isinstance(rule_data, tuple) else rule_data
				# Get first level approver
				approver = frappe.get_value("Leave Approval Level", 
											{"parent": rule_name, "level_no": 1}, 
											"approver_employee")
				if approver:
					self.leave_approver = approver
				else:
					self.leave_approver = "EMP000002"  # Default fallback
			else:
				self.leave_approver = "EMP000002"  # Default fallback
	
	def populate_approval_entries(self):
		"""Populate approval entries based on approval rules for tracking and visualization"""
		# Only populate if entries don't exist and we have a leave type
		if self.leave_approval_entry or not self.leave_type:
			return
			
		# Get the applicable approval rule
		rule_data = frappe.get_value("Leave Approval Rule", 
									{"leave_type": self.leave_type, "active": 1,
									 "min_days": ["<=", self.total_leave_days or 1],
									 "max_days": [">=", self.total_leave_days or 1]}, 
									["name", "description"])
		
		if not rule_data:
			return
			
		rule_name = rule_data[0] if isinstance(rule_data, tuple) else rule_data
		
		# Get all approval levels for this rule
		approval_levels = frappe.get_all("Leave Approval Level",
										filters={"parent": rule_name},
										fields=["level_no", "approver_employee", "sla_days"],
										order_by="level_no")
		
		# Create approval entries for each level
		for level in approval_levels:
			if level.approver_employee:
				# Get approver user ID from employee
				approver_user = frappe.get_value("Employee", level.approver_employee, "user_id")
				if not approver_user:
					approver_user = "Administrator"  # Fallback
				
				# Calculate SLA deadline
				sla_deadline = None
				if level.sla_days:
					sla_deadline = add_days(now_datetime(), level.sla_days)
				
				# Create approval entry
				self.append("leave_approval_entry", {
					"level_no": level.level_no,
					"approver": approver_user,
					"status": "Pending" if level.level_no == 1 else "Pending",  # All start as pending
					"sla_deadline": sla_deadline
				})
	
	def set_workflow_state(self):
		"""Set initial workflow state"""
		# Keep as Draft initially to avoid workflow transition errors
		if not self.workflow_state:
			self.workflow_state = "Draft"
	
	def on_submit(self):
		"""Handle workflow when document is submitted"""
		if self.leave_approval_entry and self.workflow_state == "Draft":
			self.workflow_state = "Pending Approval"
	
	def on_update_after_submit(self):
		"""Handle approval entry updates when workflow state changes"""
		self.sync_approval_entries_with_workflow()
	
	def sync_approval_entries_with_workflow(self):
		"""Sync approval entries with current workflow state for proper tracking"""
		if not self.leave_approval_entry:
			return
			
		current_user = frappe.session.user
		
		# If workflow state is "Approved", mark all entries as approved
		if self.workflow_state == "Approved":
			for entry in self.leave_approval_entry:
				if entry.status == "Pending":
					entry.status = "Approved"
					entry.action_by = current_user
					entry.action_time = now_datetime()
					entry.remarks = "Auto-approved via workflow"
		
		# If workflow state is "Rejected", mark first pending entry as rejected
		elif self.workflow_state == "Rejected":
			for entry in self.leave_approval_entry:
				if entry.status == "Pending":
					entry.status = "Rejected"
					entry.action_by = current_user
					entry.action_time = now_datetime()
					entry.remarks = "Rejected via workflow"
					break  # Only reject the first pending entry
		
		# If workflow state is "Pending Approval", ensure first entry is pending
		elif self.workflow_state == "Pending Approval":
			if self.leave_approval_entry:
				first_entry = self.leave_approval_entry[0]
				if first_entry.status != "Pending":
					first_entry.status = "Pending"
					first_entry.action_by = None
					first_entry.action_time = None

# API Method to Manually Sync Approval Entries
@frappe.whitelist()
def sync_approval_entries(leave_id):
	"""Manually sync approval entries with workflow state for a specific leave application"""
	try:
		leave_app = frappe.get_doc("Leave Application", leave_id)
		
		# Set flags to allow updates after submit
		leave_app.flags.ignore_permissions = True
		leave_app.flags.ignore_validate_update_after_submit = True
		
		leave_app.sync_approval_entries_with_workflow()
		leave_app.save(ignore_permissions=True)
		
		return {
			"status": "success",
			"message": f"Approval entries synced for {leave_id}",
			"workflow_state": leave_app.workflow_state,
			"approval_entries_count": len(leave_app.leave_approval_entry)
		}
	except Exception as e:
		frappe.log_error(f"Error syncing approval entries for {leave_id}: {str(e)}")
		return {"error": str(e)}

# API Method for Frontend to Preview Approval Chain
@frappe.whitelist()
def preview_approval_chain(employee, leave_type, total_leave_days, from_date, till_date):
	"""Preview approval chain without creating leave application"""
	try:
		total_days = float(total_leave_days)
		
		# Get approval rules for this leave type with day range matching
		approval_rules = frappe.get_all("Leave Approval Rule", 
										filters={
											"leave_type": leave_type, 
											"active": 1,
											"min_days": ["<=", total_days],
											"max_days": [">=", total_days]
										},
										fields=["name", "leave_type", "description", "min_days", "max_days"],
										order_by="min_days desc")  # Get most specific rule first
		
		if not approval_rules:
			return {
				"error": "No approval rule found for this leave type and duration",
				"default_approver": "EMP000002"
			}
		
		# Get the first matching rule and its levels
		rule_info = approval_rules[0]
		rule = frappe.get_doc("Leave Approval Rule", rule_info.name)
		approval_chain = []
		
		for level in sorted(rule.approval_levels, key=lambda x: x.level_no):
			if level.approver_employee:
				approver_name = frappe.db.get_value("Employee", level.approver_employee, "full_name")
				approval_chain.append({
					"level_no": level.level_no,
					"approver": level.approver_employee,
					"approver_name": approver_name,
					"sla_days": level.sla_days,
					"mandatory": level.mandatory,
					"delegate_to": level.delegate_to_employee
				})
		
		return {
			"approval_chain": approval_chain,
			"rule_name": rule.name,
			"rule_description": rule_info.description,
			"leave_type": rule.leave_type,
			"applicable_days": f"{rule_info.min_days}-{rule_info.max_days}",
			"total_levels": len(approval_chain),
			"requested_days": total_days
		}
		
	except Exception as e:
		frappe.log_error(f"Error in preview_approval_chain: {str(e)}")
		return {
			"error": str(e),
			"default_approver": "EMP000002"
		}

# API Method for Getting Pending Approvals
@frappe.whitelist()
def get_pending_approvals(approver):
	"""Get pending leave applications for a specific approver with multi-level support"""
	try:
		# Get leave applications pending approval for this approver
		pending_applications = frappe.get_all("Leave Application",
			filters={
				"leave_approver": approver,
				"workflow_state": "Pending Approval"
			},
			fields=[
				"name", "link_lmbb", "leave_type", "from_date", "till_date", 
				"leave_reason", "total_leave_days", "workflow_state", "creation"
			]
		)
		
		# Enhance with employee names and approval rule info
		for app in pending_applications:
			employee_name = frappe.db.get_value("Employee", app.link_lmbb, "full_name")
			app["employee_name"] = employee_name
			
			# Get approval rule info
			rule_data = frappe.get_value("Leave Approval Rule", 
										{"leave_type": app.leave_type, "active": 1,
										 "min_days": ["<=", app.total_leave_days],
										 "max_days": [">=", app.total_leave_days]}, 
										["name", "description"])
			
			if rule_data:
				rule_name = rule_data[0] if isinstance(rule_data, tuple) else rule_data
				rule_description = rule_data[1] if isinstance(rule_data, tuple) and len(rule_data) > 1 else ""
				
				# Find current level for this approver
				current_level = frappe.get_value("Leave Approval Level",
												{"parent": rule_name, "approver_employee": approver},
												"level_no")
				
				# Get total levels
				total_levels = frappe.db.count("Leave Approval Level", {"parent": rule_name})
				
				app["rule_description"] = rule_description
				app["current_level"] = current_level or 1
				app["total_levels"] = total_levels
				app["level_info"] = f"Level {current_level or 1} of {total_levels}"
			else:
				app["rule_description"] = "No rule description"
				app["current_level"] = 1
				app["total_levels"] = 1
				app["level_info"] = "Level 1 of 1"
		
		return pending_applications
		
	except Exception as e:
		frappe.log_error(f"Error in get_pending_approvals: {str(e)}")
		return []

# API Method for Approving/Rejecting Leave
@frappe.whitelist()
def approve_leave(leave_application, approver, action, remarks=None):
	"""Approve or reject a leave application with multi-level support"""
	try:
		# Get the leave application
		leave_app = frappe.get_doc("Leave Application", leave_application)
		
		# Get the applicable approval rule
		rule_data = frappe.get_value("Leave Approval Rule", 
									{"leave_type": leave_app.leave_type, "active": 1,
									 "min_days": ["<=", leave_app.total_leave_days],
									 "max_days": [">=", leave_app.total_leave_days]}, 
									["name", "description"])
		
		if not rule_data:
			return {"error": "No approval rule found for this leave application"}
		
		rule_name = rule_data[0] if isinstance(rule_data, tuple) else rule_data
		rule_description = rule_data[1] if isinstance(rule_data, tuple) and len(rule_data) > 1 else ""
		
		# Get all approval levels for this rule
		approval_levels = frappe.get_all("Leave Approval Level",
										filters={"parent": rule_name},
										fields=["level_no", "approver_employee", "sla_days"],
										order_by="level_no")
		
		# Find current approver's level
		current_level = None
		for level in approval_levels:
			if level.approver_employee == approver:
				current_level = level
				break
		
		if not current_level:
			return {"error": "You are not authorized to approve this leave application"}
		
		# Verify current state
		if leave_app.workflow_state != "Pending Approval":
			return {"error": f"Leave application is not pending approval at level {current_level.level_no}"}
		
		# Apply workflow action
		if action.lower() == "reject":
			# Rejection at any level rejects the entire application
			from frappe.model.workflow import apply_workflow
			apply_workflow(leave_app, "Reject")
			leave_app.reload()
			
			return {
				"status": "success",
				"workflow_state": leave_app.workflow_state,
				"message": f"Leave application rejected at level {current_level.level_no}",
				"rule_description": rule_description,
				"level_info": f"Level {current_level.level_no} - {frappe.db.get_value('Employee', approver, 'full_name')}"
			}
		
		elif action.lower() == "approve":
			# Check if there are more levels after current
			next_level = None
			for level in approval_levels:
				if level.level_no > current_level.level_no:
					next_level = level
					break
			
			if next_level:
				# Move to next level - update leave_approver but keep workflow state as "Pending Approval"
				leave_app.leave_approver = next_level.approver_employee
				leave_app.workflow_state = "Pending Approval"
				leave_app.save()
				
				next_approver_name = frappe.db.get_value("Employee", next_level.approver_employee, "full_name")
				
				return {
					"status": "success",
					"workflow_state": leave_app.workflow_state,
					"message": f"Level {current_level.level_no} approved. Moved to level {next_level.level_no}",
					"rule_description": rule_description,
					"current_level": current_level.level_no,
					"next_level": next_level.level_no,
					"next_approver": next_level.approver_employee,
					"next_approver_name": next_approver_name,
					"total_levels": len(approval_levels)
				}
			else:
				# Final approval - approve the entire application
				from frappe.model.workflow import apply_workflow
				apply_workflow(leave_app, "Approve")
				leave_app.reload()
				
				return {
					"status": "success",
					"workflow_state": leave_app.workflow_state,
					"message": f"Leave application fully approved at final level {current_level.level_no}",
					"rule_description": rule_description,
					"final_level": current_level.level_no,
					"total_levels": len(approval_levels)
				}
		else:
			return {"error": "Invalid action. Use 'Approve' or 'Reject'"}
		
	except Exception as e:
		frappe.log_error(f"Error in approve_leave: {str(e)}")
		return {"error": str(e)} 