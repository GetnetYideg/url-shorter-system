import { customAlphabet } from 'nanoid';

const alphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateId = customAlphabet(alphabet, 6);

export function generateShortCode(): string {
  return generateId();
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidAlias(alias: string): boolean {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(alias);
}

export function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}
