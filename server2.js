import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractText } from './utils.js';

// ─────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANTE: Render usa proxy → esto evita problemas de IP
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────
// ANTHROPIC
// ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────
app.use(helmet());

// CORS → en producción mejor restringir
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));

app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────
// RATE LIMIT (anti abuso)
// ─────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// ─────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(ext) || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos .txt o .md'));
    }
  },
});

// ─────────────────────────────────────────────────────────
// STATIC FRONTEND
// ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────
// API: ANALYZE
// ─────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const rawText = extractText(req.file.buffer);
    const text = rawText.trim();

    if (!text) {
      return res.status(400).json({ error: 'Archivo vacío.' });
    }

    if (text.length < 50) {
      return res.status(400).json({ error: 'Texto demasiado corto.' });
    }

    const docText = text.slice(0, 12000);

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      temperature: 0.2, // 🔥 clave
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Analiza este documento y genera los juegos educativos:\n\n${docText}`,
        },
      ],
    });

    const raw = message.content.map(b => b.text || '').join('');

    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch (err) {
      console.error('❌ JSON ERROR:', clean.slice(0, 200));
      return res.status(500).json({
        error: 'La IA devolvió JSON inválido',
      });
    }

    return res.json({
      success: true,
      data: parsed,
    });

  } catch (err) {
    console.error('🔥 ERROR:', err);

    if (err.status === 429) {
      return res.status(429).json({
        error: 'Límite de IA alcanzado',
      });
    }

    return res.status(500).json({
      error: err.message || 'Error interno',
    });
  }
});

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ia-minijuegos',
    time: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ─────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 IA-MINIJUEGOS corriendo en puerto ${PORT}`);
});

// ─────────────────────────────────────────────────────────
// PROMPT (NO TOCAR)
// ─────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractText } from './utils.js';

// ─────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANTE: Render usa proxy → esto evita problemas de IP
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────
// ANTHROPIC
// ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────
app.use(helmet());

// CORS → en producción mejor restringir
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));

app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────
// RATE LIMIT (anti abuso)
// ─────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// ─────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(ext) || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos .txt o .md'));
    }
  },
});

// ─────────────────────────────────────────────────────────
// STATIC FRONTEND
// ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────
// API: ANALYZE
// ─────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const rawText = extractText(req.file.buffer);
    const text = rawText.trim();

    if (!text) {
      return res.status(400).json({ error: 'Archivo vacío.' });
    }

    if (text.length < 50) {
      return res.status(400).json({ error: 'Texto demasiado corto.' });
    }

    const docText = text.slice(0, 12000);

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      temperature: 0.2, // 🔥 clave
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Analiza este documento y genera los juegos educativos:\n\n${docText}`,
        },
      ],
    });

    const raw = message.content.map(b => b.text || '').join('');

    const clean = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch (err) {
      console.error('❌ JSON ERROR:', clean.slice(0, 200));
      return res.status(500).json({
        error: 'La IA devolvió JSON inválido',
      });
    }

    return res.json({
      success: true,
      data: parsed,
    });

  } catch (err) {
    console.error('🔥 ERROR:', err);

    if (err.status === 429) {
      return res.status(429).json({
        error: 'Límite de IA alcanzado',
      });
    }

    return res.status(500).json({
      error: err.message || 'Error interno',
    });
  }
});

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ia-minijuegos',
    time: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ─────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 IA-MINIJUEGOS corriendo en puerto ${PORT}`);
});

// ─────────────────────────────────────────────────────────
// PROMPT (NO TOCAR)
// ─────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `Eres un experto pedagogo y diseñador de juegos educativos especializado en el sistema educativo español (primaria, ESO, Bachillerato).
 
Analiza el documento proporcionado y devuelve ÚNICAMENTE un JSON válido (sin markdown, sin explicaciones previas ni posteriores) con esta estructura exacta:
 
{
  "subject": "nombre de la asignatura detectada",
  "subjectEmoji": "emoji apropiado",
  "subjectColor": "#hexcolor",
  "title": "título del tema",
  "description": "descripción breve (1-2 frases)",
  "mainIdeas": ["idea1", "idea2", "idea3", "idea4", "idea5"],
  "keyPoints": ["punto clave 1", "punto clave 2", "punto clave 3", "punto clave 4"],
  "games": [ ...array de juegos... ]
}
 
