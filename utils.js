/**
 * Extracts clean UTF-8 text from a Buffer.
 * Tries UTF-8 first; falls back to Latin-1 if needed.
 */
export function extractText(buffer) {
  if (!buffer || buffer.length === 0) return '';

  // Try UTF-8
  let text = buffer.toString('utf-8');

  // If replacement chars appear → fallback to latin1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }

  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');

  return text.trim();
}

/**
 * Rough token estimator (1 token ≈ 4 chars for Spanish text).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
