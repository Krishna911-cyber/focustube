/**
 * FocusTube - AI Recall Quiz Generator
 * 
 * Takes ±60 seconds of transcript around chosen timestamps and queries an LLM API
 * (key from environment variable GEMINI_API_KEY or OPENAI_API_KEY)
 * to produce 2 multiple-choice questions per segment.
 * 
 * Output: data/quizzes/<videoId>.json with:
 * [{ segmentStart, question, options[4], correctIndex, explanation }]
 */

const fs = require('fs');
const path = require('path');

const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'data', 'transcripts');
const QUIZZES_DIR = path.join(__dirname, '..', 'data', 'quizzes');

// Ensure target directory exists
if (!fs.existsSync(QUIZZES_DIR)) {
  fs.mkdirSync(QUIZZES_DIR, { recursive: true });
}

// Target lecture timestamps to generate questions around (in seconds)
const VIDEO_CONFIGS = [
  {
    videoId: 'mit-1806-l01',
    timestamps: [252, 580, 1100, 1400],
    fallbacks: {
      252: [
        {
          segmentStart: 252,
          question: "In the row picture of a 2x2 linear system, what does each equation represent geometrically?",
          options: [
            "A column vector originating from the origin",
            "A straight line in the two-dimensional xy plane",
            "A point of intersection in three-dimensional space",
            "A curved parabola passing through the origin"
          ],
          correctIndex: 1,
          explanation: "In the row picture, every linear equation in two variables represents a straight line in the xy plane, and the solution is the point where the lines intersect."
        },
        {
          segmentStart: 252,
          question: "How does the column picture view the linear system 2x - y = 0 and -x + 2y = 3?",
          options: [
            "As finding the slope and y-intercept of two lines",
            "As finding where two planes intersect along a line",
            "As a linear combination of column vectors (2, -1) and (-1, 2) yielding (0, 3)",
            "As computing the inverse determinant of the row matrix"
          ],
          correctIndex: 2,
          explanation: "The column picture combines column vectors scaled by variables x and y (x*[2, -1] + y*[-1, 2] = [0, 3]) to reach the target vector b."
        }
      ],
      580: [
        {
          segmentStart: 580,
          question: "In a 3x3 system, what does each equation represent in the row picture?",
          options: [
            "A single point in 3-dimensional space",
            "A curved surface in space",
            "A flat plane in three-dimensional space",
            "A one-dimensional vector axis"
          ],
          correctIndex: 2,
          explanation: "In three dimensions, each linear equation in x, y, and z defines a flat 2D plane in 3D space. Two planes meet in a line, and a third plane intersects that line in a point."
        },
        {
          segmentStart: 580,
          question: "Why is the column picture often preferred over the row picture in higher dimensions?",
          options: [
            "Because visualizing multiple intersecting hyperplanes in 3D or higher is difficult, whereas combining column vectors remains visually and algebraically clear",
            "Because the row picture cannot be computed with modern computer hardware",
            "Because column pictures only work when the determinant is negative",
            "Because row pictures do not support matrix multiplication"
          ],
          correctIndex: 0,
          explanation: "Visualizing the intersection of multiple planes in 3D (or hyperplanes in n-D) is geometrically complex, whereas the column picture treats the problem simply as combining column vectors in space."
        }
      ],
      1100: [
        {
          segmentStart: 1100,
          question: "In the matrix equation Ax = b, what does the matrix A represent?",
          options: [
            "The unknown variables we are trying to solve for",
            "The coefficient matrix of the linear system",
            "The target result vector on the right-hand side",
            "The scalar multiplier of the system"
          ],
          correctIndex: 1,
          explanation: "In Ax = b, matrix A contains the coefficients of the system, vector x contains the unknown variables, and vector b is the right-hand side target vector."
        },
        {
          segmentStart: 1100,
          question: "What happens when the three column vectors of a 3x3 matrix lie in the same flat plane?",
          options: [
            "Their linear combinations can only produce vectors within that plane, making the matrix singular and non-invertible for general b",
            "The matrix will have an infinite number of independent inverse matrices",
            "Every vector in 3D space can be reached uniquely",
            "The system becomes non-linear"
          ],
          correctIndex: 0,
          explanation: "If the column vectors lie in the same plane, their span is only 2-dimensional. You cannot solve Ax = b for any vector b outside that plane, meaning the matrix is singular."
        }
      ],
      1400: [
        {
          segmentStart: 1400,
          question: "According to Gilbert Strang, what is the fundamental 'linear algebra' way to understand matrix-vector multiplication Ax?",
          options: [
            "As computing determinants column by column",
            "As calculating cross products of the rows",
            "As a linear combination of the column vectors of A, weighted by the components of x",
            "As calculating dot products only with the diagonal elements"
          ],
          correctIndex: 2,
          explanation: "Ax is fundamentally a linear combination of the columns of A. The components of x specify how much of each column vector to combine."
        },
        {
          segmentStart: 1400,
          question: "If matrix A has columns [c1, c2] and x = [2, 3]^T, what is Ax equal to?",
          options: [
            "2*c1 + 3*c2",
            "3*c1 + 2*c2",
            "6*(c1 + c2)",
            "(c1 dot c2) * [2, 3]"
          ],
          correctIndex: 0,
          explanation: "The vector x = [2, 3]^T specifies 2 times the first column c1 plus 3 times the second column c2."
        }
      ]
    }
  },
  {
    videoId: '3b1b-vectors',
    timestamps: [114, 320, 490],
    fallbacks: {
      114: [
        {
          segmentStart: 114,
          question: "What is the physics perspective on what a vector is?",
          options: [
            "An ordered list of spreadsheet numbers",
            "An arrow pointing in space defined by length and direction, which can be moved freely without changing identity",
            "An abstract object defined purely by mathematical axioms of vector spaces",
            "A memory pointer to a numerical array in memory"
          ],
          correctIndex: 1,
          explanation: "In physics, vectors are arrows pointing in space, characterized solely by their length (magnitude) and direction, invariant under translation."
        },
        {
          segmentStart: 114,
          question: "How does the computer science perspective primarily view a vector?",
          options: [
            "As an arrow fixed to the physical coordinate origin",
            "As a force acting upon a mass in motion",
            "As an ordered list of numbers representing features or data points",
            "As an irreducible continuous field"
          ],
          correctIndex: 2,
          explanation: "In computer science, a vector is typically an ordered list of numbers representing distinct features (e.g. dimensions of house data: area, bedrooms, price)."
        }
      ],
      320: [
        {
          segmentStart: 320,
          question: "In the geometric coordinate representation used in linear algebra, where is the tail of each vector anchored?",
          options: [
            "At the tip of the preceding vector",
            "At the coordinate origin (0, 0)",
            "At the coordinates of the first variable",
            "At the unit length (1, 1)"
          ],
          correctIndex: 1,
          explanation: "In linear algebra coordinates, vectors are standardly anchored with their tail at the origin (0, 0), so coordinates describe the location of the arrow's tip."
        },
        {
          segmentStart: 320,
          question: "In a 2D coordinate vector [3, -2], what does the second number (-2) represent?",
          options: [
            "Moving 2 units to the right along the x-axis",
            "Moving 2 units downward along the vertical y-axis",
            "The angle in radians from the horizontal axis",
            "The length of the vector multiplied by -2"
          ],
          correctIndex: 1,
          explanation: "The second coordinate indicates vertical movement along the y-axis; -2 means moving down 2 units from the origin."
        }
      ],
      490: [
        {
          segmentStart: 490,
          question: "How is vector addition (v + w) visualized geometrically?",
          options: [
            "By multiplying the lengths and adding the angles",
            "By placing the tail of vector w at the tip of vector v and drawing the arrow from the origin to the new tip",
            "By finding the point where the two arrows cross in space",
            "By reflecting vector w across the line defined by vector v"
          ],
          correctIndex: 1,
          explanation: "Geometrically, vector addition is the tip-to-tail method: translate the second vector so its tail sits on the tip of the first; the sum goes from the origin to the second tip."
        },
        {
          segmentStart: 490,
          question: "What does multiplying a vector by a negative scalar (e.g., -2) do geometrically?",
          options: [
            "Rotates the vector by 90 degrees clockwise",
            "Flips the direction of the vector 180 degrees and doubles its length",
            "Reduces the vector's length to half without altering direction",
            "Sets the coordinates to zero"
          ],
          correctIndex: 1,
          explanation: "Multiplying by a negative scalar reverses the vector's direction (180 degree flip) and scales its magnitude by the absolute value (here, 2x)."
        }
      ]
    }
  }
];

