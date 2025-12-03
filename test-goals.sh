#!/bin/bash

# Test script for Goal Domain functionality

echo "=== Goal Domain Test Suite ==="
echo ""

# Test 1: Create a new goal
echo "Test 1: Creating a new goal"
echo "I want to set a goal to read 2 books per month" | npm run cli chat -- --new 2>&1 | tail -20

echo ""
echo "Press Enter to continue..."
read

# Test 2: Try to create duplicate goal
echo "Test 2: Attempting to create duplicate goal"
echo "Set a goal to read 2 books each month" | npm run cli chat 2>&1 | tail -20

echo ""
echo "Press Enter to continue..."
read

# Test 3: Log progress
echo "Test 3: Logging progress"
echo "I read 1 book this week" | npm run cli chat 2>&1 | tail -20

echo ""
echo "Press Enter to continue..."
read

# Test 4: Create another goal for testing clarification
echo "Test 4: Creating another book-related goal"
echo "I want to read 10 books this year" | npm run cli chat 2>&1 | tail -20

echo ""
echo "Press Enter to continue..."
read

# Test 5: Log progress that needs clarification
echo "Test 5: Logging progress that needs clarification"
echo "I finished 3 books" | npm run cli chat 2>&1 | tail -30

echo ""
echo "=== Test Complete ==="
echo "Check app.log and database for verification"