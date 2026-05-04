export function extractText(buffer) {
  if (!buffer) return '';

  let text = buffer.toString('utf-8');

  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  text = text.replace(/\r\n/g, '\n');

  // limpieza más segura
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return text.trim();
}

export function estimateTokens(text) {
  return Math.ceil((text?.length || 0) / 4);
}
