/**
 * Adapter contract for secure-key-server.
 *
 * @typedef {object} PreparedCredential
 * @property {string} adapter
 * @property {string} endpoint
 * @property {string} credentialKey
 * @property {string} credentialStore
 * @property {string} slot
 * @property {string} toolVersion
 * @property {'configured'|'missing'} status
 * @property {boolean} writable
 *
 * @typedef {object} SecureCredentialAdapter
 * @property {(context: {endpoint: string, workspace: string}) => Promise<PreparedCredential>} prepare
 * @property {(prepared: PreparedCredential, secret: Uint8Array) => Promise<void>} save
 * @property {(prepared: PreparedCredential) => Promise<'configured'|'missing'>} verify
 */

export const ADAPTER_METHODS = Object.freeze(["prepare", "save", "verify"]);

export function assertAdapter(adapter) {
  if (adapter === null || typeof adapter !== "object") {
    throw new TypeError("Adapter must be an object");
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`Adapter is missing ${method}()`);
    }
  }
  return adapter;
}
