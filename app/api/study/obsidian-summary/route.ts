/**
 * Study summary → Obsidian
 *
 * POST: receives the narration of the current course plus the study time from
 * the Pomodoro timer, asks the configured LLM for a short, objective summary
 * with review questions, and writes it as a Markdown note into the Obsidian
 * vault named by OBSIDIAN_VAULT_PATH (personal, local installations only).
 *
 * The vault path comes only from the server environment; the client never
 * chooses where the file is written. One note per course and day; later
 * sessions on the same day are appended to it.
 */
import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, modelAuthorizationResponse } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Obsidian Summary');

const MAX_TRANSCRIPT_CHARS = 60_000;

interface SummaryRequest {
  courseTitle?: string;
  transcript?: string;
  currentSceneTitle?: string;
  focusMinutes?: number;
  completedBlocks?: number;
  language?: string;
}

/** Characters Obsidian and macOS file names cannot hold, plus control chars. */
function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Aula';
}

function localDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function localTime(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

export async function POST(req: NextRequest) {
  const vault = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (!vault) {
    return apiError('INVALID_REQUEST', 400, 'OBSIDIAN_VAULT_PATH is not set in .env.local');
  }

  try {
    const body = (await req.json()) as SummaryRequest;
    const transcript = (body.transcript ?? '').slice(0, MAX_TRANSCRIPT_CHARS).trim();
    if (!transcript) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'transcript is required');
    }
    const courseTitle = (body.courseTitle ?? '').trim() || 'Aula';
    const focusMinutes = Math.max(0, Math.round(Number(body.focusMinutes) || 0));
    const completedBlocks = Math.max(0, Math.round(Number(body.completedBlocks) || 0));
    const english = (body.language ?? '').toLowerCase().startsWith('en');

    const {
      model: languageModel,
      thinkingConfig,
      serverManaged,
    } = await resolveModelFromRequest(req, body, 'quiz-grade');

    const system = english
      ? `You are a personal tutor writing study notes for Obsidian. Be short and objective.
Reply in Markdown only, with exactly these sections:
## Key points
(5 to 8 bullets, one line each)
## Concepts
(term — one-line definition, at most 6)
## Review questions
(5 questions; put each answer inside an Obsidian callout: > [!success]- Answer)
## Next step
(one sentence)`
      : `Você é um professor particular escrevendo notas de estudo para o Obsidian. Seja curto e objetivo.
Responda somente em Markdown, em português do Brasil (se a narração estiver em inglês, escreva as notas em inglês para o aluno praticar o idioma), com exatamente estas seções:
## Pontos principais
(5 a 8 tópicos, uma linha cada)
## Conceitos
(termo — definição em uma linha, no máximo 6)
## Perguntas de revisão
(5 perguntas; coloque cada resposta dentro de um callout do Obsidian: > [!success]- Resposta)
## Próximo passo
(uma frase)`;

    const prompt = `${english ? 'Course' : 'Curso'}: ${courseTitle}
${body.currentSceneTitle ? `${english ? 'Learner stopped at' : 'O aluno parou em'}: ${body.currentSceneTitle}\n` : ''}
${english ? 'Lesson narration' : 'Narração da aula'}:
${transcript}`;

    const result = await callLLM(
      { model: languageModel, system, prompt },
      'quiz-grade',
      undefined,
      thinkingConfig,
      { serverManaged },
    );
    const summary = result.text.trim();

    const now = new Date();
    const folder = safeFileName(process.env.OBSIDIAN_SUMMARY_FOLDER?.trim() || 'OpenMAIC');
    const dir = path.join(vault, folder);
    const file = path.join(dir, `${localDate(now)} - ${safeFileName(courseTitle)}.md`);
    // Defense in depth: the resolved file must stay inside the vault.
    if (!path.resolve(file).startsWith(path.resolve(vault) + path.sep)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid note path');
    }

    await fs.mkdir(dir, { recursive: true });
    const exists = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false);

    const sessionHeader = english
      ? `# Session ${localTime(now)} · ${focusMinutes} min focus · ${completedBlocks} pomodoro(s)`
      : `# Sessão ${localTime(now)} · ${focusMinutes} min de foco · ${completedBlocks} pomodoro(s)`;

    const head = exists
      ? '\n\n---\n\n'
      : `---
curso: "${courseTitle.replace(/"/g, "'")}"
data: ${localDate(now)}
tags: [openmaic, estudo]
---

`;
    await fs.appendFile(file, `${head}${sessionHeader}\n\n${summary}\n`, 'utf8');

    log.info(`Summary written to ${file}`);
    return apiSuccess({ file: path.relative(vault, file) });
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    log.error('Obsidian summary failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to write the study summary');
  }
}
