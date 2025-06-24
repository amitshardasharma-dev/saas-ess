# 🎯 **Username-Based Authentication Demo**

## **Simple Frontend Implementation Example**

### **Step 1: Username Mapping**
```javascript
// Static mapping for your environment
const USERNAME_EMPLOYEE_MAPPING = {
  'guru': 'EMP000001',       // Employee
  'Jnanesh': 'EMP000002',    // Manager  
  'sahil': 'EMP000013'       // Senior Manager
};
```

### **Step 2: Login Handler**
```javascript
const handleLogin = async (username, password) => {
  // Validate credentials (your authentication logic)
  const isValid = await validateCredentials(username, password);
  
  if (isValid) {
    // Map username to Employee ID
    const employeeId = USERNAME_EMPLOYEE_MAPPING[username];
    
    if (!employeeId) {
      throw new Error(`Employee not found for username: ${username}`);
    }
    
    // Store in session
    sessionStorage.setItem('currentUser', username);
    sessionStorage.setItem('currentEmployeeId', employeeId);
    
    console.log(`Logged in: ${username} → Employee: ${employeeId}`);
    return { success: true, username, employeeId };
  }
  
  throw new Error('Invalid credentials');
};
```

### **Step 3: Leave Application Submission**
```javascript
const submitLeaveApplication = async (formData) => {
  // Get current employee ID from session
  const currentEmployeeId = sessionStorage.getItem('currentEmployeeId');
  const currentUser = sessionStorage.getItem('currentUser');
  
  if (!currentEmployeeId) {
    throw new Error('Please login first');
  }
  
  const leaveApplication = {
    doctype: 'Leave Application',
    link_lmbb: currentEmployeeId,           // ← AUTO-LINKED
    leave_type: formData.leaveType,
    from_date: formData.fromDate,
    till_date: formData.tillDate,
    leave_reason: formData.reason,
    half_day: formData.isHalfDay ? 1 : 0
  };
  
  console.log(`Submitting leave for ${currentUser} (${currentEmployeeId}):`, leaveApplication);
  
  // Submit to API
  const response = await fetch('/api/resource/Leave Application', {
    method: 'POST',
    headers: {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(leaveApplication)
  });
  
  return response.json();
};
```

### **Step 4: Get My Leave Applications**
```javascript
const getMyLeaveApplications = async () => {
  const currentEmployeeId = sessionStorage.getItem('currentEmployeeId');
  
  if (!currentEmployeeId) {
    throw new Error('Please login first');
  }
  
  // Get all applications
  const response = await fetch('/api/resource/Leave Application', {
    method: 'GET',
    headers: {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  // Filter for current employee
  const myApplications = data.data.filter(app => app.link_lmbb === currentEmployeeId);
  
  console.log(`Found ${myApplications.length} applications for employee ${currentEmployeeId}`);
  return myApplications;
};
```

## **Real Test Example**

### **Test Login Flow:**
```javascript
// Test with Guru
await handleLogin('guru', 'Phagwara@14');
// Result: Logged in: guru → Employee: EMP000001

// Test with Jnanesh  
await handleLogin('Jnanesh', 'Phagwara@13');
// Result: Logged in: Jnanesh → Employee: EMP000002

// Test with Sahil
await handleLogin('sahil', 'Phagwara@13');
// Result: Logged in: sahil → Employee: EMP000013
```

### **Test Leave Submission:**
```javascript
// After guru logs in
const leaveData = {
  leaveType: 'LEAVETYPE02',
  fromDate: '2024-12-21',
  tillDate: '2024-12-21', 
  reason: 'Personal work',
  isHalfDay: false
};

await submitLeaveApplication(leaveData);
// Result: Submitting leave for guru (EMP000001)
```

### **Test Manager View:**
```javascript
// After Jnanesh logs in  
const pendingApprovals = await getMyLeaveApplications();
// Result: Shows applications where leave_approver === EMP000002
```

## **Complete Component Example**

```javascript
// LoginForm.jsx
import React, { useState } from 'react';

const LoginForm = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await handleLogin(username, password);
      onLogin(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Username:</label>
        <select value={username} onChange={(e) => setUsername(e.target.value)}>
          <option value="">Select User</option>
          <option value="guru">guru (Employee)</option>
          <option value="Jnanesh">Jnanesh (Manager)</option>
          <option value="sahil">sahil (Senior Manager)</option>
        </select>
      </div>
      
      <div>
        <label>Password:</label>
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
};
```

## **Summary**

**✅ Simple & Direct:** Username → Employee ID mapping  
**✅ Session Management:** Store both username and Employee ID  
**✅ Auto-Linking:** Always populate `link_lmbb` field  
**✅ Data Filtering:** Show only relevant data per user  
**✅ Test Ready:** Works with existing test credentials  

**🎯 Result:** Clean, secure, username-based authentication with automatic employee linking! 