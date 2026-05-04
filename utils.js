/**
 * Extracts clean text from a Buffer.
 * Handles UTF-8, Latin-1, BOM and cleans weird characters.
 */
export function extractText(buffer) {
  if (!buffer) return '';

  let text;

  // 1. Try UTF-8
  text = buffer.toString('utf-8');

  // 2. If corrupted characters appear → fallback Latin-1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }

  // 3. Remove BOM (Byte Order Mark)
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // 4. Normalize line breaks
  text = text.replace(/\r\n/g, '\n');

  // 5. Remove weird control characters (except \n and \t)
  text = text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uFFFF]/g, '');

  return text.trim();
}

/**
 * Rough token estimator (1 token ≈ 4 chars in Spanish/English)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