DETECCIÓN DE ASIGNATURA Y COLOR:
- Lengua Castellana → #e85d4a
- Català / Catalán → #d4a017
- Inglés / English → #2a9d8f
- Matemáticas → #4361ee
- Historia / Sociales / Geografia → #7b2d8b
- Ciencias Naturales / Biología → #2d6a4f
- Física / Química → #0077b6
- Filosofía / Ética → #6d6875
- Arte / Música → #f77f00
- Educación Física → #d62828
- Otra → #7c5cfc
 
JUEGOS A GENERAR (elige 4-5 adaptados al contenido):
 
1. FLASHCARDS (siempre incluir):
{ "id": "fc1", "type": "flashcards", "name": "Tarjetas de repaso", "description": "Voltea las cartas para repasar conceptos clave", "emoji": "🃏",
  "data": { "cards": [ {"front": "pregunta o concepto", "back": "respuesta o definición"} ] }
}
→ Mínimo 8 cartas. Para idiomas: vocabulario/traducción. Para historia: personaje/dato. Para mates: fórmula/significado.
 
2. ORDERING (para historia, procesos científicos, pasos matemáticos):
{ "id": "ord1", "type": "ordering", "name": "Ordena la secuencia", "description": "Arrastra los eventos al orden correcto", "emoji": "📅",
  "data": { "items": [ {"text": "evento o paso", "order": 1} ] }
}
→ Mínimo 6 ítems. El array debe estar DESORDENADO (no en orden 1,2,3...).
 
3. FILL_BLANK (para lengua, ciencias, historia):
{ "id": "fb1", "type": "fill_blank", "name": "Rellena los huecos", "description": "Completa las frases con la palabra correcta", "emoji": "✏️",
  "data": { "exercises": [ {"sentence": "Texto con ___BLANK___ en el lugar del hueco", "answer": "palabra_correcta", "hint": "pista útil"} ] }
}
→ Mínimo 5 ejercicios. Para lengua: gramática/sintaxis. Para ciencias: definiciones. Para historia: fechas/lugares.
 
4. WORD_SORT (para idiomas y lengua):
{ "id": "ws1", "type": "word_sort", "name": "Forma la oración", "description": "Ordena las palabras para construir frases correctas", "emoji": "🔤",
  "data": { "sentences": [ {"words": ["palabra1","palabra2","palabra3","etc"], "correct": "La oración correcta completa"} ] }
}
→ Mínimo 4 oraciones. Palabras mezcladas en el array. Para inglés: oraciones en inglés. Para castellano/catalán: oraciones del tema.
 
5. MEMORY (para vocabulario, conceptos clave):
{ "id": "mem1", "type": "memory", "name": "Memoria de conceptos", "description": "Encuentra las parejas de términos y definiciones", "emoji": "🧠",
  "data": { "pairs": [ {"term": "término corto", "definition": "definición corta (máx 8 palabras)"} ] }
}
→ Exactamente 6 pares.
 
6. CONCEPT_MAP (para ciencias, historia, filosofía):
{ "id": "cm1", "type": "concept_map", "name": "Mapa conceptual", "description": "Explora las relaciones entre los conceptos", "emoji": "🗺️",
  "data": {
    "nodes": [ {"id": "n1", "label": "Concepto", "x": 50, "y": 20, "color": "#hexcolor"} ],
    "edges": [ {"from": "n1", "to": "n2", "label": "relación"} ]
  }
}
→ Entre 6 y 9 nodos. Coordenadas x,y entre 10 y 90. Distribuye los nodos para que no se solapen.
 
REGLAS CRÍTICAS:
- USA SOLO el contenido real del documento para los datos de los juegos
- Las respuestas de fill_blank deben ser palabras simples, sin tildes opcionales
- Los textos de los juegos deben estar en el idioma de la asignatura
- Para Inglés: todos los textos de los juegos en inglés
- Para Catalán: todos los textos en catalán
- El JSON debe ser 100% válido, sin comentarios, sin trailing commas
- Responde SOLO con el JSON, sin ningún texto adicional`;
}
