import { NextRequest, NextResponse } from 'next/server';

// ─── AI Config - hardcoded for deployment reliability ───
const AI_CONFIG = {
  baseUrl: process.env.ZAI_BASE_URL || 'http://172.25.136.193:8080/v1',
  apiKey: process.env.ZAI_API_KEY || 'Z.ai',
  chatId: process.env.ZAI_CHAT_ID || 'chat-b143be40-707a-4ed8-a7f1-7eb4c4242644',
  token: process.env.ZAI_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ2MGE1YzYtMzZkYy00NTAxLTkzNzMtZDY3MzgwNDBmOWE1IiwiY2hhdF9pZCI6ImNoYXQtYjE0M2JlNDAtNzA3YS00ZWQ4LWE3ZjEtN2ViNGM0MjQyNjQ0IiwicGxhdGZvcm0iOiJ6YWkifQ.xRP1FZWQGaiMaYi6QyybJbgM9Z0yt5PMKZufd72qth8',
  userId: process.env.ZAI_USER_ID || '6d60a5c6-36dc-4501-9373-d6738040f9a5',
};

// ─── Direct AI API call ──────────────────────────────────
async function callAI(
  messages: { role: string; content: string }[],
  temperature = 0.7,
): Promise<string> {
  const url = `${AI_CONFIG.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
    'X-Z-AI-From': 'Z',
    'X-Chat-Id': AI_CONFIG.chatId,
    'X-User-Id': AI_CONFIG.userId,
    'X-Token': AI_CONFIG.token,
  };

  const body = JSON.stringify({ messages, temperature, thinking: { type: 'disabled' } });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s

  try {
    console.log(`[Brain API] Calling ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[Brain API] Response: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Brain API] Error (${response.status}):`, errorBody.substring(0, 200));
      throw new Error(`خطأ من الخادم (${response.status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('لم يتم توليد رد من الذكاء الاصطناعي');
    return content;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بالذكاء الاصطناعي');
    }
    throw err;
  }
}

