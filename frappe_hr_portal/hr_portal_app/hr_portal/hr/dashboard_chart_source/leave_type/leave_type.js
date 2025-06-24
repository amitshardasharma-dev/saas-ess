frappe.dashboards.chart_sources["Leave Type"] = {
    method: "hr_portal.hr.dashboard_chart_source.leave_type.leave_type.get",
    filters: [],
    type: "bar",
    height: 350,
    colors: ["#7cd6fd", "#5e64ff", "#743ee2"],
    axisOptions: {
        xAxisMode: "span",
        yAxisMode: "span"
    },
    barOptions: {
        stacked: 0,
        spaceRatio: 0.5
    }
};

// Add chart initialization
frappe.after_ajax(function () {
    const route = frappe.get_route_str();
    if (route === "leave-management") {
        setTimeout(() => {
            const chartContainer = document.querySelector('[data-chart-name="Leave Type"]');
            if (chartContainer) {
                console.log("Chart container found");
                // Force chart refresh
                frappe.dashboards.chart_sources["Leave Type"].refresh();
            } else {
                console.log("Chart container not found");
            }
        }, 1000);
    }
});