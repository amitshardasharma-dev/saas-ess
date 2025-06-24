#!/bin/bash

# Test script for get_approved_by_user API using curl
# Make sure the Frappe server is running on http://hr.portal:8000

echo "🚀 Testing get_approved_by_user API with curl"
echo "================================================"

BASE_URL="http://hr.portal:8000"
API_URL="$BASE_URL/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user"

# Test users
declare -a users=("guru:Phagwara@14" "jnanesh:Phagwara@13" "sahil:Phagwara@13")

for user_info in "${users[@]}"; do
    IFS=':' read -r username password <<< "$user_info"
    
    echo ""
    echo "==================== Testing $username ===================="
    
    # Login and get cookies
    echo "🔐 Logging in as $username..."
    login_response=$(curl -s -c "cookies_$username.txt" -d "usr=$username&pwd=$password" "$BASE_URL/api/method/login")
    
    if echo "$login_response" | grep -q "Logged In"; then
        echo "✅ Successfully logged in as $username"
        
        # Test the API
        echo "🔍 Fetching approved leave applications..."
        api_response=$(curl -s -b "cookies_$username.txt" "$API_URL")
        
        echo "📊 API Response for $username:"
        echo "$api_response" | python3 -m json.tool 2>/dev/null || echo "$api_response"
        
        # Clean up cookies
        rm -f "cookies_$username.txt"
    else
        echo "❌ Login failed for $username"
        echo "Response: $login_response"
    fi
done

echo ""
echo "✅ Testing completed!" 