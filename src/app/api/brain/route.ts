import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Parse .env file manually (standalone server doesn't load it) ──
function loadDotEnv(): void {
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      // Only set if not already defined
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found, that's ok
  }
}

// ─── Load .env once at module level (runs on first import) ───
loadDotEnv();

// ─── Robust config loader: env vars → .z-ai-config → /etc ───
function loadZAIConfig(): { baseUrl: string; apiKey: string; chatId?: string; token?: string; userId?: string } | null {
  // 1) Try environment variables (now includes .env loaded above)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    console.log('[Brain API] Config from env vars / .env');
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      token: process.env.ZAI_TOKEN,
      userId: process.env.ZAI_USER_ID,
    };
  }

  // 2) Try .z-ai-config JSON files
  const configPaths = [
    join(process.cwd(), '.z-ai-config'),
    join(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];
  for (const filePath of configPaths) {
    try {
      const configStr = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(configStr);
      if (config.baseUrl && config.apiKey) {
        console.log(`[Brain API] Config from file: ${filePath}`);
        return config;
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(`[Brain API] Error reading config at ${filePath}:`, err);
      }
    }
  }

  return null;
}

// ─── Direct AI API call with retry and timeout ──────────
async function callAI(
  config: { baseUrl: string; apiKey: string; chatId?: string; token?: string; userId?: string },
  messages: { role: string; content: string }[],
  temperature = 0.7,
  retries = 2,
): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  };
  if (config.chatId) headers['X-Chat-Id'] = config.chatId;
  if (config.userId) headers['X-User-Id'] = config.userId;
  if (config.token) headers['X-Token'] = config.token;

  const body = JSON.stringify({ messages, temperature, thinking: { type: 'disabled' } });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Brain API] AI request failed (${response.status}):`, errorBody.substring(0, 200));
        throw new Error(`خطأ من الخادم (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (!content) throw new Error('لم يتم توليد رد من الذكاء الاصطناعي');
      return content;
    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isFetchFail = err instanceof TypeError && err.message === 'fetch failed';
      console.error(`[Brain API] Attempt ${attempt}/${retries} failed:`, err instanceof Error ? err.message : err);

      if (attempt < retries && (isAbort || isFetchFail)) {
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (isAbort) throw new Error('انتهت مهلة الاتصال بالذكاء الاصطناعي');
      if (isFetchFail) throw new Error('فشل الاتصال بخادم الذكاء الاصطناعي');
      throw err;
    }
  }

  throw new Error('فشل الاتصال بعد عدة محاولات');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const config = loadZAIConfig();
    if (!config) {
      console.error('[Brain API] No config found in env vars or files');
      return NextResponse.json({
        error: 'AI service unavailable',
        summary: 'خدمة الذكاء الاصطناعي غير متاحة حالياً'
      }, { status: 503 });
    }

    switch (action) {
      case 'summarize': {
        const { nodes, brainKnowledge } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const text = await callAI(config, [
          { role: 'system', content: 'أنت عقل معرفي ذكي. قدم تحليلاً مختصراً وعميقاً بالعربية للشبكة المعرفية. اكتب ملخصاً من 3-4 جمل يربط المواضيع ويكشف أنماطاً خفية. ثم اطرح سؤالين مثيرين للتفكير.' },
          { role: 'user', content: `شبكة معرفية تحوي ${nodes.length} عقدة بمستوى معرفة ${brainKnowledge}:\n${nodeDescriptions}` },
        ], 0.7);

        const parts = text.split(/سؤال\s*\d*[.:]/);
        const summary = parts[0]?.trim() || '';
        const questions = parts.slice(1).map(q => q.trim()).filter(q => q.length > 5);
        if (questions.length === 0) { questions.push('كيف ترتبط هذه المواضيع؟'); questions.push('ما المفهوم المشترك الخفي؟'); }

        return NextResponse.json({ summary, questions: questions.slice(0, 3) });
      }

      case 'suggest-links': {
        const { nodes } = body;
        const nodeList = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { id: string; label: string; tag: string; summary: string }) => `ID:${n.id} | ${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const text = await callAI(config, [
          { role: 'system', content: 'أنت محلل شبكات معرفية. اقترح 3 روابط خفية بين عقد لا تبدو مرتبطة. أجب بصيغة JSON فقط: {"links":[{"from":"id","to":"id","reason":"السبب"}]}' },
          { role: 'user', content: nodeList },
        ], 0.8);

        let links = [];
        try { const m = text.match(/\{[\s\S]*\}/); if (m) links = JSON.parse(m[0]).links || []; } catch {}

        return NextResponse.json({ suggestedLinks: links });
      }

      case 'generate-nodes': {
        const { nodeLabel, nodeTag, nodeSummary } = body;
        const text = await callAI(config, [
          { role: 'system', content: 'أنت مولد معرفة. اقترح 4 عقد فرعية جديدة. أجب بصيغة JSON فقط: {"nodes":[{"label":"الاسم","tag":"التصنيف","summary":"الوصف"}]}' },
          { role: 'user', content: `الموضوع: ${nodeLabel} (${nodeTag})\nالوصف: ${nodeSummary}` },
        ], 0.8);

        let newNodes = [];
        try { const m = text.match(/\{[\s\S]*\}/); if (m) newNodes = JSON.parse(m[0]).nodes || []; } catch {}

        return NextResponse.json({ suggestedNodes: newNodes });
      }

      case 'ask': {
        const { nodes, question } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; summary: string }) => `${n.label}: ${n.summary}`)
          .join('\n');

        const answer = await callAI(config, [
          { role: 'system', content: 'أنت عقل معرفي ذكي. أجب على السؤال بناءً على المعرفة المتاحة. كن مختصراً (3-4 جمل) وعميقاً.' },
          { role: 'user', content: `المعرفة:\n${nodeDescriptions}\n\nالسؤال: ${question}` },
        ], 0.6);

        return NextResponse.json({ answer });
      }

      // 💡 Analyze an idea and create a project plan
      case 'analyze-idea': {
        const { idea } = body;
        console.log('[Brain API] analyze-idea:', idea?.substring(0, 50));

        const text = await callAI(config, [
          {
            role: 'system',
            content: `أنت محلل مشاريع ذكي. حوّل الفكرة التالية إلى خطة مشروع مفصلة. أجب بصيغة JSON فقط بهذا الشكل:
{
  "title": "اسم المشروع",
  "description": "وصف مختصر",
  "phases": [
    {
      "name": "اسم المرحلة",
      "description": "وصف المرحلة",
      "tasks": [
        {"label": "اسم المهمة", "description": "وصف المهمة"}
      ]
    }
  ],
  "tags": ["تصنيف1", "تصنيف2"],
  "estimatedNodes": 10
}
اجعل المشروع واقعياً وقابلاً للتنفيذ. 3-5 مراحل لكل منها 2-4 مهام. كل شيء بالعربية.`,
          },
          { role: 'user', content: `الفكرة: ${idea}` },
        ], 0.7);

        let analysis = null;
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) analysis = JSON.parse(m[0]);
        } catch (parseErr) {
          console.error('[Brain API] JSON parse error:', parseErr);
        }

        console.log('[Brain API] analyze-idea:', analysis ? 'success' : 'no analysis');
        return NextResponse.json({ analysis });
      }

      // 💡 Execute a project task
      case 'execute-task': {
        const { taskLabel, taskDescription, projectContext } = body;
        const result = await callAI(config, [
          { role: 'system', content: 'أنت منفذ مهام ذكي. نفذ المهمة التالية وقدم نتيجة مفصلة بالعربية (3-5 جمل). اشرح ما تم إنجازه والخطوات التالية.' },
          { role: 'user', content: `المشروع: ${projectContext}\nالمهمة: ${taskLabel}\nالوصف: ${taskDescription}` },
        ], 0.6);

        return NextResponse.json({ result });
      }

      // 🎓 Generate quiz questions
      case 'generate-quiz': {
        const { nodes } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const text = await callAI(config, [
          {
            role: 'system',
            content: `أنت معلّم ذكي. بناءً على المعرفة التالية، أنشئ سؤال اختيار من متعدد. أجب بصيغة JSON فقط:
{
  "question": "السؤال",
  "options": ["خيار1", "خيار2", "خيار3", "خيار4"],
  "correctIndex": 0,
  "explanation": "شرح الإجابة الصحيحة"
}
اجعل الأسئلة مثيرة وتربط بين مواضيع مختلفة. كل شيء بالعربية.`,
          },
          { role: 'user', content: nodeDescriptions },
        ], 0.8);

        let quiz = null;
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) quiz = JSON.parse(m[0]);
        } catch {}

        return NextResponse.json({ quiz });
      }

      // 🧠 Auto-learn - analyze gaps and suggest new knowledge
      case 'auto-learn': {
        const { nodes, brainKnowledge } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const text = await callAI(config, [
          {
            role: 'system',
            content: `أنت محلل معرفي ذكي. حلل الشبكة المعرفية التالية واكتشف الفجوات — ما المعرفة الناقصة؟ اقترح عقد جديدة وروابط تثري الشبكة. أجب بصيغة JSON فقط:
{
  "newNodes": [{"label": "اسم العقدة", "tag": "التصنيف", "summary": "الوصف"}],
  "newLinks": [{"fromLabel": "اسم عقدة موجودة", "toLabel": "اسم عقدة موجودة أو جديدة", "reason": "السبب"}],
  "insights": ["رؤية 1", "رؤية 2"]
}
3-5 عقد جديدة و 2-3 روابط و 2 رؤى. كل شيء بالعربية.`,
          },
          { role: 'user', content: `الشبكة (معرفة: ${brainKnowledge}):\n${nodeDescriptions || 'الشبكة فارغة'}` },
        ], 0.8);

        let result = { newNodes: [], newLinks: [], insights: [] };
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) result = JSON.parse(m[0]);
        } catch {}

        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Brain API] Error:', error);
    const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
    return NextResponse.json({
      error: 'Failed',
      summary: message
    }, { status: 500 });
  }
}
