/**
 * Authenticated HTTP client for the Fulcra API
 *
 * This class provides low-level HTTP methods (get, post, put, delete) and
 * high-level domain methods for specific API endpoints. When adding new
 * functionality, add methods here following the existing pattern.
 *
 * Fulcra REST API documentation: https://docs.fulcradynamics.com/rest-api/
 */
export class FulcraAPI {
  /** @param {string} apiEndpoint @param {string | undefined} accessToken @param {typeof fetch} [transport] */
  constructor(apiEndpoint, accessToken, transport = fetch) {
    this.apiEndpoint = apiEndpoint;
    this.accessToken = accessToken;
    this.transport = transport;
  }

  /**
   * Low-level HTTP request method
   * @private
   * @param {string} method
   * @param {string} path
   * @param {unknown} [data]
   * @param {AbortSignal} [signal]
   */
  async request(method, path, data, signal) {
    const url = `${this.apiEndpoint}${path}`;

    /** @type {RequestInit} */
    const options = {
      signal,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`
      }
    };

    if (data !== undefined) {
      options.body = JSON.stringify(data);
    }

    const response = await this.transport(url, options);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return;
    }

    return await response.json();
  }

  // Low-level HTTP methods
  /** @param {string} path @param {AbortSignal} [signal] */
  async get(path, signal) {
    return this.request('GET', path, undefined, signal);
  }

  /** @param {string} path @param {unknown} data */
  async post(path, data) {
    return this.request('POST', path, data);
  }

  /** @param {string} path @param {unknown} data */
  async put(path, data) {
    return this.request('PUT', path, data);
  }

  /** @param {string} path */
  async delete(path) {
    return this.request('DELETE', path);
  }

  // ============================================================
  // High-level API methods
  // Add new Fulcra API methods here following this pattern:
  // - Clear method names that describe what they fetch/do
  // - JSDoc comments for parameters and return types
  // - Use the low-level HTTP methods above
  // ============================================================

  /**
   * Get current user's info
   * @returns {Promise<Object>} User info including userid, email, preferences, etc.
   */
  async getUserInfo() {
    return this.get('user/v1alpha1/info');
  }

  /**
   * Get current user's preferences
   * @returns {Promise<Object>} User preferences including timezone, selected metrics, etc.
   */
  async getUserPreferences() {
    return this.get('user/v1alpha1/preferences');
  }

  /**
   * Update current user's preferences
   * @param {Object} preferences - Partial preferences object to update
   * @returns {Promise<Object>} Updated preferences
   */
  async updateUserPreferences(preferences) {
    return this.post('user/v1alpha1/preferences', preferences);
  }
}
