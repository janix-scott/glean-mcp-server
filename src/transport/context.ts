/**
 * @fileoverview User context management for transport layer
 * 
 * This module provides utilities for managing user context across sessions
 * with the Glean API, supporting the "act-as" parameter for user impersonation
 * with a global token.
 */

import { resetClient } from '../common/client.js';
import fetch, { Response } from 'node-fetch';

// Session context information
interface SessionContext {
  sessionId: string;
  userEmail?: string;
}

// Map of session ID to user context
const sessionContextMap = new Map<string, SessionContext>();

/**
 * Register a session with an optional user context
 * 
 * @param sessionId Session identifier
 * @param userEmail Optional user email for "act-as" parameter
 */
export function registerSessionContext(sessionId: string, userEmail?: string): void {
  sessionContextMap.set(sessionId, {
    sessionId,
    userEmail
  });
  console.log(`Registered session ${sessionId}${userEmail ? ` with user context: ${userEmail}` : ''}`);
}

/**
 * Get the user context for a session
 * 
 * @param sessionId Session identifier
 * @returns The user email for "act-as" or undefined if not set
 */
export function getSessionUserContext(sessionId: string): string | undefined {
  return sessionContextMap.get(sessionId)?.userEmail;
}

/**
 * Update the user context for an existing session
 * 
 * @param sessionId Session identifier
 * @param userEmail User email for "act-as" parameter
 * @returns true if session was found and updated, false otherwise
 */
export function updateSessionUserContext(sessionId: string, userEmail: string): boolean {
  const context = sessionContextMap.get(sessionId);
  if (context) {
    context.userEmail = userEmail;
    console.log(`Updated user context for session ${sessionId} to ${userEmail}`);
    
    // Reset the client to force recreation with new context
    resetClient();
    
    return true;
  }
  return false;
}

/**
 * Remove session context when session is terminated
 * 
 * @param sessionId Session identifier
 * @returns true if session was found and removed, false otherwise
 */
export function removeSessionContext(sessionId: string): boolean {
  const result = sessionContextMap.delete(sessionId);
  if (result) {
    console.log(`Removed context for session ${sessionId}`);
  }
  return result;
}

/**
 * Get the current size of the session context map (useful for monitoring)
 */
export function getSessionContextCount(): number {
  return sessionContextMap.size;
}

/**
 * Set the GLEAN_ACT_AS environment variable based on the session context
 * 
 * @param sessionId Session identifier
 * @returns true if environment was updated, false otherwise
 */
export function setUserContextForSession(sessionId: string): boolean {
  const userEmail = getSessionUserContext(sessionId);
  
  if (userEmail) {
    process.env.GLEAN_ACT_AS = userEmail;
    return true;
  } else {
    // If no user context, remove any existing act-as setting
    delete process.env.GLEAN_ACT_AS;
    return false;
  }
}

/**
 * Clear the GLEAN_ACT_AS environment variable
 */
export function clearUserContext(): void {
  delete process.env.GLEAN_ACT_AS;
} 