/**
 * Extracts transcript text within ±60 seconds around a target timestamp.
 */
function getTranscriptWindow(segments, targetSec, windowSec = 60) {
  const minTime = Math.max(0, targetSec - windowSec);
  const maxTime = targetSec + windowSec;

  const relevantSegments = segments.filter(seg => {
    return seg.end >= minTime && seg.start <= maxTime;
  });

  return relevantSegments.map(s => s.text).join(' ');
}

/**
 * Calls Gemini API if GEMINI_API_KEY is present
 */
async function callGeminiAPI(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini API");
  return JSON.parse(text);
}

/**
 * Calls OpenAI API if OPENAI_API_KEY is present
 */
async function callOpenAIAPI(apiKey, prompt) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert tutor creating multiple-choice questions from lecture transcripts. Output valid JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : (parsed.questions || parsed.quiz || Object.values(parsed)[0]);
}

/**
 * Generates 2 multiple-choice questions for a transcript segment window.
 */
async function generateQuestionsForSegment(videoId, targetTimestamp, windowText, fallbackQuestions) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (geminiKey || openAIKey) {
    const prompt = `Based on the following lecture transcript window around timestamp ${targetTimestamp}s:
"${windowText}"

Generate exactly 2 multiple choice questions to test active recall of key concepts explained in this section.
Respond ONLY with a JSON array of 2 question objects with this exact structure:
[
  {
    "segmentStart": ${targetTimestamp},
    "question": "Clear question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief pedagogical explanation of why this answer is correct."
  }
]
Constraints:
- Exactly 4 options per question.
- correctIndex must be an integer from 0 to 3 matching the correct option.
- No markdown wrappers, output pure JSON array.`;

    try {
      if (geminiKey) {
        console.log(`[generate-quiz] Querying Gemini for ${videoId} @ ${targetTimestamp}s...`);
        const result = await callGeminiAPI(geminiKey, prompt);
        if (Array.isArray(result) && result.length >= 2) {
          return result.slice(0, 2).map(q => ({
            segmentStart: targetTimestamp,
            question: q.question,
            options: q.options.slice(0, 4),
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            explanation: q.explanation || ''
          }));
        }
      } else if (openAIKey) {
        console.log(`[generate-quiz] Querying OpenAI for ${videoId} @ ${targetTimestamp}s...`);
        const result = await callOpenAIAPI(openAIKey, prompt);
        if (Array.isArray(result) && result.length >= 2) {
          return result.slice(0, 2).map(q => ({
            segmentStart: targetTimestamp,
            question: q.question,
            options: q.options.slice(0, 4),
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            explanation: q.explanation || ''
          }));
        }
      }
    } catch (err) {
      console.warn(`[generate-quiz] LLM generation failed for ${videoId} @ ${targetTimestamp}s:`, err.message);
      console.log(`[generate-quiz] Falling back to pre-configured questions.`);
    }
  }

  // Fallback if no key or API failed
  return fallbackQuestions;
}

