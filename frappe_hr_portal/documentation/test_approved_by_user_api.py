#!/usr/bin/env python3

import requests
import json
from datetime import datetime

# Server configuration
BASE_URL = "http://hr.portal:8000"
API_BASE = f"{BASE_URL}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api"

def login_user(username, password):
    """Login and get session cookies"""
    login_url = f"{BASE_URL}/api/method/login"
    
    response = requests.post(login_url, data={
        'usr': username,
        'pwd': password
    })
    
    if response.status_code == 200:
        result = response.json()
        if result.get('message') == 'Logged In':
            print(f"✅ Successfully logged in as {username}")
            return response.cookies
        else:
            print(f"❌ Login failed for {username}: {result}")
            return None
    else:
        print(f"❌ Login request failed for {username}: {response.status_code}")
        return None

def test_get_approved_by_user(cookies, username):
    """Test the get_approved_by_user API"""
    print(f"\n🔍 Testing get_approved_by_user API for {username}")
    
    url = f"{API_BASE}.get_approved_by_user"
    
    response = requests.get(url, cookies=cookies)
    
    if response.status_code == 200:
        result = response.json()
        approved_leaves = result.get('message', [])
        
        print(f"✅ API call successful for {username}")
        print(f"📊 Found {len(approved_leaves)} leave applications approved by {username}")
        
        if approved_leaves:
            print("\n📋 Approved Leave Applications:")
            for i, leave in enumerate(approved_leaves, 1):
                print(f"\n{i}. Leave Application: {leave['name']}")
                print(f"   Employee: {leave['employee_name']} ({leave['employee']})")
                print(f"   Leave Type: {leave['leave_type']}")
                print(f"   Duration: {leave['from_date']} to {leave['till_date']} ({leave['total_days']} days)")
                print(f"   Reason: {leave['reason']}")
                print(f"   Current Status: {leave['workflow_state']} / {leave['leave_status']}")
                print(f"   Approved at Level: {leave['approved_level']}")
                print(f"   Approval Time: {leave['approval_time']}")
                if leave['approval_remarks']:
                    print(f"   Approval Remarks: {leave['approval_remarks']}")
        else:
            print(f"ℹ️  No leave applications have been approved by {username} yet")
            
        return approved_leaves
    else:
        print(f"❌ API call failed: {response.status_code}")
        print(f"Response: {response.text}")
        return None

def main():
    """Test the new API with all test users"""
    print("🚀 Testing get_approved_by_user API")
    print("=" * 50)
    
    # Test users who have approval permissions
    test_users = [
        ("jnanesh", "Phagwara@13"),  # Manager - should have approved leaves
        ("guru", "Phagwara@14"),     # HR Head - should have approved leaves  
        ("sahil", "Phagwara@13")     # Team Lead - might have approved leaves
    ]
    
    all_results = {}
    
    for username, password in test_users:
        print(f"\n{'='*20} Testing {username.upper()} {'='*20}")
        
        # Login
        cookies = login_user(username, password)
        if not cookies:
            continue
            
        # Test the API
        approved_leaves = test_get_approved_by_user(cookies, username)
        all_results[username] = approved_leaves
    
    # Summary
    print(f"\n{'='*50}")
    print("📊 SUMMARY")
    print(f"{'='*50}")
    
    for username, leaves in all_results.items():
        if leaves is not None:
            print(f"{username}: {len(leaves)} approved leave applications")
        else:
            print(f"{username}: API test failed")
    
    print("\n✅ Testing completed!")

if __name__ == "__main__":
    main() 