// ─── Generate fallback analysis (no AI needed) ───
function generateFallbackAnalysis(idea: string) {
  return {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    console.log(`[Brain API] Action: ${action}`);

    switch (action) {
      case 'summarize': {
        const { nodes, brainKnowledge } = body;
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const text = await callAI([
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

        const text = await callAI([
          { role: 'system', content: 'أنت محلل شبكات معرفية. اقترح 3 روابط خفية بين عقد لا تبدو مرتبطة. أجب بصيغة JSON فقط: {"links":[{"from":"id","to":"id","reason":"السبب"}]}' },
          { role: 'user', content: nodeList },
        ], 0.8);

        let links = [];
        try { const m = text.match(/\{[\s\S]*\}/); if (m) links = JSON.parse(m[0]).links || []; } catch {}

        return NextResponse.json({ suggestedLinks: links });
      }

      case 'generate-nodes': {
        const { nodeLabel, nodeTag, nodeSummary } = body;
        const text = await callAI([
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

        const answer = await callAI([
          { role: 'system', content: 'أنت عقل معرفي ذكي. أجب على السؤال بناءً على المعرفة المتاحة. كن مختصراً (3-4 جمل) وعميقاً.' },
          { role: 'user', content: `المعرفة:\n${nodeDescriptions}\n\nالسؤال: ${question}` },
        ], 0.6);

        return NextResponse.json({ answer });
      }

      case 'analyze-idea': {
        const { idea } = body;
        console.log('[Brain API] analyze-idea:', idea?.substring(0, 50));

        let analysis = null;
        try {
          const systemPrompt = `أنت محلل مشاريع ذكي. حوّل الفكرة إلى خطة مشروع. أجب بصيغة JSON فقط بدون أي نص آخر. الصيغة:
{"title":"اسم المشروع","description":"وصف مختصر","phases":[{"name":"اسم المرحلة","description":"وصف المرحلة","tasks":[{"label":"اسم المهمة","description":"وصف المهمة"}]}],"tags":["تصنيف1"],"estimatedNodes":10}
3 مراحل لكل منها 2 مهام. كل شيء بالعربية. لا تكتب أي شيء قبل أو بعد JSON.`;

          const text = await callAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `الفكرة: ${idea}` },
          ], 0.3);

          console.log('[Brain API] AI response length:', text.length);

          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              analysis = JSON.parse(m[0]);
              if (!analysis.title || !analysis.phases) analysis = null;
            } catch {
              const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
              try {
                analysis = JSON.parse(fixed);
                if (!analysis.title || !analysis.phases) analysis = null;
              } catch { /* use fallback */ }
            }
          }
        } catch (err) {
          console.error('[Brain API] AI failed, using fallback:', err instanceof Error ? err.message : String(err));
        }

        if (!analysis) {
          console.log('[Brain API] Using fallback analysis');
          analysis = generateFallbackAnalysis(idea);
        }

        console.log('[Brain API] analyze-idea: done');
        return NextResponse.json({ analysis });
      }

      case 'execute-task': {
        const { taskLabel, taskDescription, projectContext } = body;
        const result = await callAI([
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

        const text = await callAI([
          {
            role: 'system',
            content: `أنت معلّم ذكي. بناءً على المعرفة التالية، أنشئ سؤال اختيار من متعدد. أجب بصيغة JSON فقط:
{"question":"السؤال","options":["خيار1","خيار2","خيار3","خيار4"],"correctIndex":0,"explanation":"شرح الإجابة الصحيحة"}
كل شيء بالعربية.`,
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

        const text = await callAI([
          {
            role: 'system',
            content: `أنت محلل معرفي ذكي. حلل الشبكة واكتشف الفجوات. أجب بصيغة JSON فقط:
{"newNodes":[{"label":"اسم العقدة","tag":"التصنيف","summary":"الوصف"}],"newLinks":[{"fromLabel":"عقدة","toLabel":"عقدة","reason":"السبب"}],"insights":["رؤية 1","رؤية 2"]}
كل شيء بالعربية.`,
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

      case 'generate-code': {
        const { idea, phases, tasks } = body;
        console.log('[Brain API] generate-code for:', idea?.substring(0, 50));

        const phasesDesc = phases?.map((p: { name: string; description: string; tasks: { label: string; description: string }[] }) =>
          `مرحلة: ${p.name} - ${p.description}\nالمهام: ${p.tasks?.map((t: { label: string; description: string }) => `${t.label} (${t.description})`).join(', ')}`
        ).join('\n');

        const systemPrompt = `أنت مطور Full-Stack محترف. بناءً على فكرة المشروع ومراحله ومهامه، قم بتوليد كود Next.js كامل قابل للتشغيل. أجب بصيغة JSON فقط بدون أي نص آخر. الصيغة:
{"files":[{"path":"src/app/page.tsx","content":"...كود الصفحة الرئيسية..."},{"path":"src/components/Header.tsx","content":"...كود الهيدر..."},{"path":"src/components/Footer.tsx","content":"...كود الفوتر..."},{"path":"src/components/Hero.tsx","content":"...كود القسم البطولي..."},{"path":"src/components/Features.tsx","content":"...كود الميزات..."},{"path":"package.json","content":"...ملف الحزم..."},{"path":"tailwind.config.ts","content":"...إعدادات Tailwind..."}]}
المتطلبات:
1. صفحة رئيسية كاملة بتصميم احترافي باستخدام Tailwind CSS
2. مكونات قابلة لإعادة الاستخدام (Header, Footer, Hero, Features)
3. دعم اللغة العربية (RTL) بالكامل
4. تصميم متجاوب (responsive) لجميع الأجهزة
5. ألوان وسمات متناسقة
6. الكود يجب أن يكون قابلاً للتشغيل مباشرة
7. استخدم Next.js App Router
8. لا تكتب أي شيء قبل أو بعد JSON
9. كل الملفات يجب أن تكون كاملة وليست مقتطفات`;

        const text = await callAI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `فكرة المشروع: ${idea}\n\nالمراحل والمهام:\n${phasesDesc || 'غير محدد'}` },
        ], 0.3);

        let files: { path: string; content: string }[] = [];
        try {
          // Try direct parse first
          const parsed = JSON.parse(text);
          files = parsed.files || [];
        } catch {
          // Try extracting JSON from the text
          try {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
              try {
                const parsed = JSON.parse(m[0]);
                files = parsed.files || [];
              } catch {
                const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                files = parsed.files || [];
              }
            }
          } catch { /* empty */ }
        }

        // If no files parsed, generate basic files from the idea
        if (files.length === 0) {
          console.log('[Brain API] generate-code: No files parsed from AI, generating basic files');
          files = [
            { path: 'src/app/page.tsx', content: `export default function Home() {\n  return (\n    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white" dir="rtl">\n      <header className="p-6 border-b border-white/10">\n        <h1 className="text-2xl font-bold">${idea}</h1>\n      </header>\n      <section className="p-12 text-center">\n        <h2 className="text-4xl font-bold mb-4">مرحباً بكم في ${idea}</h2>\n        <p className="text-gray-400 max-w-2xl mx-auto">مشروع مبتكر يقدم حلولاً ذكية</p>\n      </section>\n    </main>\n  )\n}` },
            { path: 'src/app/layout.tsx', content: `import type { Metadata } from 'next'\n\nexport const metadata: Metadata = { title: '${idea}', description: '${idea}' }\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="ar" dir="rtl">\n      <body>{children}</body>\n    </html>\n  )\n}` },
            { path: 'package.json', content: JSON.stringify({ name: idea.replace(/\s+/g, '-'), version: '0.1.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '14.0.0', react: '^18', 'react-dom': '^18' } }, null, 2) },
          ];
        }

        return NextResponse.json({ files });
      }

      case 'generate-preview': {
        const { idea, phases, tasks } = body;
        console.log('[Brain API] generate-preview for:', idea?.substring(0, 50));

        const phasesDesc = phases?.map((p: { name: string; description: string; tasks: { label: string; description: string }[] }) =>
          `مرحلة: ${p.name} - ${p.description}\nالمهام: ${p.tasks?.map((t: { label: string; description: string }) => `${t.label} (${t.description})`).join(', ')}`
        ).join('\n');

        const systemPrompt = `أنت مطور واجهات أمامية محترف. قم بتوليد صفحة HTML واحدة مستقلة (مع CSS و JS مدمجين) تمثل واجهة المستخدم للمشروع. الصفحة يجب أن تكون:
1. تصميم احترافي وجذاب
2. دعم اللغة العربية (RTL) بالكامل
3. تصميم متجاوب (responsive)
4. تفاعلية مع تأثيرات حركية جميلة
5. ألوان متناسقة وخطوط واضحة
6. تحتوي على: شريط تنقل، قسم بطولي، قسم الميزات، قسم التواصل، تذييل
7. أجب بـ HTML فقط بدون أي نص آخر. لا تكتب \`\`\`html أو أي شيء قبل أو بعد الكود.
8. اجعل الصفحة تعمل بشكل مستقل بدون أي مكتبات خارجية (استخدم CSS خالص أو CDN فقط)`;

        const html = await callAI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `فكرة المشروع: ${idea}\n\nالمراحل والمهام:\n${phasesDesc || 'غير محدد'}` },
        ], 0.3);

        // Strip markdown code fences if present
        let cleanHtml = html.trim();
        if (cleanHtml.startsWith('```html')) {
          cleanHtml = cleanHtml.slice(7);
        } else if (cleanHtml.startsWith('```')) {
          cleanHtml = cleanHtml.slice(3);
        }
        if (cleanHtml.endsWith('```')) {
          cleanHtml = cleanHtml.slice(0, -3);
        }
        cleanHtml = cleanHtml.trim();

        return NextResponse.json({ html: cleanHtml });
      }

      case 'generate-report': {
        const { idea, phases, tasks } = body;
        console.log('[Brain API] generate-report for:', idea?.substring(0, 50));

        const phasesDesc = phases?.map((p: { name: string; description: string; tasks: { label: string; description: string }[] }) =>
          `مرحلة: ${p.name} - ${p.description}\nالمهام: ${p.tasks?.map((t: { label: string; description: string }) => `${t.label} (${t.description})`).join(', ')}`
        ).join('\n');

        const systemPrompt = `أنت مستشار مشاريع محترف. قم بتوليد تقرير مشروع شامل بناءً على الفكرة والمراحل والمهام. أجب بصيغة JSON فقط بدون أي نص آخر. الصيغة:
{"report":{"executiveSummary":"ملخص تنفيذي شامل (3-5 جمل)","requirements":["متطلب 1","متطلب 2","متطلب 3"],"techStack":["تقنية 1","تقنية 2","تقنية 3"],"architecture":"وصف البنية التقنية للمشروع","timeline":"الجدول الزمني المقترح","risks":["خطر 1","خطر 2","خطر 3"],"recommendations":["توصية 1","توصية 2","توصية 3"]}}
كل شيء بالعربية. كن مفصلاً ومهنياً. لا تكتب أي شيء قبل أو بعد JSON.`;

        const text = await callAI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `فكرة المشروع: ${idea}\n\nالمراحل والمهام:\n${phasesDesc || 'غير محدد'}` },
        ], 0.3);

        let report = null;
        try {
          // Try direct parse first
          const parsed = JSON.parse(text);
          report = parsed.report || parsed;
        } catch {
          try {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) {
              try {
                const parsed = JSON.parse(m[0]);
                report = parsed.report || parsed;
              } catch {
                const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                report = parsed.report || parsed;
              }
            }
          } catch { /* empty */ }
        }

        // Fallback report
        if (!report) {
          report = {
            executiveSummary: `مشروع ${idea} هو مشروع مبتكر يهدف إلى تقديم حلول ذكية ومتطورة.`,
            requirements: ['واجهة مستخدم سهلة الاستخدام', 'نظام إدارة متكامل', 'دعم اللغة العربية', 'تصميم متجاوب'],
            techStack: ['Next.js', 'React', 'Tailwind CSS', 'TypeScript'],
            architecture: 'بنية ثلاثية الطبقات: واجهة أمامية (Frontend)، خادم API (Backend)، قاعدة بيانات (Database)',
            timeline: '3-6 أشهر مقسمة على مراحل التخطيط والتطوير والاختبار والإطلاق',
            risks: ['تأخر في التطوير', 'تغيير المتطلبات', 'تحديات الأداء'],
            recommendations: ['البدء بنسخة أولية بسيطة', 'اختبار مستمر مع المستخدمين', 'توثيق الكود بشكل جيد'],
          };
        }

        return NextResponse.json({ report });
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
