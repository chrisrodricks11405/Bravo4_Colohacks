import * as Crypto from "expo-crypto";
import { sanitizeText } from "./sanitization";

const SESSION_ACCESS_TOKEN_BYTES = 24;

function bytesToHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateSessionAccessToken() {
  return bytesToHex(await Crypto.getRandomBytesAsync(SESSION_ACCESS_TOKEN_BYTES));
}

export async function hashSessionAccessToken(token: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    sanitizeText(token, { maxLength: 128 })
  );
}

export async function createSessionAccessTokenPair() {
  const accessToken = await generateSessionAccessToken();

  return {
    accessToken,
    accessTokenHash: await hashSessionAccessToken(accessToken),
  };
}

export function extractSessionAccessToken(qrPayload?: string) {
  const normalizedPayload = sanitizeText(qrPayload, {
    allowMultiline: false,
    maxLength: 400,
  });

  if (!normalizedPayload) {
    return undefined;
  }

  try {
    const url = new URL(normalizedPayload);
    const token = url.searchParams.get("token");
    return token?.trim() || undefined;
  } catch {
    const tokenMatch = normalizedPayload.match(/[?&]token=([^&]+)/i);
    return tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : undefined;
  }
}
