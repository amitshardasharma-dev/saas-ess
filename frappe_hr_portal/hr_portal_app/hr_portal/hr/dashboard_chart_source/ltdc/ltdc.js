frappe.dashboards.chart_sources["LTDC"] = {
	method: "hr_portal.hr.dashboard_chart_source.ltdc.ltdc.get",
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company")
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -12)
		},
		{
			fieldname: "to_date", 
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today()
		}
	]
};
