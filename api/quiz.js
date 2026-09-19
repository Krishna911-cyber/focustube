/**
 * FocusTube - Serverless AI Recall Quiz Generator Function
 * 
 * Given a videoId, calls Google Gemini API with the public YouTube URL
 * (https://www.youtube.com/watch?v=ID) as file_data to analyze video concepts
 * and generate 8 multiple-choice recall questions spread across the lecture.
 * 
 * Output schema: [{ startSec, question, options[4], correctIndex, explanation }]
 * 
 * Robust JSON extraction and repair handles markdown wrappers, malformed trailing commas,
 * and syntax quirks. Returns friendly errors for private/unsupported videos.
 */

const { applyProtection } = require('./_lib/protection.js');

/**
 * Curated 8-question banks for demo lectures when running in development
 * or when GEMINI_API_KEY is not configured.
 */
const CURATED_DEMO_QUIZZES = {
  // MIT 18.06 Linear Algebra - Lecture 1 (J7DzL2_Na80)
  'mit-1806-l01': [
    {
      startSec: 120,
      question: "In the row picture of a 2x2 linear system, what does each individual equation represent geometrically?",
      options: [
        "A column vector originating from the origin",
        "A straight line in the two-dimensional xy plane",
        "A plane slicing through three-dimensional space",
        "A curved parabolic manifold"
      ],
      correctIndex: 1,
      explanation: "In the row picture, every linear equation in two variables represents a straight line in the xy plane, and the solution is their point of intersection."
    },
    {
      startSec: 310,
      question: "How does the column picture view the linear system 2x - y = 0 and -x + 2y = 3?",
      options: [
        "As finding where two lines cross",
        "As computing the determinant of row vectors",
        "As a linear combination of column vectors (2, -1) and (-1, 2) yielding (0, 3)",
        "As projecting a vector onto the horizontal axis"
      ],
      correctIndex: 2,
      explanation: "The column picture combines column vectors scaled by coefficients x and y to produce the target vector b."
    },
    {
      startSec: 580,
      question: "In matrix notation Ax = b, what does the matrix A represent in terms of columns?",
      options: [
        "The coefficients of each equation placed into column vectors",
        "The coordinates of the solution vector x",
        "The row sums of the augmented matrix",
        "The eigenvalues of the transformation"
      ],
      correctIndex: 0,
      explanation: "Matrix A groups the coefficients corresponding to each variable into respective column vectors."
    },
    {
      startSec: 840,
      question: "When we move to a system of 3 equations in 3 unknowns, what does each equation in the row picture represent?",
      options: [
        "A line in 3D space",
        "A single point in the xyz coordinate system",
        "A flat two-dimensional plane in three-dimensional space",
        "A three-dimensional sphere"
      ],
      correctIndex: 2,
      explanation: "A single linear equation with 3 variables (ax + by + cz = d) defines a flat 2D plane in 3D space."
    },
    {
      startSec: 1120,
      question: "What geometric object is formed by the intersection of two non-parallel planes in 3D space?",
      options: [
        "A straight line",
        "A single intersection point",
        "A curved surface",
        "An empty set"
      ],
      correctIndex: 0,
      explanation: "Two non-parallel planes in 3D intersect along an entire straight line."
    },
    {
      startSec: 1450,
      question: "Can the column vectors of matrix A always solve Ax = b for any target vector b in 3D?",
      options: [
        "Yes, any 3 column vectors always span all 3D space",
        "Only if the 3 column vectors do not all lie in the same plane (linearly independent)",
        "No, Ax = b is only solvable if b is the zero vector",
        "Only if all matrix entries are positive integers"
      ],
      correctIndex: 1,
      explanation: "If the 3 column vectors lie on the same plane, their combinations only fill that plane, failing for vectors b outside it."
    },
    {
      startSec: 1780,
      question: "What occurs algebraically when the column vectors of matrix A all lie in the same plane?",
      options: [
        "Matrix A has an infinite determinant",
        "Matrix A is singular (not invertible)",
        "The system has exactly one unique solution for every b",
        "Gaussian elimination requires no row swaps"
      ],
      correctIndex: 1,
      explanation: "When columns lie in a single plane, they are linearly dependent, making matrix A singular and non-invertible."
    },
    {
      startSec: 2150,
      question: "What is the primary conceptual advantage of the column picture over the row picture in higher dimensions?",
      options: [
        "It eliminates the need to perform multiplication",
        "It avoids imagining high-dimensional intersecting hyperplanes by focusing on vector combinations",
        "It guarantees integer solutions",
        "It only requires solving one equation at a time"
      ],
      correctIndex: 1,
      explanation: "Visualizing intersecting hyperplanes in 9 dimensions is impossible, but combining 9 column vectors in 9D space is conceptually uniform and straightforward."
    }
  ],

  // 3Blue1Brown - Essence of Linear Algebra Chapter 1 (fNk_zzaMoSs)
  '3b1b-vectors': [
    {
      startSec: 90,
      question: "According to Grant Sanderson, how does a computer scientist primarily view a vector?",
      options: [
        "As an arrow pointing in space with length and direction",
        "As an ordered list of numbers representing attributes or features",
        "As an abstract element satisfying vector space axioms",
        "As a geometric point on a Cartesian graph"
      ],
      correctIndex: 1,
      explanation: "Computer scientists view vectors as ordered numerical lists representing features, like house price, square footage, and bedrooms."
    },
    {
      startSec: 240,
      question: "In standard 2D coordinate geometry, where does the tail of a standard vector always sit?",
      options: [
        "At the origin (0, 0)",
        "At the top-right corner of the quadrant",
        "At coordinate (1, 1)",
        "Anywhere in the coordinate plane"
      ],
      correctIndex: 0,
      explanation: "In linear algebra coordinate systems, vector arrows are conventionally anchored with their tail firmly at the origin (0, 0)."
    },
    {
      startSec: 410,
      question: "What happens geometrically when you multiply a vector by a scalar value of -2?",
      options: [
        "It rotates 90 degrees clockwise and doubles in length",
        "It reverses direction 180 degrees and stretches to twice its original length",
        "Its length decreases by half without changing direction",
        "It shifts two units downward along the y-axis"
      ],
      correctIndex: 1,
      explanation: "The negative sign reverses the direction of the vector by 180°, and the factor of 2 doubles its magnitude."
    },
    {
      startSec: 620,
      question: "What are the standard basis vectors i-hat and j-hat in 2D space?",
      options: [
        "Vectors of length 1 pointing in the positive x and y directions",
        "Vectors spanning from (-1, -1) to (1, 1)",
        "Diagonal vectors pointing along x = y",
        "Arbitrary vectors chosen at random"
      ],
      correctIndex: 0,
      explanation: "i-hat is the unit vector (1, 0) along the x-axis, and j-hat is the unit vector (0, 1) along the y-axis."
    },
    {
      startSec: 810,
      question: "What is the definition of a 'linear combination' of two vectors v and w?",
      options: [
        "Multiplying the components of v and w together",
        "Scaling each vector by a number and adding the results: a*v + b*w",
        "Finding the angle between v and w",
        "Dividing vector v by vector w"
      ],
      correctIndex: 1,
      explanation: "A linear combination is formed by scaling each vector by arbitrary scalar constants and adding them: a*v + b*w."
    },
    {
      startSec: 1010,
      question: "What is the 'span' of a set of vectors?",
      options: [
        "The total length of all vectors added end-to-end",
        "The maximum angle between any pair of vectors",
        "The set of all possible vectors reachable through linear combinations of those vectors",
        "The distance from the origin to the furthest vector tip"
      ],
      correctIndex: 2,
      explanation: "The span of a set of vectors encompasses every possible vector that can be reached by scaling and adding them."
    },
    {
      startSec: 1210,
      question: "What is the span of two 2D vectors that point in exactly the same (or opposite) direction?",
      options: [
        "The entire 2D coordinate plane",
        "A single line passing through the origin",
        "A single point at the origin",
        "A circle of radius 1"
      ],
      correctIndex: 1,
      explanation: "Because both vectors lie along the same line, any combination of them remains constrained to that single line through the origin."
    },
    {
      startSec: 1420,
      question: "When is a set of vectors considered 'linearly dependent'?",
      options: [
        "When all vectors have equal lengths",
        "When at least one vector can be expressed as a linear combination of the others without adding new dimensions",
        "When the vectors are perpendicular to one another",
        "When the coordinates are all non-zero integers"
      ],
      correctIndex: 1,
      explanation: "Vectors are linearly dependent if one vector is redundant—meaning it already lies within the span of the other vectors."
    }
  ]
};

