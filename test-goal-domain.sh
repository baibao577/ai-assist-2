#!/bin/bash

# Goal Domain Comprehensive Testing Script
echo "================================================"
echo "Goal Domain Testing Suite"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Clear previous test data
echo -e "${YELLOW}Clearing previous test logs...${NC}"
> app.log

# Test function
run_test() {
    local test_name=$1
    local test_input=$2
    echo -e "\n${GREEN}Running Test: ${test_name}${NC}"
    echo "Input: \"${test_input}\""
    echo "---"
    echo "$test_input" | npm run cli chat -- --new --debug 2>/dev/null | tail -20
    echo "---"
    sleep 2
}

# Test 1: Create a new goal
run_test "Create New Goal" "I want to set a goal to read 12 books this year"

# Test 2: Create duplicate goal (should prevent or merge)
run_test "Create Duplicate Goal" "I want to read 12 books this year"

# Test 3: Update progress on single goal
run_test "Update Progress (Single Goal)" "I finished reading 3 books"

# Test 4: Create another goal for testing clarification
run_test "Create Another Goal" "I want to exercise 150 minutes per week"

# Test 5: Update progress with ambiguous request (should trigger clarification)
run_test "Update Progress (Multiple Goals)" "I made progress today: 30"

# Test 6: Respond to clarification
run_test "Select Goal from Clarification" "2"

# Test 7: View all goals
run_test "View Goals" "Show me my goals"

# Test 8: Check progress
run_test "Check Progress" "How am I doing on my reading goal?"

echo -e "\n${YELLOW}================================================${NC}"
echo -e "${YELLOW}Testing Complete - Checking Database...${NC}"
echo -e "${YELLOW}================================================${NC}"

# Check database
echo -e "\n${GREEN}Goals Table:${NC}"
sqlite3 data/assistant.db "SELECT id, title, target_value, current_value, status, datetime(created_at, 'unixepoch') as created_at FROM goals;" 2>/dev/null || echo "Database query failed"

echo -e "\n${GREEN}Progress Entries Table:${NC}"
sqlite3 data/assistant.db "SELECT id, goal_id, value, notes, datetime(logged_at, 'unixepoch') as logged_at FROM progress_entries ORDER BY logged_at DESC LIMIT 10;" 2>/dev/null || echo "Database query failed"

echo -e "\n${GREEN}Recent Log Entries:${NC}"
echo "---"
tail -50 app.log | grep -E "(Goal|Progress|EXTRACTOR|STEERING)" | head -20
echo "---"

echo -e "\n${GREEN}Test Suite Complete!${NC}"