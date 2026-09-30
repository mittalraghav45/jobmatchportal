import OpenAI from 'openai';
import { buildStructuredApplicationMessages } from './applicationEngine.js';
import { buildApplicationPack } from './applicationPack.js';

function parseModelJson(content) {
  const text = String(content || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('The model returned invalid JSON for the application pack.');
  }
}

export async function generateApplicationPack({ job, candidate, task = 'full', openaiClient = null, model = process.env.OPENAI_MODEL || 'gpt-4o-mini' } = {}) {
  if (!job) throw new Error('Job material is required.');
  if (!candidate) throw new Error('Candidate evidence is required.');

  const request = buildStructuredApplicationMessages({
    companyName: job.companyName || job.company,
    role: job.title || job.role,
    jobDescription: job.description || '',
    candidatePack: candidate.cvText || '',
    candidateEvidence: candidate,
    task
  });

  const client = openaiClient || (process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null);
  if (!client) {
    return {
      mode: 'prompt-only',
      request,
      pack: null,
      validation: { valid: false, errors: ['OPENAI_API_KEY is not configured.'], warnings: [], placeholders: [] }
    };
  }

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: request.messages
  });

  const result = parseModelJson(response.choices?.[0]?.message?.content);
  const pack = buildApplicationPack(result);
  return { mode: 'generated', request, pack };
}
