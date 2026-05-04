import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Robust config loader ───────────────────────────────
function loadZAIConfig(): { baseUrl: string; apiKey: string; chatId?: string; token?: string; userId?: string } | null {
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
        console.log(`[Brain API] Loaded config from: ${filePath}`);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // Initialize ZAI SDK with manual config loading (more robust than ZAI.create())
    let zai: InstanceType<typeof ZAI>;
    try {
      const config = loadZAIConfig();
      if (!config) {
        console.error('[Brain API] No valid .z-ai-config found in any location');
        return NextResponse.json({
          error: 'AI service unavailable',
          summary: 'خدمة الذكاء الاصطناعي غير متاحة حالياً — لم يتم العثور على ملف الإعداد'
        }, { status: 503 });
      }
      // Use the ZAI constructor directly with our loaded config
      zai = new ZAI(config);
      console.log('[Brain API] ZAI SDK initialized successfully');
    } catch (sdkError) {
      console.error('[Brain API] ZAI SDK init error:', sdkError);
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

        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'أنت عقل معرفي ذكي. قدم تحليلاً مختصراً وعميقاً بالعربية للشبكة المعرفية. اكتب ملخصاً من 3-4 جمل يربط المواضيع ويكشف أنماطاً خفية. ثم اطرح سؤالين مثيرين للتفكير.' },
            { role: 'user', content: `شبكة معرفية تحوي ${nodes.length} عقدة بمستوى معرفة ${brainKnowledge}:\n${nodeDescriptions}` },
          ],
          temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content || '';
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

        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'أنت محلل شبكات معرفية. اقترح 3 روابط خفية بين عقد لا تبدو مرتبطة. أجب بصيغة JSON فقط: {"links":[{"from":"id","to":"id","reason":"السبب"}]}' },
            { role: 'user', content: nodeList },
          ],
          temperature: 0.8,
        });

        let links = [];
        try { const m = completion.choices[0]?.message?.content?.match(/\{[\s\S]*\}/); if (m) links = JSON.parse(m[0]).links || []; } catch {}

        return NextResponse.json({ suggestedLinks: links });
      }

      case 'generate-nodes': {
        const { nodeLabel, nodeTag, nodeSummary } = body;
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'أنت مولد معرفة. اقترح 4 عقد فرعية جديدة. أجب بصيغة JSON فقط: {"nodes":[{"label":"الاسم","tag":"التصنيف","summary":"الوصف"}]}' },
            { role: 'user', content: `الموضوع: ${nodeLabel} (${nodeTag})\nالوصف: ${nodeSummary}` },
          ],
          temperature: 0.8,
        });

        let newNodes = [];
        try { const m = completion.choices[0]?.message?.content?.match(/\{[\s\S]*\}/); if (m) newNodes = JSON.parse(m[0]).nodes || []; } catch {}

        return NextResponse.json({ suggestedNodes: newNodes });
      }

      case 'ask': {
        const { nodes, question } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; summary: string }) => `${n.label}: ${n.summary}`)
          .join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: 'أنت عقل معرفي ذكي. أجب على السؤال بناءً على المعرفة المتاحة. كن مختصراً (3-4 جمل) وعميقاً.' },
            { role: 'user', content: `المعرفة:\n${nodeDescriptions}\n\nالسؤال: ${question}` },
          ],
          temperature: 0.6,
        });

        return NextResponse.json({ answer: completion.choices[0]?.message?.content || '' });
      }

      // 💡 Analyze an idea and create a project plan
      case 'analyze-idea': {
        const { idea } = body;
        console.log('[Brain API] analyze-idea called with idea:', idea?.substring(0, 50));

        const completion = await zai.chat.completions.create({
          messages: [
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
          ],
          temperature: 0.7,
        });

        let analysis = null;
        try {
          const m = completion.choices[0]?.message?.content?.match(/\{[\s\S]*\}/);
          if (m) analysis = JSON.parse(m[0]);
        } catch (parseErr) {
          console.error('[Brain API] Failed to parse analyze-idea response:', parseErr);
        }

        console.log('[Brain API] analyze-idea result:', analysis ? 'success' : 'no analysis generated');
        return NextResponse.json({ analysis });
      }

      // 💡 Execute a project task
      case 'execute-task': {
        const { taskLabel, taskDescription, projectContext } = body;
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت منفذ مهام ذكي. نفذ المهمة التالية وقدم نتيجة مفصلة بالعربية (3-5 جمل). اشرح ما تم إنجازه والخطوات التالية.',
            },
            { role: 'user', content: `المشروع: ${projectContext}\nالمهمة: ${taskLabel}\nالوصف: ${taskDescription}` },
          ],
          temperature: 0.6,
        });

        return NextResponse.json({ result: completion.choices[0]?.message?.content || '' });
      }

      // 🎓 Generate quiz questions
      case 'generate-quiz': {
        const { nodes } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
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
          ],
          temperature: 0.8,
        });

        let quiz = null;
        try {
          const m = completion.choices[0]?.message?.content?.match(/\{[\s\S]*\}/);
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

        const completion = await zai.chat.completions.create({
          messages: [
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
          ],
          temperature: 0.8,
        });

        let result = { newNodes: [], newLinks: [], insights: [] };
        try {
          const m = completion.choices[0]?.message?.content?.match(/\{[\s\S]*\}/);
          if (m) result = JSON.parse(m[0]);
        } catch {}

        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Brain API] Unhandled error:', error);
    return NextResponse.json({ error: 'Failed', summary: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
