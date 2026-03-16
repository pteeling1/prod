/**
 * Auth0 Authentication Module
 * Handles user login, logout, token management, and user state
 */

import { Auth0Client } from 'https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2/dist/auth0-spa-js.production.js';

let auth0Client = null;

/**
 * Initialize Auth0 client
 * Call this once on app load
 */
export async function initAuth0() {
  const isDev = window.location.hostname === 'dev.teeling.ai' || window.location.hostname === 'localhost';
  
  auth0Client = new Auth0Client({
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: import.meta.env.VITE_AUTH0_AUDIENCE || 'https://sizer.teeling.ai'
    }
  });

  // Handle redirect from Auth0 callback
  const query = window.location.search;
  if (query.includes('code=') && query.includes('state=')) {
    try {
      await auth0Client.handleRedirectCallback();
      // Remove query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Error handling Auth0 callback:', error);
    }
  }

  return auth0Client;
}

/**
 * Redirect user to Auth0 login page
 */
export async function login() {
  try {
    await auth0Client.loginWithPopup();
    // Trigger UI update after successful login
    window.dispatchEvent(new CustomEvent('auth-changed'));
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

/**
 * Logout user and clear session
 */
export async function logout() {
  try {
    auth0Client.logout({
      returnTo: window.location.origin
    });
    window.dispatchEvent(new CustomEvent('auth-changed'));
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
}

/**
 * Get current access token for API calls
 */
export async function getAccessToken() {
  if (!auth0Client) {
    throw new Error('Auth0 not initialized');
  }

  try {
    return await auth0Client.getTokenSilently();
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

/**
 * Get authenticated user info
 */
export async function getUser() {
  if (!auth0Client) {
    throw new Error('Auth0 not initialized');
  }

  try {
    return await auth0Client.getUser();
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  if (!auth0Client) {
    throw new Error('Auth0 not initialized');
  }

  try {
    return await auth0Client.isAuthenticated();
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

/**
 * Get Auth0 client instance
 */
export function getAuth0Client() {
  return auth0Client;
}
