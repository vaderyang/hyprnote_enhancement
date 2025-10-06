#!/bin/bash

# Script to test Netis AI providers
echo "🔍 Testing Netis AI Providers"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test an endpoint
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local api_key="$3"
    
    echo -e "${YELLOW}Testing $name...${NC}"
    echo "Endpoint: $endpoint"
    
    if [ -z "$api_key" ]; then
        echo -e "${RED}❌ No API key provided${NC}"
        echo ""
        return 1
    fi
    
    # Test /models endpoint
    echo "Testing /models endpoint..."
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $api_key" \
        -H "Content-Type: application/json" \
        "${endpoint}/models" 2>&1)
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ /models endpoint working (HTTP $http_code)${NC}"
        # echo "Models available:"
        # echo "$body" | jq -r '.data[].id' 2>/dev/null | head -5
    else
        echo -e "${RED}❌ /models endpoint failed (HTTP $http_code)${NC}"
        echo "Response body:"
        echo "$body"
    fi
    
    echo ""
    
    # Test /chat/completions endpoint with a simple request
    echo "Testing /chat/completions endpoint..."
    test_payload='{
      "model": "gpt-4",
      "messages": [
        {"role": "user", "content": "Hello"}
      ],
      "max_tokens": 5
    }'
    
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $api_key" \
        -H "Content-Type: application/json" \
        -H "Origin: http://localhost:1420" \
        -d "$test_payload" \
        "${endpoint}/chat/completions" 2>&1)
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ /chat/completions endpoint working (HTTP $http_code)${NC}"
    else
        echo -e "${RED}❌ /chat/completions endpoint failed (HTTP $http_code)${NC}"
        echo "Response body:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    
    echo ""
    echo "========================================"
    echo ""
}

# Test Netis Global
echo "📍 Provider 1: Netis Global"
NETIS_GLOBAL_KEY="${VITE_NETIS_GLOBAL_API_KEY:-}"
if [ -z "$NETIS_GLOBAL_KEY" ]; then
    echo -e "${YELLOW}⚠️  VITE_NETIS_GLOBAL_API_KEY not set in environment${NC}"
    echo "Please provide the Netis Global API key:"
    read -r NETIS_GLOBAL_KEY
fi
test_endpoint "Netis Global" "https://llm.netis.io/v1" "$NETIS_GLOBAL_KEY"

# Test Netis Intelligence (Custom)
echo "📍 Provider 2: Netis Intelligence / Custom Provider"
echo "Please provide the Netis Intelligence API endpoint (or press Enter to skip):"
read -r NETIS_CUSTOM_ENDPOINT
if [ -n "$NETIS_CUSTOM_ENDPOINT" ]; then
    echo "Please provide the Netis Intelligence API key:"
    read -r NETIS_CUSTOM_KEY
    test_endpoint "Netis Intelligence" "$NETIS_CUSTOM_ENDPOINT" "$NETIS_CUSTOM_KEY"
else
    echo -e "${YELLOW}⚠️  Skipped - no endpoint provided${NC}"
    echo ""
fi

echo "✅ Testing complete!"
