import { NextRequest, NextResponse } from 'next/server';

// ─── Hardcoded fallback config (always works, no file/dependency needed) ───
// This is the deployment-safe approach: the config is always available
// regardless of how the server starts (standalone, dev, docker, etc.)
const FALLBACK_CONFIG = {
  baseUrl: 'http://172.25.136.193:8080/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-b143be40-707a-4ed8-a7f1-7eb4c4242644',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ2MGE1YzYtMzZkYy00NTAxLTkzNzMtZDY3MzgwNDBmOWE1IiwiY2hhdF9pZCI6ImNoYXQtYjE0M2JlNDAtNzA3YS00ZWQ4LWE3ZjEtN2ViNGM0MjQyNjQ0IiwicGxhdGZvcm0iOiJ6YWkifQ.xRP1FZWQGaiMaYi6QyybJbgM9Z0yt5PMKZufd72qth8',
  userId: '6d60a5c6-36dc-4501-9373-d6738040f9a5',
};

function getConfig() {
  // Priority 1: environment variables (if set)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID || FALLBACK_CONFIG.chatId,
      token: process.env.ZAI_TOKEN || FALLBACK_CONFIG.token,
      userId: process.env.ZAI_USER_ID || FALLBACK_CONFIG.userId,
    };
  }
  // Priority 2: hardcoded fallback (always available)
  return FALLBACK_CONFIG;
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
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      console.log(`[Brain API] Attempt ${attempt}/${retries} - calling ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      console.log(`[Brain API] Response status: ${response.status}`);

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
      const isFetchFail = err instanceof TypeError && (err.message === 'fetch failed' || err.message.includes('fetch failed'));
      console.error(`[Brain API] Attempt ${attempt}/${retries} failed:`, err instanceof Error ? err.message : String(err));

      if (attempt < retries && (isAbort || isFetchFail)) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      if (isAbort) throw new Error('انتهت مهلة الاتصال. حاول مرة أخرى.');
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

    const config = getConfig();
    console.log(`[Brain API] Action: ${action}, Config baseUrl: ${config.baseUrl}`);

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

      case 'analyze-idea': {
        const { idea } = body;
        console.log('[Brain API] analyze-idea:', idea?.substring(0, 50));

        const systemPrompt = `أنت محلل مشاريع ذكي. حوّل الفكرة إلى خطة مشروع. أجب بصيغة JSON فقط بدون أي نص آخر. الصيغة المطلوبة:
{"title":"اسم المشروع","description":"وصف مختصر","phases":[{"name":"اسم المرحلة","description":"وصف المرحلة","tasks":[{"label":"اسم المهمة","description":"وصف المهمة"}]}],"tags":["تصنيف1"],"estimatedNodes":10}
3 مراحل لكل منها 2 مهام. كل شيء بالعربية. لا تكتب أي شيء قبل أو بعد JSON.`;

        let analysis = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const text = await callAI(config, [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `الفكرة: ${idea}` },
            ], 0.3);

            console.log('[Brain API] AI raw response length:', text.length);

            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
              try {
                analysis = JSON.parse(m[0]);
                if (analysis.title && analysis.phases) {
                  console.log('[Brain API] analyze-idea: success on attempt', attempt);
                  break;
                }
                analysis = null;
              } catch {
                console.error('[Brain API] JSON parse failed, attempt', attempt);
                const fixed = m[0]
                  .replace(/,\s*([}\]])/g, '$1')
                  .replace(/'/g, '"');
                try {
                  analysis = JSON.parse(fixed);
                  if (analysis.title && analysis.phases) {
                    console.log('[Brain API] analyze-idea: success with fix on attempt', attempt);
                    break;
                  }
                  analysis = null;
                } catch {
                  // Still failed, retry
                }
              }
            }
          } catch (fetchErr) {
            console.error('[Brain API] analyze-idea fetch error on attempt', attempt, fetchErr);
            if (attempt === 2) throw fetchErr;
          }
        }

        if (!analysis) {
          console.log('[Brain API] Using fallback analysis');
          analysis = {
            title: `مشروع: ${idea.substring(0, 40)}`,
            description: `مشروع مبني على الفكرة: ${idea}`,
            phases: [
              { name: 'مرحلة التخطيط', description: 'تحديد المتطلبات وخطة العمل', tasks: [
                { label: 'تحليل الفكرة', description: 'دراسة الفكرة وتحديد المتطلبات' },
                { label: 'وضع خطة العمل', description: 'تحديد الخطوات والموارد اللازمة' },
              ]},
              { name: 'مرحلة التنفيذ', description: 'بناء وتطوير المشروع', tasks: [
                { label: 'التطوير الأولي', description: 'بناء النسخة الأولى من المشروع' },
                { label: 'الاختبار', description: 'اختبار المشروع وتحسينه' },
              ]},
              { name: 'مرحلة الإطلاق', description: 'إطلاق المشروع وتسويقه', tasks: [
                { label: 'الإطلاق', description: 'نشر المشروع للجمهور' },
                { label: 'التقييم', description: 'تقييم الأداء والتحسين' },
              ]},
            ],
            tags: ['مشروع'],
            estimatedNodes: 8,
          };
        }

        return NextResponse.json({ analysis });
      }

      case 'execute-task': {
        const { taskLabel, taskDescription, projectContext } = body;
        const result = await callAI(config, [
          { role: 'system', content: 'أنت منفذ مهام ذكي. نفذ المهمة التالية وقدم نتيجة مفصلة بالعربية (3-5 جمل). اشرح ما تم إنجازه والخطوات التالية.' },
          { role: 'user', content: `المشروع: ${projectContext}\nالمهمة: ${taskLabel}\nالوصف: ${taskDescription}` },
        ], 0.6);

        return NextResponse.json({ result });
      }

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
