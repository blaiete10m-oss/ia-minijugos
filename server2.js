import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractText } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ⚠️ IMPORTANTE para Render
const PORT = process.env.PORT || 10000;

// ── Anthropic client ──────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Falta ANTHROPIC_API_KEY en variables de entorno');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Security & middleware ─────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));

app.use(express.json({ limit: '1mb' }));

// ⚠️ Trust proxy (Render usa proxy)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // subido un poco para evitar bloqueos en prod
  message: { error: 'Demasiadas peticiones. Espera 15 minutos.' },
});

// ── File upload ───────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(ext) || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos de texto (.txt, .md)'));
    }
  },
});

// ── Static frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── API: Analyze document ─────────────────────────────────────────────────────
app.post('/api/analyze', limiter, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const rawText = extractText(req.file.buffer);
    const trimmed = rawText.trim();

    if (!trimmed) {
      return res.status(400).json({ error: 'El archivo está vacío.' });
    }

    if (trimmed.length < 50) {
      return res.status(400).json({ error: 'El documento es demasiado corto.' });
    }

    const docText = trimmed.slice(0, 12000);

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest', // ⚠️ modelo válido
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Analiza este documento y genera los juegos educativos:\n\n${docText}`,
        },
      ],
    });

    const rawTextResponse = message.content
      .map(b => b.text || '')
      .join('');

    const cleanJson = rawTextResponse
      .replace(/```json|```/g, '')
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error('❌ JSON inválido:', rawTextResponse.slice(0, 300));
      return res.status(500).json({
        error: 'La IA devolvió JSON inválido.',
      });
    }

    res.json({ success: true, data: parsed });

  } catch (err) {
    console.error('❌ Error en /api/analyze:', err);

    if (err.status === 429) {
      return res.status(429).json({
        error: 'Límite de la API alcanzado.',
      });
    }

    res.status(500).json({
      error: err.message || 'Error interno del servidor.',
    });
  }
});

// ── Health check (Render lo usa) ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// ── Prompt builder ────────────────────────────────────────────────────────────
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
