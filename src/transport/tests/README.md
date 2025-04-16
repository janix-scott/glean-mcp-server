# MCP Server Integration Tests

This directory contains integration tests for the MCP server, testing both HTTP and WebSocket transport layers.

## Setup

1. Install test dependencies:
```bash
pip install -r requirements-test.txt
```

2. Make sure the MCP server is running locally on the default ports:
   - HTTP: 8080
   - WebSocket: 8081

## Running Tests

To run the integration tests:

```bash
python test_integration.py
```

The tests will:
1. Test HTTP transport by sending a "ping" message and a "tools/list" message
2. Test WebSocket transport by sending the same messages
3. Verify responses and connection handling

## Test Output

The test script will output the results of each test case, including:
- Connection success/failure
- Message sending and response validation
- Any errors encountered during testing

If all tests pass, the script will exit with code 0. If any test fails, it will exit with a non-zero code. 