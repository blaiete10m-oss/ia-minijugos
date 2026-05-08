import mammoth from 'mammoth';
import { createRequire } from 'module';

// pdf-parse necesita require() en ESM — esta es la forma correcta en Render/Node 18+
const require = createRequire(import.meta.url);

// ─────────────────────────────
// EXTRACCIÓN DE TEXTO PRINCIPAL
// Detecta el tipo de archivo y extrae el texto correctamente
// ─────────────────────────────
export async function extractText(buffer, mimetype = '') {
  if (!buffer || buffer.length === 0) return '';

  const mime = mimetype.toLowerCase();

  // PDF — también detectar por magic bytes (%PDF)
  const isPDF = mime === 'application/pdf' ||
                mime.includes('pdf') ||
                buffer.slice(0, 4).toString() === '%PDF';

  if (isPDF) {
    return await extractFromPDF(buffer);
  }

  // DOCX / Word — detectar por magic bytes (PK zip header)
  const isDOCX = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 mime === 'application/msword' ||
                 mime.includes('word') ||
                 mime.includes('docx') ||
                 (buffer[0] === 0x50 && buffer[1] === 0x4B); // PK zip

  if (isDOCX) {
    return await extractFromDOCX(buffer);
  }

  // TXT / plain text (por defecto)
  return extractFromText(buffer);
}

// ─────────────────────────────
// PDF
// ─────────────────────────────
async function extractFromPDF(buffer) {
  // Validar tamaño mínimo — un PDF válido nunca pesa menos de 1KB
  if (buffer.length < 1000) {
    throw new Error('El PDF parece estar vacío o corrupto (tamaño demasiado pequeño).');
  }

  try {
    // Importar con require para evitar el bug de pdf-parse en ESM/Render
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, {
      // Evitar que pdf-parse intente leer archivos de test locales
      version: 'v1.10.100'
    });

    const text = cleanText(data.text);

    if (!text || text.length < 20) {
      throw new Error('El PDF no contiene texto legible. Puede ser un PDF de imágenes escaneadas.');
    }

    return text;
  } catch (err) {
    console.error('Error extrayendo PDF:', err.message);

    // Mensajes de error más claros según el tipo de fallo
    if (err.message.includes('vacío') || err.message.includes('legible')) {
      throw err; // Re-lanzar el nuestro
    }
    if (err.message.includes('password') || err.message.includes('encrypt')) {
      throw new Error('El PDF está protegido con contraseña. Usa un PDF sin protección.');
    }
    throw new Error(`No se pudo leer el PDF: ${err.message}`);
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