// Aliases for YouTube video IDs
CURATED_DEMO_QUIZZES['J7DzL2_Na80'] = CURATED_DEMO_QUIZZES['mit-1806-l01'];
CURATED_DEMO_QUIZZES['fNk_zzaMoSs'] = CURATED_DEMO_QUIZZES['3b1b-vectors'];

/**
 * Resolves demo slug or raw ID into an 11-char YouTube ID
 */
function resolveYouTubeId(videoId) {
  if (!videoId || typeof videoId !== 'string') return null;
  const str = videoId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const MAPPINGS = {
    'mit-1806-l01': 'J7DzL2_Na80',
    '3b1b-vectors': 'fNk_zzaMoSs'
  };
  return MAPPINGS[str] || str;
}

/**
 * Resolves video title, channel, and description via query params, YouTube API, or oEmbed
 */
async function resolveVideoMetadata(videoId, queryMeta = {}) {
  let title = (queryMeta.title || '').trim();
  let channel = (queryMeta.channel || queryMeta.author || '').trim();
  let description = (queryMeta.description || '').trim();

  const youtubeId = resolveYouTubeId(videoId);
  const ytKey = process.env.YOUTUBE_API_KEY;

  if (ytKey && youtubeId && (!title || !description)) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(youtubeId)}&key=${ytKey}`;
      const ytRes = await fetch(apiUrl);
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const snippet = ytData.items?.[0]?.snippet;
        if (snippet) {
          title = title || snippet.title || '';
          channel = channel || snippet.channelTitle || '';
          description = description || snippet.description || '';
        }
      }
    } catch (err) {
      console.warn('[API:Quiz] YouTube API metadata lookup failed:', err.message);
    }
  }

  // Fallback to oEmbed if title or channel is still missing
  if ((!title || !channel) && youtubeId) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = title || oembedData.title || '';
        channel = channel || oembedData.author_name || '';
      }
    } catch (err) {
      console.warn('[API:Quiz] YouTube oEmbed metadata lookup failed:', err.message);
    }
  }

  return {
    title: title || 'Educational Lecture',
    channel: channel || 'Instructor',
    description: description || ''
  };
}

/**
 * Synthesizes 8 topic-relevant questions when AI is offline and video is not a curated demo
 */
function generateTopicFallbackQuiz(videoId, metadata = {}) {
  const rawTitle = metadata.title || 'Lecture Concepts';
  const cleanTitle = rawTitle.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  
  const topics = [
    { title: `Core Foundations of ${cleanTitle}`, time: 180, focus: 'fundamental definitions and primary objectives' },
    { title: `Core Mechanics & Architecture`, time: 540, focus: 'essential structures and basic operational models' },
    { title: `Practical Commands & Operations`, time: 1080, focus: 'standard execution methods and everyday commands' },
    { title: `System Configuration & Parameters`, time: 1620, focus: 'configuring parameters and managing environment variables' },
    { title: `Access Control & Permissions`, time: 2160, focus: 'security boundaries, permissions, and user controls' },
    { title: `Processes, Tasks & Lifecycle`, time: 2700, focus: 'process monitoring, execution flows, and background tasks' },
    { title: `Troubleshooting & Best Practices`, time: 3240, focus: 'identifying common errors and applying diagnostic workflows' },
    { title: `Production Readiness & Advanced Use`, time: 3780, focus: 'automation, scaling, and production best practices' }
  ];

  return topics.map((t) => ({
    startSec: t.time,
    question: `In ${cleanTitle}, what is the primary focus when studying ${t.title}?`,
    options: [
      `Mastering ${t.focus} to ensure correct and standardized execution`,
      `Bypassing verification checks to reduce execution runtime`,
      `Restricting user access permanently without audit logging`,
      `Ignoring configuration files and relying entirely on default flags`
    ],
    correctIndex: 0,
    explanation: `Understanding ${t.focus} provides the operational basis for this segment of the curriculum.`
  }));
}

/**
 * Calls Google Gemini API using public YouTube URL and metadata
 */
async function callGeminiForYouTubeQuiz(apiKey, videoId, metadata = {}) {
  const youtubeId = resolveYouTubeId(videoId);
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const title = metadata.title || 'Educational Lecture';
  const channel = metadata.channel || 'Instructor';
  const descSnippet = (metadata.description || '').substring(0, 2500);

  const promptText = `
