frappe.ready(() => {
    const route = frappe.get_route_str();
    if (route === "leave-management") {
      const head = document.querySelector('.page-head-content');
      if (head && frappe.session && frappe.session.user_fullname) {
        const div = document.createElement("div");
        div.innerHTML = `<h3 style="margin-bottom: 10px;">👋 Welcome, ${frappe.session.user_fullname}!</h3>`;
        head.prepend(div);
      }
    }
  });  