/**
 * Main execution function
 */
async function main() {
  console.log('========================================================');
  console.log('FocusTube - AI Recall Quiz Generator');
  console.log('========================================================\n');

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasApiKey) {
    console.log('ℹ️  No GEMINI_API_KEY or OPENAI_API_KEY found in environment.');
    console.log('   Using high-quality pedagogical questions for demo videos.\n');
  } else {
    console.log('🔑 LLM API key detected. Querying API for question generation.\n');
  }

  for (const config of VIDEO_CONFIGS) {
    const transcriptPath = path.join(TRANSCRIPTS_DIR, `${config.videoId}.json`);
    if (!fs.existsSync(transcriptPath)) {
      console.error(`❌ Transcript not found: ${transcriptPath}`);
      continue;
    }

    const transcriptData = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
    console.log(`Processing video: ${config.videoId} (${transcriptData.length} segments)`);

    const allQuestions = [];

    for (const targetTimestamp of config.timestamps) {
      const windowText = getTranscriptWindow(transcriptData, targetTimestamp, 60);
      const fallback = config.fallbacks[targetTimestamp] || [];
      const questions = await generateQuestionsForSegment(config.videoId, targetTimestamp, windowText, fallback);
      
      allQuestions.push(...questions);
      console.log(`  ✓ Generated ${questions.length} questions for segment around ${targetTimestamp}s`);
    }

    const outputPath = path.join(QUIZZES_DIR, `${config.videoId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2), 'utf8');
    console.log(`💾 Saved ${allQuestions.length} questions to ${outputPath}\n`);
  }

  console.log('🎉 AI Recall Quiz generation complete!');
}

main().catch(err => {
  console.error('Fatal error running generate-quiz:', err);
  process.exit(1);
});
