/**
 * Quick API & Genkit Health Check Script for MotionArcade
 * Run with: npm run test:api
 * Or:       node scripts/test-api.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper for colored terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg = '') {
  console.log(msg);
}

function success(msg) {
  console.log(`${colors.green}  ✓ ${msg}${colors.reset}`);
}

function warn(msg) {
  console.log(`${colors.yellow}  ⚠ ${msg}${colors.reset}`);
}

function error(msg) {
  console.log(`${colors.red}  ✗ ${msg}${colors.reset}`);
}

function info(msg) {
  console.log(`${colors.cyan}  ℹ ${msg}${colors.reset}`);
}

// 1. Load environment variables from .env.local or .env
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

async function run() {
  log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════${colors.reset}`);
  log(`${colors.bright}  🎮 MotionArcade — Gemini API & Genkit Diagnostic${colors.reset}`);
  log(`${colors.cyan}══════════════════════════════════════════════════════${colors.reset}\n`);

  // Step 1: Check Environment Variable
  log(`${colors.bright}[1/4] Checking Environment Configuration...${colors.reset}`);
  loadEnv();

  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    error('No API key found in process.env, .env.local, or .env!');
    info('To fix this, add the following to your .env.local file:');
    info('GOOGLE_GENAI_API_KEY=your_gemini_api_key_here\n');
    process.exit(1);
  }

  const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : '***';
  success(`API Key detected: ${colors.dim}${maskedKey}${colors.reset}`);

  // Step 2: Test Direct REST Connectivity
  log(`\n${colors.bright}[2/4] Testing Direct Gemini API Connection...${colors.reset}`);
  const startTime = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      error(`API responded with HTTP ${res.status} (${elapsed}ms)`);
      if (errBody?.error?.message) {
        error(`Message: ${errBody.error.message}`);
      }
      if (res.status === 400 || res.status === 403) {
        warn('Reason: The API key may be invalid or restricted. Check Google AI Studio.');
      }
      process.exit(1);
    }

    const data = await res.json();
    const modelCount = data.models ? data.models.length : 0;
    success(`Connected to Google Gemini API in ${elapsed}ms (${modelCount} models available)`);
  } catch (err) {
    error(`Failed to reach Google Gemini API: ${err.message}`);
    warn('Check your internet connection or firewall/proxy settings.');
    process.exit(1);
  }

  // Step 3: Test Models (gemini-3.6-flash, gemini-3.7-flash, gemini-3.8-flash)
  log(`\n${colors.bright}[3/4] Testing Model Generation & Availability...${colors.reset}`);
  const modelsToTest = [
    { name: 'gemini-3.6-flash', recommended: true },
    { name: 'gemini-3.7-flash', recommended: false },
    { name: 'gemini-3.8-flash', recommended: false },
  ];

  let workingModel = null;

  for (const m of modelsToTest) {
    const t0 = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond strictly with the single word: PONG' }] }],
          }),
        }
      );
      const dt = Date.now() - t0;
      const json = await res.json();

      if (res.ok && json.candidates?.[0]?.content?.parts?.[0]?.text) {
        const reply = json.candidates[0].content.parts[0].text.trim();
        success(`${colors.bright}${m.name}${colors.reset}: OK (${dt}ms) -> "${reply}"`);
        if (!workingModel) workingModel = m.name;
      } else {
        const errMsg = json.error?.message || `HTTP ${res.status}`;
        if (json.error?.code === 503) {
          warn(`${m.name}: 503 High Demand (temporarily unavailable)`);
        } else {
          error(`${m.name}: ${errMsg}`);
        }
      }
    } catch (e) {
      error(`${m.name}: Network error - ${e.message}`);
    }
  }

  // Step 4: Test Genkit SDK Integration
  log(`\n${colors.bright}[4/4] Testing Genkit Integration...${colors.reset}`);
  try {
    const { genkit } = await import('genkit');
    const { googleAI } = await import('@genkit-ai/google-genai');

    // Read current model from src/ai/genkit.ts or use workingModel
    const genkitModel = workingModel ? `googleai/${workingModel}` : 'googleai/gemini-3.6-flash';
    const testAi = genkit({
      plugins: [googleAI()],
      model: genkitModel,
    });

    const genkitStart = Date.now();
    const result = await testAi.generate('What is 2 + 2? Return only the number.');
    const genkitElapsed = Date.now() - genkitStart;

    success(`Genkit generated response with ${genkitModel} in ${genkitElapsed}ms: "${result.text.trim()}"`);
  } catch (err) {
    error(`Genkit execution failed: ${err.message}`);
    if (err.message?.includes('503')) {
      warn('Notice: The configured model in src/ai/genkit.ts is experiencing high demand.');
      warn('Recommendation: Update src/ai/genkit.ts to use "googleai/gemini-3.6-flash".');
    }
  }

  // Summary
  log(`\n${colors.cyan}──────────────────────────────────────────────────────${colors.reset}`);
  if (workingModel) {
    log(`${colors.green}${colors.bright}  🎉 ALL CHECKS PASSED: Your Gemini API is working!${colors.reset}`);
    info(`Fastest available model: ${colors.bright}${workingModel}${colors.reset}`);
  } else {
    warn('API key is valid, but models are currently experiencing rate limits or demand spikes.');
  }
  log(`${colors.cyan}──────────────────────────────────────────────────────${colors.reset}\n`);
}

run().catch((err) => {
  console.error('\nUnexpected failure:', err);
  process.exit(1);
});
