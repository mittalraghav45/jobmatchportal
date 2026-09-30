import OpenAI from 'openai';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function clean(value, max = 8000) {
  return String(value ?? '').slice(0, max);
}

export async function generateJobInsight({ job, profile, match, openaiClient = null, model = DEFAULT_MODEL } = {}) {
  if (!job) throw new Error('Job is required.');
  if (!profile) throw new Error('Candidate profile is required.');

  const client = openaiClient || (process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null);
  if (!client) throw new Error('OPENAI_API_KEY is not configured.');

  const input = {
    job: {
      title: clean(job.title, 300),
      company: clean(job.companyName || job.company, 300),
      location: clean(job.location, 300),
      description: clean(job.description, 9000),
      employmentType: clean(job.employmentType, 300),
      url: clean(job.url || job.source?.url, 500)
    },
    candidate: {
      name: clean(profile.name, 200),
      summary: clean(profile.summary, 1500),
      skills: (profile.skills || []).slice(0, 80),
      yearsExperience: profile.yearsExperience || 0,
      preferences: profile.preferences || {},
      workAuthorisation: profile.workAuthorisation || {}
    },
    deterministicMatch: match || {}
  };

  const response = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are the AI reasoning layer for a UK software-engineering job matching product. Analyse only the supplied evidence. Do not invent job requirements, sponsorship facts, salary, company facts, or candidate experience. The deterministic match is authoritative for its numeric score and sponsorship status; explain it rather than replacing it. Return JSON with exactly these keys: headline, whyItMatches (array of strings), skillGaps (array of strings), sponsorshipNote, seniorityNote, applicationAdvice, confidence. confidence must be one of high, medium, low. Keep each array to at most 5 items. Keep advice factual and concise.`
      },
      {
        role: 'user',
        content: JSON.stringify(input)
      }
    ]
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response.');

  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON.');
  }

  return { model, ...result };
}
