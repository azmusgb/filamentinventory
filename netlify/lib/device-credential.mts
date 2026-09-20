import { createHash } from 'node:crypto';

export const DEVICE_CREDENTIAL_SCOPE = 'device-feed:v1';
export const MAX_DEVICE_CREDENTIALS = 16;

export type DeviceCredentialRecord = {
  schemaVersion:1;
  credentialId:string;
  tokenHash:string;
  scope:typeof DEVICE_CREDENTIAL_SCOPE;
  profile:'Bill'|'Aimee';
  inventoryKey:string;
  deviceId:string;
  deviceName:string;
  createdAt:string;
};

export type DeviceCredentialIndexRow = {
  credentialId:string;
  tokenHash:string;
  deviceId:string;
  deviceName:string;
  createdAt:string;
};

export function validDeviceToken(value:unknown):string|null {
  const token = String(value ?? '').trim();
  return /^fi_dev_[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function hashDeviceToken(token:string):string {
  return createHash('sha256').update(token).digest('hex');
}

export function deviceCredentialKey(tokenHash:string):string {
  return `device-credential-${String(tokenHash || '').toLowerCase()}`;
}

export function deviceCredentialIndexKey(scopeHash:string):string {
  return `device-credentials-${String(scopeHash || '').toLowerCase()}`;
}

export function scopeHash(syncKey:string, profile:'Bill'|'Aimee'):string {
  return createHash('sha256').update(`${profile.toLowerCase()}:${syncKey}`).digest('hex');
}

export function inventoryKeyForScope(scopeHashValue:string):string {
  return `inventory-${String(scopeHashValue || '').toLowerCase()}`;
}

export function publicCredential(row:DeviceCredentialIndexRow) {
  return {
    credentialId:row.credentialId,
    deviceId:row.deviceId,
    deviceName:row.deviceName,
    createdAt:row.createdAt,
    scope:DEVICE_CREDENTIAL_SCOPE,
  };
}

export function sanitizeDevice(value:any):{id:string; name:string} {
  const id = String(value?.id || '')
    .replace(/[^A-Za-z0-9_-]/g,'')
    .slice(0,64);
  const name = String(value?.name || 'Workshop OS')
    .trim()
    .slice(0,60) || 'Workshop OS';
  return {id:id || 'workshop-os', name};
}

export async function revokeDeviceCredentials(
  store:any,
  scopeHashValue:string,
):Promise<{revoked:number}> {
  const indexKey = deviceCredentialIndexKey(scopeHashValue);
  const rows = await store.get(indexKey, {type:'json'});
  const list:DeviceCredentialIndexRow[] = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (/^[0-9a-f]{64}$/.test(String(row?.tokenHash || ''))) {
      await store.delete(deviceCredentialKey(row.tokenHash));
    }
  }
  await store.delete(indexKey);
  return {revoked:list.length};
}
