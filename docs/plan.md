# Project Plan: Enhanced Glean MCP Server with HTTP & Auth

## Project Overview

Janix.ai will fork the existing Glean MCP server to create an enhanced version that adds HTTP transport support and user context switching within a single process. This approach will provide a more scalable, maintainable solution for enterprises using Glean while eliminating the complexity of process management and transport bridging in a proxy-based solution.

## Current Status

1. **Completed Items**:
   - Initial fork and repository setup
   - Basic HTTP server implementation with FastAPI
   - Initial test infrastructure
   - Basic session management
   - Health check endpoint
   - WebSocket endpoint structure
   - Initial authentication framework

2. **Known Issues**:
   - 404 error on `/v1/mcp` endpoint
   - Auth module reload warnings
   - Process transport stability needs improvement
   - Incomplete session management
   - Missing comprehensive testing

## Immediate Fixes Required

1. **HTTP Server Issues**:
   - Fix 404 error on `/v1/mcp` endpoint
   - Verify FastAPI route registration
   - Review middleware setup
   - Ensure proper MCP protocol path handling

2. **Authentication Implementation**:
   - Resolve auth.py reload warnings
   - Complete GleanAuth class implementation
   - Integrate auth with session management properly

3. **Process Transport Stability**:
   - Enhance subprocess management
   - Add robust error handling
   - Implement proper cleanup on shutdown

## Strategic Objectives

1. Create a fully MCP-compliant server with HTTP transport support
2. Implement OAuth-based authentication and user context
3. Maintain backward compatibility with stdio transport
4. Provide analytics and monitoring capabilities
5. Package as a drop-in enhancement to the Glean MCP server

## Technical Approach

### Phase 1: Fork & Initial HTTP Implementation (In Progress)

1. **Completed**:
   - Fork repository
   - Set up CI/CD pipeline
   - Initial HTTP server implementation
   - Basic transport configuration

2. **Remaining Tasks**:
   - Add comprehensive logging
   - Implement proper error responses
   - Add request/response validation
   - Complete transport selection configuration
   - Ensure stdio compatibility
   - Add session timeout mechanisms
   - Implement session cleanup
   - Add session state persistence
   - Enhance error handling

3. **Testing Infrastructure**:
   - Add integration tests
   - Implement authentication flow tests
   - Add session management tests
   - Create load testing scenarios
   - Add error condition testing

### Phase 2: Authentication & User Context (Next Phase)

1. **OAuth Flow**:
   - Add OAuth 2.0 authentication endpoints
   - Implement token validation and refresh
   - Support multiple identity providers

2. **User Context Management**:
   - Create user context model
   - Modify client module to accept user context
   - Implement user mapping to Glean identities

3. **Session Management**:
   - Implement secure session handling
   - Create session persistence layer
   - Add session timeout and renewal mechanisms

### Phase 3: Analytics & Monitoring (Future)

1. **Usage Analytics**:
   - Implement request tracking by user
   - Add query type and performance metrics
   - Create analytics storage layer

2. **Monitoring System**:
   - Enhance health check endpoints
   - Implement performance monitoring
   - Create alerting mechanisms
   - Complete metrics endpoint implementation

3. **Admin Dashboard API**:
   - Design API for admin operations
   - Implement user management endpoints
   - Create reporting endpoints

### Phase 4: Testing & Refinement (Future)

1. **Comprehensive Testing**:
   - Create unit and integration tests
   - Implement load testing
   - Perform security assessment

2. **Performance Optimization**:
   - Identify and address bottlenecks
   - Implement caching where appropriate
   - Optimize resource usage

3. **Documentation**:
   - Create comprehensive API documentation
   - Write deployment guides
   - Develop user manuals

## Security Enhancements

1. **Immediate**:
   - Add rate limiting
   - Configure proper CORS settings
   - Implement security headers
   - Add request validation

2. **Future**:
   - Role-based access control
   - Enhanced authentication methods
   - Security audit implementation
   - Compliance documentation

## Technical Architecture

### Core Components

1. **HTTP Server**
   - FastAPI based HTTP server
   - MCP protocol implementation over HTTP
   - Support for streaming responses via SSE

2. **Authentication Module**
   - OAuth 2.0 implementation
   - Session management
   - User mapping service

3. **Enhanced Client Module**
   - User context support
   - Authentication token management
   - Error handling with user context

4. **Analytics Module**
   - Request tracking
   - Usage metrics
   - Reporting engine

### Deployment Architecture

1. **Containerization**
   - Docker image for easy deployment
   - Environment variable configuration
   - Health check endpoints

2. **Kubernetes Support**
   - Kubernetes deployment manifests
   - Service and ingress definitions
   - Horizontal scaling support

3. **Cloud Provider Support**
   - AWS deployment templates
   - Azure deployment templates
   - GCP deployment templates

## Success Criteria

1. **Functional**
   - HTTP transport works according to MCP specification
   - Authentication and user context switching function correctly
   - Backward compatibility with stdio is maintained

2. **Performance**
   - Response times comparable to or better than original implementation
   - Support for high concurrent user load
   - Efficient resource utilization

3. **Security**
   - Secure authentication flow
   - Proper token handling
   - Secure session management

4. **Usability**
   - Simple deployment process
   - Clear documentation
   - Easy configuration

## Risk Management

1. **Technical Risks**
   - Challenge: Changes to Glean API
     - Mitigation: Build version detection and adaptation
   
   - Challenge: MCP specification changes
     - Mitigation: Design for adaptability to spec changes

   - Challenge: Performance impact of user context
     - Mitigation: Implement efficient context switching

2. **Project Risks**
   - Challenge: Timeline constraints
     - Mitigation: Phased approach with prioritized features

   - Challenge: Testing without full Glean access
     - Mitigation: Develop comprehensive mocks

## Future Enhancements

1. **Role-Based Access Control**
   - Implement granular permissions
   - Create role management system

2. **Enhanced Analytics**
   - Implement advanced usage metrics
   - Create visualization dashboard

3. **Additional Tool Support**
   - Support for custom Glean tools
   - Tool configuration UI

This plan outlines the approach for creating an enhanced Glean MCP server that adds HTTP transport and user context switching while maintaining compatibility with the original implementation.