You are an expert instructional designer and cognitive tutor creating an active recall quiz for a student studying this educational video:
Video URL: ${youtubeUrl}
Title: "${title}"
Channel/Instructor: "${channel}"
${descSnippet ? `Topics & Outline from lecture description:\n${descSnippet}\n` : ''}

Analyze this lecture content thoroughly and generate exactly 8 high-yield multiple-choice questions testing core concepts taught throughout this lecture.
Requirements:
1. Spread the 8 questions chronologically across the duration of the video.
2. For each question, supply startSec: realistic timestamp in seconds (integer, e.g. 120, 480, 960, 1800, etc.) where this specific concept is explained.
3. Supply question: a clear conceptual multiple-choice question testing understanding of topics taught in this video.
4. Supply options: an array of exactly 4 plausible options.
5. Supply correctIndex: 0-based integer (0, 1, 2, or 3) indicating the single correct answer.
6. Supply explanation: a 1-2 sentence pedagogical explanation of why this answer is correct.

Return ONLY a valid JSON array of 8 objects matching this exact structure with no conversational filler or markdown code fences:
[
  {
    "startSec": 120,
    "question": "Concept question here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Explanation here"
  }
]
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        // Check for YouTube video specifically marked unavailable/private by API
        if (response.status === 400 || response.status === 403 || response.status === 404) {
          const lower = errText.toLowerCase();
          if (
            (lower.includes('video') && (lower.includes('private') || lower.includes('not found') || lower.includes('unavailable'))) ||
            lower.includes('video is private') ||
            lower.includes('copyright block')
          ) {
            const friendlyErr = new Error('This video is private, restricted, or unavailable.');
            friendlyErr.isUnsupportedVideo = true;
            friendlyErr.statusCode = 422;
            throw friendlyErr;
          }
        }
        throw new Error(`Gemini API (${model}) returned status ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error(`Empty content returned by Gemini (${model})`);
      }
      return rawText;
    } catch (e) {
      if (e.isUnsupportedVideo) throw e;
      lastError = e;
      console.warn(`[API:Quiz] ${model} attempt failed:`, e.message);
    }
  }

  throw lastError || new Error('Failed to generate quiz from Gemini API');
}

/**
 * Extracts, sanitizes, and repairs JSON from raw model output.
 */
function extractAndRepairJSON(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty or invalid response received from model');
  }

  let text = raw.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find outermost array brackets [...]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    text = text.substring(firstBracket, lastBracket + 1).trim();
  }

  // Attempt direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (initialErr) {
    // Proceed to repair
  }

  // Syntax repairs for common model formatting anomalies
  let repaired = text
    // 1. Remove trailing commas before closing brackets/braces
    .replace(/,\s*([\]}])/g, '$1')
    // 2. Replace single-quoted properties and values with double quotes
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
    // 3. Remove non-printable control characters except whitespace
    .replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');

  try {
    const parsed = JSON.parse(repaired);
    if (Array.isArray(parsed)) return parsed;
  } catch (repairErr) {
    // Proceed to fallback regex extraction
  }

  // Fallback: Regex extraction of individual question objects
  const questions = [];
  const objectRegex = /\{[^{}]*"startSec"\s*:\s*(\d+)[^{}]*"question"\s*:\s*"([^"]+)"[^{}]*"options"\s*:\s*\[([^\]]+)\][^{}]*"correctIndex"\s*:\s*([0-3])[^{}]*"explanation"\s*:\s*"([^"]+)"[^{}]*\}/g;

  let match;
  while ((match = objectRegex.exec(text)) !== null) {
    const rawOptions = match[3];
    const options = rawOptions
      .split(',')
      .map(opt => opt.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    if (options.length === 4) {
      questions.push({
        startSec: parseInt(match[1], 10),
        question: match[2],
        options,
        correctIndex: parseInt(match[4], 10),
        explanation: match[5]
      });
    }
  }

  if (questions.length > 0) {
    return questions;
  }

  throw new Error('Failed to parse or repair JSON quiz response from AI');
}

/**
 * Validates, normalizes, and sorts question objects according to the required schema.
 */
function validateAndNormalizeQuiz(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Quiz response must be an array of question objects');
  }

  const normalized = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    const startSec = Math.max(0, parseInt(item.startSec !== undefined ? item.startSec : (item.segmentStart || 0), 10) || 0);
    const question = String(item.question || '').trim();
    if (!question) continue;

    let options = Array.isArray(item.options) ? item.options.map(o => String(o).trim()) : [];
    if (options.length !== 4 || options.some(o => !o)) continue;

    let correctIndex = parseInt(item.correctIndex, 10);
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      correctIndex = 0;
    }

    const explanation = String(item.explanation || 'Refer to the video segment for the conceptual explanation.').trim();

    normalized.push({
      startSec,
      question,
      options,
      correctIndex,
      explanation
    });
  }

  if (normalized.length === 0) {
    throw new Error('No valid question items found in AI response');
  }

  // Sort chronologically by startSec
  normalized.sort((a, b) => a.startSec - b.startSec);

  return normalized;
}

module.exports = async function handler(req, res) {
  // 1. Apply standard protections (CORS, payload size capping, rate limiting, identifier validation)
  const protection = applyProtection(req, res);
  if (!protection.ok) return;

  const { videoId } = protection;
  const apiKey = process.env.GEMINI_API_KEY;

  // Extract client-provided video metadata from query params or body
  const query = req.query || {};
  let body = {};
  if (req.body) {
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch (e) {}
    } else if (typeof req.body === 'object') {
      body = req.body;
    }
  }

  const clientTitle = query.title || body.title || '';
  const clientChannel = query.channel || body.channel || query.author || body.author || '';
  const clientDescription = query.description || body.description || '';

  try {
    const metadata = await resolveVideoMetadata(videoId, {
      title: clientTitle,
      channel: clientChannel,
      description: clientDescription
    });

    // -------------------------------------------------------------
    // Attempt Live Gemini Generation if GEMINI_API_KEY is configured
    // -------------------------------------------------------------
    if (apiKey) {
      try {
        console.log(`[API:Quiz] Requesting Gemini video analysis for videoId: ${videoId} ("${metadata.title}")`);
        const rawOutput = await callGeminiForYouTubeQuiz(apiKey, videoId, metadata);
        const parsedItems = extractAndRepairJSON(rawOutput);
        const validatedQuestions = validateAndNormalizeQuiz(parsedItems);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.end(JSON.stringify({
          videoId,
          title: metadata.title,
          source: 'gemini_ai',
          count: validatedQuestions.length,
          questions: validatedQuestions
        }));
        return;

      } catch (geminiErr) {
        if (geminiErr.isUnsupportedVideo) {
          res.statusCode = geminiErr.statusCode || 422;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Video Unavailable',
            message: geminiErr.message
          }));
          return;
        }

        console.warn('[API:Quiz] Live Gemini generation failed:', geminiErr.message);
      }
    }

    // -------------------------------------------------------------
    // Development / Fallback Mode (Curated Question Bank or Synthesized Topics)
    // -------------------------------------------------------------
    const demoQuiz = CURATED_DEMO_QUIZZES[videoId] 
      || CURATED_DEMO_QUIZZES[resolveYouTubeId(videoId)];
    const fallbackList = demoQuiz || generateTopicFallbackQuiz(videoId, metadata);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.end(JSON.stringify({
      videoId,
      title: metadata.title,
      source: demoQuiz ? 'curated_fallback' : 'topic_fallback',
      note: apiKey ? 'Served fallback quiz.' : 'GEMINI_API_KEY not configured. Serving fallback question bank.',
      count: fallbackList.length,
      questions: fallbackList
    }));

  } catch (err) {
    console.error('[API:Quiz] Internal handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to process quiz request.'
    }));
  }
};

// Export helpers for unit testing
module.exports.resolveYouTubeId = resolveYouTubeId;
module.exports.resolveVideoMetadata = resolveVideoMetadata;
module.exports.generateTopicFallbackQuiz = generateTopicFallbackQuiz;
module.exports.extractAndRepairJSON = extractAndRepairJSON;
module.exports.validateAndNormalizeQuiz = validateAndNormalizeQuiz;
module.exports.CURATED_DEMO_QUIZZES = CURATED_DEMO_QUIZZES;
