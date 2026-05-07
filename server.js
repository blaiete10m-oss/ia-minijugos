import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractText, getMimeFromFilename, estimateTokens } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ─────────────────────────────
// GROQ
// ─────────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ─────────────────────────────
// SEGURIDAD
// ─────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
});

app.use('/api', limiter);

// ─────────────────────────────
// UPLOAD — acepta TXT, PDF, DOCX
// ─────────────────────────────
const ALLOWED_MIMES = [
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    const extMime = getMimeFromFilename(file.originalname);
    if (ALLOWED_MIMES.includes(mime) || ALLOWED_MIMES.includes(extMime)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado. Usa TXT, PDF o DOCX.'));
    }
  },
});

// ─────────────────────────────
// ESTÁTICO
// ─────────────────────────────
app.use(express.static(__dirname));

// ─────────────────────────────
// UTILIDAD — extraer y validar JSON de la respuesta de la IA
// ─────────────────────────────
function parseAIJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('La IA no devolvió JSON válido');
  return JSON.parse(raw.slice(start, end + 1));
}

// ─────────────────────────────
// UTILIDAD — extraer texto del archivo subido
// ─────────────────────────────
async function getTextFromFile(file) {
  const mime = file.mimetype || getMimeFromFilename(file.originalname);
  const text = await extractText(file.buffer, mime);
  if (!text || text.length < 50) {
    throw new Error('El documento está vacío o es demasiado corto.');
  }
  return text;
}

// ─────────────────────────────
// POST /api/analyze — Minijuegos
// ─────────────────────────────
app.post('/api/analyze', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    const text = await getTextFromFile(req.file);
    const docText = text.slice(0, 6000);

    console.log(`📄 Minijuegos | Archivo: ${req.file.originalname} | ~${estimateTokens(docText)} tokens`);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildGamesPrompt() },
        { role: 'user', content: docText },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = parseAIJson(raw);

    res.json({ success: true, data: parsed });

  } catch (err) {
    console.error('❌ /api/analyze:', err.message);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// ─────────────────────────────
// POST /api/summarize — Resúmenes y Esquemas
// ─────────────────────────────
app.post('/api/summarize', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    const text = await getTextFromFile(req.file);
    const docText = text.slice(0, 8000); // más contexto para resúmenes

    console.log(`📄 Resumen | Archivo: ${req.file.originalname} | ~${estimateTokens(docText)} tokens`);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        { role: 'system', content: buildSummaryPrompt() },
        { role: 'user', content: docText },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = parseAIJson(raw);

    res.json({ success: true, data: parsed });

  } catch (err) {
    console.error('❌ /api/summarize:', err.message);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// ─────────────────────────────
// POST /api/analyze-all — Todo en uno (juegos + resumen + esquema)
// ─────────────────────────────
app.post('/api/analyze-all', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo.' });
    }

    const text = await getTextFromFile(req.file);
    const docText = text.slice(0, 6000);

    console.log(`📄 Todo-en-uno | Archivo: ${req.file.originalname} | ~${estimateTokens(docText)} tokens`);

    // Lanzar ambas IAs en paralelo para mayor velocidad
    const [gamesRes, summaryRes] = await Promise.all([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        messages: [
          { role: 'system', content: buildGamesPrompt() },
          { role: 'user', content: docText },
        ],
      }),
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        messages: [
          { role: 'system', content: buildSummaryPrompt() },
          { role: 'user', content: docText },
        ],
      }),
    ]);

    const gamesRaw = gamesRes.choices?.[0]?.message?.content || '';
    const summaryRaw = summaryRes.choices?.[0]?.message?.content || '';

    const games = parseAIJson(gamesRaw);
    const summary = parseAIJson(summaryRaw);

    res.json({
      success: true,
      data: {
        games,
        summary,
      },
    });

  } catch (err) {
    console.error('❌ /api/analyze-all:', err.message);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// ─────────────────────────────
// GET /api/health
// ─────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'ia-minijuegos', version: '2.0.0' });
});

app.get('/', (_req, res) => {
  res.send('IA Minijuegos v2.0 funcionando 🚀');
});

// ─────────────────────────────
// ERROR HANDLER — multer y genérico
// ─────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Error global:', err.message);
  res.status(400).json({ error: err.message || 'Error desconocido' });
});

// ─────────────────────────────
// START
// ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 IA-MINIJUEGOS v2.0 en puerto ${PORT}`);
  console.log(`📁 Formatos soportados: TXT, PDF, DOCX`);
  console.log(`🎮 Endpoints: /api/analyze | /api/summarize | /api/analyze-all`);
});

// ═════════════════════════════════════════════════════════════════
// PROMPTS
// ═════════════════════════════════════════════════════════════════

