/**
 * Extracts clean UTF-8 text from a Buffer.
 * Tries UTF-8 first; falls back to Latin-1 if it detects replacement chars.
 */
export function extractText(buffer) {
  // Try UTF-8
  let text = buffer.toString('utf-8');
  // If we see the UTF-8 replacement char, try latin1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text;
}

/**
 * Very rough token estimator (1 token ≈ 4 chars for Spanish text).
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}