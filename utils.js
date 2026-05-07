import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

// ─────────────────────────────
// EXTRACCIÓN DE TEXTO PRINCIPAL
// Detecta el tipo de archivo y extrae el texto correctamente
// ─────────────────────────────
export async function extractText(buffer, mimetype = '') {
  if (!buffer) return '';

  const mime = mimetype.toLowerCase();

  // PDF
  if (mime === 'application/pdf' || mime.includes('pdf')) {
    return await extractFromPDF(buffer);
  }

  // DOCX / Word
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    mime.includes('word') ||
    mime.includes('docx')
  ) {
    return await extractFromDOCX(buffer);
  }

  // TXT / plain text (por defecto)
  return extractFromText(buffer);
}

// ─────────────────────────────
// PDF
// ─────────────────────────────
async function extractFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return cleanText(data.text);
  } catch (err) {
    console.error('Error extrayendo PDF:', err.message);
    throw new Error('No se pudo leer el PDF. Asegúrate de que no esté protegido.');
  }
}

// ─────────────────────────────
// DOCX
// ─────────────────────────────
async function extractFromDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  } catch (err) {
    console.error('Error extrayendo DOCX:', err.message);
    throw new Error('No se pudo leer el documento Word.');
  }
}

// ─────────────────────────────
// TXT / PLAIN TEXT
// ─────────────────────────────
function extractFromText(buffer) {
  let text = buffer.toString('utf-8');

  // Fallback a latin1 si hay caracteres corruptos
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
  }

  // Eliminar BOM si existe
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  return cleanText(text);
}

// ─────────────────────────────
// LIMPIEZA DE TEXTO COMÚN
// ─────────────────────────────
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')                         // Normalizar saltos de línea
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // Eliminar caracteres de control
    .replace(/\n{3,}/g, '\n\n')                      // Máximo 2 saltos seguidos
    .trim();
}

// ─────────────────────────────
// DETECTAR TIPO POR EXTENSIÓN (fallback si no hay mimetype)
// ─────────────────────────────
export function getMimeFromFilename(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    txt:  'text/plain',
    md:   'text/plain',
  };
  return map[ext] || 'text/plain';
}

// ─────────────────────────────
// ESTIMACIÓN DE TOKENS
// ─────────────────────────────
export function estimateTokens(text) {
  return Math.ceil((text?.length || 0) / 4);
}