// ─────────────────────────────
// PROMPT — MINIJUEGOS (igual que antes, sin cambios)
// ─────────────────────────────
function buildGamesPrompt() {
  return `Eres un experto pedagogo y diseñador de juegos educativos especializado en el sistema educativo español (primaria, ESO, Bachillerato).

Analiza el documento proporcionado y devuelve ÚNICAMENTE un JSON válido (sin markdown, sin explicaciones) con esta estructura:

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
→ Mínimo 8 cartas.

2. ORDERING (para historia, procesos, pasos):
{ "id": "ord1", "type": "ordering", "name": "Ordena la secuencia", "description": "Arrastra los eventos al orden correcto", "emoji": "📅",
  "data": { "items": [ {"text": "evento o paso", "order": 1} ] }
}
→ Mínimo 6 ítems. Array DESORDENADO.

3. FILL_BLANK (para lengua, ciencias, historia):
{ "id": "fb1", "type": "fill_blank", "name": "Rellena los huecos", "description": "Completa las frases con la palabra correcta", "emoji": "✏️",
  "data": { "exercises": [ {"sentence": "Texto con ___BLANK___ en el lugar del hueco", "answer": "palabra_correcta", "hint": "pista útil"} ] }
}
→ Mínimo 5 ejercicios.

4. WORD_SORT (para idiomas y lengua):
{ "id": "ws1", "type": "word_sort", "name": "Forma la oración", "description": "Ordena las palabras para construir frases correctas", "emoji": "🔤",
  "data": { "sentences": [ {"words": ["palabra1","palabra2","palabra3"], "correct": "La oración correcta"} ] }
}
→ Mínimo 4 oraciones.

5. MEMORY (para vocabulario):
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
→ Entre 6 y 9 nodos. Coordenadas x,y entre 10 y 90.

REGLAS CRÍTICAS:
- USA SOLO el contenido real del documento
- Las respuestas de fill_blank deben ser palabras simples
- El JSON debe ser 100% válido, sin comentarios, sin trailing commas
- Responde SOLO con el JSON`;
}

// ─────────────────────────────
// PROMPT — RESÚMENES Y ESQUEMAS (NUEVO)
// ─────────────────────────────
function buildSummaryPrompt() {
  return `Eres un experto pedagogo especializado en el sistema educativo español (primaria, ESO, Bachillerato).

Analiza el documento proporcionado y devuelve ÚNICAMENTE un JSON válido (sin markdown, sin explicaciones) con esta estructura:

{
  "subject": "nombre de la asignatura detectada",
  "subjectEmoji": "emoji apropiado",
  "subjectColor": "#hexcolor",
  "title": "título del tema",

  "summary": {
    "short": "Resumen breve de 2-3 frases que captura lo esencial del tema",
    "medium": "Resumen completo de 8-12 frases que explica el tema con todos sus aspectos importantes, ideal para repasar antes de un examen",
    "keyTerms": [
      { "term": "término importante", "definition": "definición clara y concisa" }
    ]
  },

  "outline": {
    "title": "título del esquema",
    "sections": [
      {
        "id": "s1",
        "title": "Título de la sección principal",
        "emoji": "emoji relevante",
        "color": "#hexcolor",
        "content": "Explicación breve de esta sección (2-3 frases)",
        "subsections": [
          {
            "id": "s1a",
            "title": "Subtítulo",
            "points": ["punto importante 1", "punto importante 2", "punto importante 3"]
          }
        ]
      }
    ]
  },

  "mindmap": {
    "center": "concepto central del tema",
    "branches": [
      {
        "id": "b1",
        "label": "rama principal",
        "color": "#hexcolor",
        "children": ["subconcepto 1", "subconcepto 2", "subconcepto 3"]
      }
    ]
  },

  "timeline": {
    "applicable": true,
    "events": [
      { "date": "fecha o período", "event": "descripción del evento", "importance": "high/medium/low" }
    ]
  },

  "examTips": [
    "Consejo o pregunta típica de examen 1",
    "Consejo o pregunta típica de examen 2",
    "Consejo o pregunta típica de examen 3",
    "Consejo o pregunta típica de examen 4",
    "Consejo o pregunta típica de examen 5"
  ]
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

REGLAS PARA CADA SECCIÓN:

SUMMARY:
- short: máximo 3 frases, directo al grano
- medium: 8-12 frases completas, fluido, como lo explicaría un profesor
- keyTerms: entre 6 y 10 términos clave del tema con definición clara

OUTLINE (esquema):
- Entre 3 y 6 secciones principales
- Cada sección con 1-3 subsecciones
- Cada subsección con 3-5 puntos concretos
- Los colores de sección deben variar usando la paleta de asignaturas

MINDMAP (mapa mental):
- El center es el concepto más importante del tema
- Entre 4 y 7 ramas principales
- Cada rama con 2-4 hijos/subconceptos
- Los colores deben ser variados y llamativos

TIMELINE:
- Si el tema tiene fechas o secuencia histórica: applicable = true, incluir eventos
- Si NO tiene fechas (ej: matemáticas, gramática): applicable = false, events = []
- Si aplica: mínimo 4 eventos, máximo 10
- importance: "high" para eventos cruciales, "medium" para importantes, "low" para secundarios

EXAM TIPS:
- 5 consejos prácticos: preguntas típicas de examen, conceptos que suelen confundir, fórmulas a memorizar
- Escritos en segunda persona: "Recuerda que...", "Es frecuente que pregunten...", "No confundas..."

REGLAS CRÍTICAS:
- USA SOLO el contenido real del documento
- El JSON debe ser 100% válido, sin comentarios, sin trailing commas
- Responde SOLO con el JSON
- El idioma de los contenidos debe coincidir con el idioma del documento`;
}
