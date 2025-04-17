#!/usr/bin/env node

/**
 * Example HTTP client for the Glean MCP server
 * 
 * This client demonstrates how to connect to the MCP server using HTTP transport
 * and execute a simple search query using the glean_search tool.
 */

import axios from 'axios';
import readline from 'readline';
import { EventSource } from 'eventsource';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MCP_ENDPOINT = `${SERVER_URL}/v1/mcp`;

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Client to communicate with MCP server
class MCPClient {
  constructor() {
    this.sessionId = null;
    this.eventSource = null;
  }

  // Initialize the session with the MCP server
  async initialize() {
    try {
      console.log('Initializing session with MCP server...');
      
      const response = await axios.post(
        MCP_ENDPOINT,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'Glean MCP HTTP Client',
              version: '1.0.0'
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      // Store the session ID for future requests
      this.sessionId = response.headers['mcp-session-id'];
      console.log(`Session initialized with ID: ${this.sessionId}`);

      // Send initialized notification
      await this.sendInitializedNotification();
      
      // Set up event source for receiving server messages
      this.setupEventSource();
      
      return true;
    } catch (error) {
      console.error('Error initializing session:', error.message);
      return false;
    }
  }

  // Send the initialized notification
  async sendInitializedNotification() {
    try {
      await axios.post(
        MCP_ENDPOINT,
        {
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': this.sessionId
          }
        }
      );
      console.log('Sent initialized notification');
    } catch (error) {
      console.error('Error sending initialized notification:', error.message);
      throw error;
    }
  }

  // Setup Server-Sent Events (SSE) connection
  setupEventSource() {
    const url = new URL(MCP_ENDPOINT);
    
    this.eventSource = new EventSource(url.toString(), {
      headers: {
        'Mcp-Session-Id': this.sessionId
      }
    });

    this.eventSource.onopen = () => {
      console.log('SSE connection established');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('\nReceived message:', JSON.stringify(message, null, 2));
        
        // Handle different message types
        if (message.id) {
          console.log(`Response received for request ID: ${message.id}`);
          
          if (message.result?.content) {
            // Extract text content from tool response
            const textContent = message.result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
            
            console.log('\n--- Result ---\n');
            console.log(textContent);
            console.log('\n--------------\n');
          }
        }
        
        // Prompt for next action
        this.promptForInput();
      } catch (error) {
        console.error('Error handling SSE message:', error.message);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };
  }

  // List available tools
  async listTools() {
    try {
      console.log('Requesting tools list...');
      
      await axios.post(
        MCP_ENDPOINT,
        {
          jsonrpc: '2.0',
          id: '2',
          method: 'tools/list'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': this.sessionId
          }
        }
      );
      
      console.log('Tools list request sent');
    } catch (error) {
      console.error('Error listing tools:', error.message);
    }
  }

  // Execute a search query
  async search(query) {
    try {
      console.log(`Executing search query: "${query}"...`);
      
      await axios.post(
        MCP_ENDPOINT,
        {
          jsonrpc: '2.0',
          id: '3',
          method: 'tools/call',
          params: {
            name: 'glean_search',
            arguments: {
              query
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': this.sessionId
          }
        }
      );
      
      console.log('Search request sent');
    } catch (error) {
      console.error('Error executing search:', error.message);
    }
  }

  // Execute a chat query
  async chat(prompt) {
    try {
      console.log(`Sending chat prompt: "${prompt}"...`);
      
      await axios.post(
        MCP_ENDPOINT,
        {
          jsonrpc: '2.0',
          id: '4',
          method: 'tools/call',
          params: {
            name: 'glean_chat',
            arguments: {
              prompt
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': this.sessionId
          }
        }
      );
      
      console.log('Chat request sent');
    } catch (error) {
      console.error('Error executing chat:', error.message);
    }
  }

  // Close the session and clean up
  async close() {
    if (this.eventSource) {
      this.eventSource.close();
      console.log('Closed SSE connection');
    }
    
    if (this.sessionId) {
      try {
        // Explicitly close the session on the server
        await axios.delete(
          MCP_ENDPOINT,
          {
            headers: {
              'Mcp-Session-Id': this.sessionId
            }
          }
        );
        console.log('Session closed on server');
      } catch (error) {
        console.error('Error closing session:', error.message);
      }
    }
    
    rl.close();
  }

  // Prompt user for the next action
  promptForInput() {
    rl.question('\nEnter a command (search <query>, chat <prompt>, tools, exit): ', async (input) => {
      const command = input.trim();
      
      if (command.startsWith('search ')) {
        const query = command.substring(7).trim();
        await this.search(query);
      } else if (command.startsWith('chat ')) {
        const prompt = command.substring(5).trim();
        await this.chat(prompt);
      } else if (command === 'tools') {
        await this.listTools();
      } else if (command === 'exit') {
        await this.close();
      } else {
        console.log('Unknown command. Available commands: search <query>, chat <prompt>, tools, exit');
        this.promptForInput();
      }
    });
  }
}

// Main execution
(async () => {
  const client = new MCPClient();
  const initialized = await client.initialize();
  
  if (initialized) {
    console.log('\nMCP client ready!');
    console.log('------------------');
    console.log('Commands:');
    console.log('  tools - List available tools');
    console.log('  search <query> - Execute a search query');
    console.log('  chat <prompt> - Chat with the assistant');
    console.log('  exit - Close the session and exit');
    console.log('------------------\n');
    
    client.promptForInput();
  } else {
    console.error('Failed to initialize MCP client. Exiting...');
    process.exit(1);
  }
})().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 