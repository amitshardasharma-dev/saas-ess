import frappe
import frappe.utils.logger
import logging

# Set log level to DEBUG
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@frappe.whitelist()
def get(filters=None):
	"""
	LTDC - Leave Type Dashboard Chart with dummy data for testing permissions
	"""
	try:
		# Get current employee from user
		current_employee = frappe.get_cached_value('Employee', {'user_id': frappe.session.user}, 'name')
		frappe.log_error(f"LTDC - Employee ID: {current_employee}", "LTDC Chart Debug")
		
		# Dummy data for testing permissions
		dummy_leave_data = [
			{
				'leave_code': 'AL',
				'leave_name': 'Annual Leave',
				'total_days': 25,
				'taken_days': 8,
				'pending_days': 2
			},
			{
				'leave_code': 'SL',
				'leave_name': 'Sick Leave',
				'total_days': 15,
				'taken_days': 3,
				'pending_days': 1
			},
			{
				'leave_code': 'ML',
				'leave_name': 'Maternity Leave',
				'total_days': 90,
				'taken_days': 0,
				'pending_days': 0
			},
			{
				'leave_code': 'CL',
				'leave_name': 'Casual Leave',
				'total_days': 12,
				'taken_days': 5,
				'pending_days': 1
			},
			{
				'leave_code': 'EL',
				'leave_name': 'Emergency Leave',
				'total_days': 5,
				'taken_days': 2,
				'pending_days': 0
			}
		]
		
		labels = []
		total_leave = []
		taken_leave = []
		pending_leave = []
		available_leave = []
		
		for leave_data in dummy_leave_data:
			labels.append(leave_data['leave_code'])
			total = leave_data['total_days']
			taken = leave_data['taken_days']
			pending = leave_data['pending_days']
			available = max(0, total - taken - pending)
			
			total_leave.append(total)
			taken_leave.append(taken)
			pending_leave.append(pending)
			available_leave.append(available)
			
			# Log each leave type data
			frappe.log_error(
				f"LTDC - {leave_data['leave_code']}: Total={total}, Taken={taken}, Pending={pending}, Available={available}",
				"LTDC Chart Debug"
			)
		
		chart_data = {
			"labels": labels,
			"datasets": [
				{
					"name": "Total Leave",
					"values": total_leave,
					"chartType": "bar"
				},
				{
					"name": "Available Leave", 
					"values": available_leave,
					"chartType": "bar"
				},
				{
					"name": "Taken Leave",
					"values": taken_leave,
					"chartType": "bar"
				},
				{
					"name": "Pending Leave",
					"values": pending_leave,
					"chartType": "bar"
				}
			],
			"type": "bar",
			"barOptions": {
				"stacked": 0,
				"spaceRatio": 0.5,
				"height": 400,
				"axisOptions": {
					"xAxisMode": "span",
					"yAxisMode": "span",
					"xIsSeries": 1
				}
			},
			"valuesOverPoints": 1,
			"lineOptions": {
				"regionFill": 1,
				"hideDots": 0,
				"hideLine": 0,
				"heatline": 1,
				"dotSize": 4
			}
		}
		
		# Log final data for debugging
		frappe.log_error(f"LTDC - Chart Labels: {labels}", "LTDC Chart Debug")
		frappe.log_error(f"LTDC - Total Leave: {total_leave}", "LTDC Chart Debug")
		frappe.log_error(f"LTDC - Taken Leave: {taken_leave}", "LTDC Chart Debug")
		frappe.log_error(f"LTDC - Pending Leave: {pending_leave}", "LTDC Chart Debug")
		frappe.log_error(f"LTDC - Available Leave: {available_leave}", "LTDC Chart Debug")
		
		return chart_data
		
	except Exception as e:
		frappe.log_error(f"LTDC - Error generating chart data: {str(e)}", "LTDC Chart Error")
		# Return empty chart data on error
		return {
			"labels": [],
			"datasets": [],
			"type": "bar",
			"message": f"Error loading chart data: {str(e)}"
		}
