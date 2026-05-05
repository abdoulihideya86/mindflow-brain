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
  timeoutMs = 60000,
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
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        const { taskLabel, taskDescription, projectContext, projectIdea, allTasks } = body;

        // ─── Detect task type → generate the right artifact ───
        const label = (taskLabel || '').toLowerCase();
        const desc  = (taskDescription || '').toLowerCase();

        const isCode     = /كود|برمجة|تطوير|component|api|endpoint|دالة|function|script|backend|frontend|قاعدة بيانات|schema|model/.test(label + desc);
        const isUI       = /واجهة|تصميم|ui|ux|صفحة|page|layout|شاشة|نموذج|form|dashboard/.test(label + desc);
        const isTest     = /اختبار|test|تجربة|فحص|unit|integration|e2e/.test(label + desc);
        const isAnalysis = /تحليل|بحث|دراسة|متطلبات|خطة|plan|strategy|توثيق|document|architecture/.test(label + desc);

        let systemPrompt: string;
        let artifactType: 'code' | 'html' | 'markdown' | 'tests' | 'plan';

        if (isCode) {
          artifactType = 'code';
          systemPrompt = `أنت مطور برمجي خبير. مهمتك توليد كود حقيقي وقابل للتشغيل.
قواعد صارمة:
- اكتب كود TypeScript/JavaScript حقيقي ومكتمل
- لا تكتب شرحاً أو مقدمة — فقط الكود
- ابدأ مباشرة بـ \`\`\`typescript
- الكود يجب أن يكون قابلاً للنسخ والتشغيل فوراً
- ضمّن imports اللازمة
- اكتب تعليقات عربية داخل الكود لشرح المنطق`;
        } else if (isUI) {
          artifactType = 'html';
          systemPrompt = `أنت مصمم UI/UX خبير. مهمتك توليد HTML كامل وجميل قابل للمعاينة.
قواعد صارمة:
- اكتب HTML صفحة كاملة مع CSS مدمج في <style>
- لا تكتب شرحاً — فقط HTML من <!DOCTYPE html> للنهاية
- استخدم تصميم حديث (gradients, shadows, animations)
- دعم RTL واللغة العربية
- ألوان متناسقة وجميلة
- ابدأ مباشرة بـ <!DOCTYPE html>`;
        } else if (isTest) {
          artifactType = 'tests';
          systemPrompt = `أنت مهندس اختبارات. مهمتك كتابة test cases حقيقية وشاملة.
قواعد صارمة:
- اكتب Jest/Vitest tests حقيقية وقابلة للتشغيل
- غطّ happy path وedge cases والأخطاء
- ابدأ مباشرة بـ \`\`\`typescript
- لا شرح قبل الكود
- كل test له describe واضح وit مفصّل`;
        } else if (isAnalysis) {
          artifactType = 'markdown';
          systemPrompt = `أنت محلل أعمال ومستشار مشاريع خبير. مهمتك توليد وثيقة تحليل احترافية.
قواعد صارمة:
- اكتب Markdown منظم ومفصل
- ابدأ بـ # عنوان المهمة
- قسّم لأقسام واضحة مع ##
- كن محدداً وعملياً — لا كلام عام
- ضمّن: التحليل، المتطلبات، الخطوات، التوصيات، المخاطر`;
        } else {
          artifactType = 'plan';
          systemPrompt = `أنت مدير مشاريع خبير. مهمتك توليد خطة تنفيذ مفصلة وقابلة للتطبيق.
قواعد صارمة:
- اكتب Markdown منظم
- قسّم لخطوات مرقمة وواضحة
- كل خطوة فيها: ماذا تفعل، كيف تفعله، المدة الزمنية
- ابدأ بـ # خطة تنفيذ: [اسم المهمة]
- ضمّن checklist في النهاية`;
        }

        console.log(`[Brain API] execute-task type=${artifactType} task="${taskLabel?.substring(0, 40)}"`);

        const contextSection = Array.isArray(allTasks) && allTasks.length
          ? `\nمهام المشروع الأخرى: ${(allTasks as string[]).slice(0, 8).join('، ')}`
          : '';

        const rawOutput = await callAI([
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `المشروع: ${projectContext || 'مشروع برمجي'}
الفكرة: ${projectIdea || projectContext || ''}${contextSection}

المهمة المطلوب تنفيذها:
العنوان: ${taskLabel}
الوصف: ${taskDescription || taskLabel}

نفّذ هذه المهمة الآن بشكل كامل.`,
          },
        ], 0.4, 90000);

        // ─── Extract clean artifact ───
        let artifact = rawOutput.trim();
        let artifactCode = '';

        if (artifactType === 'code' || artifactType === 'tests') {
          const codeMatch = artifact.match(/```(?:typescript|javascript|ts|js|tsx|jsx)?\n?([\s\S]*?)```/);
          artifactCode = codeMatch ? codeMatch[1].trim() : artifact.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
        } else if (artifactType === 'html') {
          const htmlMatch = artifact.match(/<!DOCTYPE html>[\s\S]*/i);
          artifactCode = htmlMatch ? htmlMatch[0].trim() : artifact.replace(/```html\n?/, '').replace(/\n?```$/, '');
        } else {
          artifactCode = artifact;
        }

        // ─── Summary line shown in the task ───
        const lineCount = artifactCode.split('\n').length;
        const summary =
          artifactType === 'code'  ? `✅ تم توليد كود TypeScript (${lineCount} سطر)` :
          artifactType === 'html'  ? `✅ تم توليد واجهة HTML جاهزة للمعاينة` :
          artifactType === 'tests' ? `✅ تم توليد ${artifactCode.split('it(').length - 1} اختبارات` :
                                     `✅ تم توليد وثيقة تفصيلية (${lineCount} سطر)`;

        return NextResponse.json({ result: summary, artifact: artifactCode, artifactType });
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
          'مرحلة: ' + p.name + ' - ' + p.description + '\nالمهام: ' + (p.tasks?.map((t: { label: string; description: string }) => t.label + ' (' + t.description + ')').join(', ') || '')
        ).join('\n');

        // Ask AI for project structure (small JSON, not full code)
        const systemPrompt = 'أنت مطور Full-Stack. ولّد هيكل مشروع Next.js بصيغة JSON فقط. الصيغة:\n{"projectName":"اسم المشروع","pages":[{"name":"Home","path":"/","description":"الصفحة الرئيسية","components":["Header","Hero","Features","Footer"]}],"components":[{"name":"Header","description":"شريط التنقل"},{"name":"Hero","description":"القسم البطولي"},{"name":"Features","description":"قسم الميزات"},{"name":"Footer","description":"التذييل"}],"colors":{"primary":"#6366f1","secondary":"#8b5cf6","accent":"#06b6d4","bg":"#0f172a","text":"#f8fafc"},"dependencies":["next","react","react-dom","tailwindcss"]}\nكل شيء بالعربية. لا تكتب أي شيء قبل أو بعد JSON. كن مختصراً.';

        let projectStructure: Record<string, unknown> | null = null;
        try {
          const text = await callAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'فكرة المشروع: ' + idea + '\n\nالمراحل والمهام:\n' + (phasesDesc || 'غير محدد') },
          ], 0.3);

          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              projectStructure = JSON.parse(m[0]);
            } catch {
              const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
              try { projectStructure = JSON.parse(fixed); } catch { /* empty */ }
            }
          }
        } catch (err) {
          console.error('[Brain API] generate-code AI failed:', err instanceof Error ? err.message : String(err));
        }

        // Generate code files from structure or fallback
        const pName = (projectStructure?.projectName as string) || idea || 'مشروع';
        const colors = (projectStructure?.colors as Record<string, string>) || { primary: '#6366f1', secondary: '#8b5cf6', accent: '#06b6d4', bg: '#0f172a', text: '#f8fafc' };
        const deps = (projectStructure?.dependencies as string[]) || ['next', 'react', 'react-dom', 'tailwindcss'];
        const compList = (projectStructure?.components as { name: string; description: string }[]) || [
          { name: 'Header', description: 'شريط التنقل الرئيسي' },
          { name: 'Hero', description: 'القسم البطولي' },
          { name: 'Features', description: 'قسم الميزات' },
          { name: 'Footer', description: 'التذييل' },
        ];
        const pageList = (projectStructure?.pages as { name: string; path: string; description: string; components: string[] }[]) || [
          { name: 'Home', path: '/', description: 'الصفحة الرئيسية', components: ['Header', 'Hero', 'Features', 'Footer'] },
        ];

        const safeName = pName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').replace(/-+/g, '-');
        const files: { path: string; content: string }[] = [];

        // Helper: build line-based content
        function lines(...ls: string[]) { return ls.join('\n'); }

        // layout.tsx
        files.push({
          path: 'src/app/layout.tsx',
          content: lines(
            "import type { Metadata } from 'next'",
            "import './globals.css'",
            '',
            'export const metadata: Metadata = {',
            '  title: ' + JSON.stringify(pName) + ',',
            '  description: ' + JSON.stringify(pName + ' - مشروع مبتكر') + ',',
            '}',
            '',
            'export default function RootLayout({ children }: { children: React.ReactNode }) {',
            '  return (',
            '    <html lang="ar" dir="rtl">',
            '      <body className="antialiased">{children}</body>',
            '    </html>',
            '  )',
            '}',
          ),
        });

        // globals.css
        files.push({
          path: 'src/app/globals.css',
          content: lines(
            '@tailwind base;',
            '@tailwind components;',
            '@tailwind utilities;',
            '',
            ':root {',
            '  --color-primary: ' + colors.primary + ';',
            '  --color-secondary: ' + colors.secondary + ';',
            '  --color-accent: ' + colors.accent + ';',
            '  --color-bg: ' + colors.bg + ';',
            '  --color-text: ' + colors.text + ';',
            '}',
            '',
            "body {",
            '  background-color: var(--color-bg);',
            '  color: var(--color-text);',
            "  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;",
            '}',
          ),
        });

        // Components
        const featureIcons = ['🚀', '⚡', '🔒', '🎯', '💡', '🌟'];
        const featureNames = ['أداء عالي', 'سرعة فائقة', 'أمان متقدم', 'دقة متناهية', 'ابتكار مستمر', 'جودة عالية'];

        for (const comp of compList) {
          let content: string;
          if (comp.name === 'Header') {
            content = lines(
              "'use client';",
              '',
              'export default function Header() {',
              '  return (',
              '    <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">',
              '      <h1 className="text-xl font-bold" style={{ color: ' + JSON.stringify(colors.primary) + ' }}>' + pName + '</h1>',
              '      <nav className="flex gap-6 text-sm">',
              '        <a href="/" className="hover:text-white/80 transition-colors">الرئيسية</a>',
              '        <a href="/about" className="hover:text-white/80 transition-colors">من نحن</a>',
              '        <a href="/contact" className="hover:text-white/80 transition-colors">تواصل</a>',
              '      </nav>',
              '    </header>',
              '  )',
              '}',
            );
          } else if (comp.name === 'Hero') {
            content = lines(
              'export default function Hero() {',
              '  return (',
              '    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8 py-16">',
              '      <h2 className="text-5xl font-extrabold mb-6 leading-tight">' + pName + '</h2>',
              '      <p className="text-lg text-white/70 max-w-2xl mb-8">' + (comp.description || 'مشروع مبتكر يقدم حلولاً ذكية') + '</p>',
              '      <button className="px-8 py-3 rounded-full font-bold text-lg transition-transform hover:scale-105" style={{ background: ' + JSON.stringify(colors.primary) + ', color: ' + JSON.stringify('#fff') + ' }}>ابدأ الآن</button>',
              '    </section>',
              '  )',
              '}',
            );
          } else if (comp.name === 'Features') {
            const featureCards = featureNames.map((name, i) =>
              '        <div className="p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors">\n' +
              '          <div className="text-3xl mb-3">' + featureIcons[i] + '</div>\n' +
              '          <h3 className="text-lg font-bold mb-2">' + name + '</h3>\n' +
              '          <p className="text-sm text-white/60">' + comp.description + '</p>\n' +
              '        </div>'
            ).join('\n');
            content = lines(
              'export default function Features() {',
              '  return (',
              '    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-8 py-12 max-w-6xl mx-auto">',
              featureCards,
              '    </section>',
              '  )',
              '}',
            );
          } else if (comp.name === 'Footer') {
            content = lines(
              'export default function Footer() {',
              '  return (',
              '    <footer className="border-t border-white/10 px-6 py-6 text-center text-sm text-white/50">',
              '      <p>' + pName + ' &copy; {new Date().getFullYear()} — جميع الحقوق محفوظة</p>',
              '    </footer>',
              '  )',
              '}',
            );
          } else {
            content = lines(
              'export default function ' + comp.name + '() {',
              '  return (',
              '    <div className="p-6 rounded-xl border border-white/10 bg-white/5">',
              '      <h3 className="text-lg font-bold mb-2">' + comp.name + '</h3>',
              '      <p className="text-sm text-white/60">' + comp.description + '</p>',
              '    </div>',
              '  )',
              '}',
            );
          }
          files.push({ path: 'src/components/' + comp.name + '.tsx', content });
        }

        // page.tsx (main page)
        const mainComps = pageList[0]?.components || ['Header', 'Hero', 'Features', 'Footer'];
        const importLines = mainComps.map(c => "import " + c + " from '@/components/" + c + "'").join('\n');
        const renderLines = mainComps.map(c => '      <' + c + ' />').join('\n');
        files.push({
          path: 'src/app/page.tsx',
          content: lines(
            importLines,
            '',
            'export default function Home() {',
            '  return (',
            '    <main className="min-h-screen flex flex-col">',
            renderLines,
            '    </main>',
            '  )',
            '}',
          ),
        });

        // package.json
        files.push({
          path: 'package.json',
          content: JSON.stringify({
            name: safeName, version: '0.1.0', private: true,
            scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
            dependencies: Object.fromEntries(deps.map(d => [d, d === 'next' ? '14.0.0' : d === 'react' || d === 'react-dom' ? '^18' : d === 'tailwindcss' ? '^3' : '^1'])),
          }, null, 2),
        });

        // tailwind.config.ts
        files.push({
          path: 'tailwind.config.ts',
          content: lines(
            "import type { Config } from 'tailwindcss'",
            '',
            'const config: Config = {',
            "  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],",
            '  theme: {',
            '    extend: {',
            '      colors: {',
            '        primary: ' + JSON.stringify(colors.primary) + ',',
            '        secondary: ' + JSON.stringify(colors.secondary) + ',',
            '        accent: ' + JSON.stringify(colors.accent) + ',',
            '      },',
            '    },',
            '  },',
            '  plugins: [],',
            '}',
            'export default config',
          ),
        });

        // next.config.js
        files.push({
          path: 'next.config.js',
          content: lines(
            '/** @type {import("next").NextConfig} */',
            'const nextConfig = {',
            '  reactStrictMode: true,',
            '}',
            '',
            'module.exports = nextConfig',
          ),
        });

        console.log('[Brain API] generate-code: generated', files.length, 'files');
        return NextResponse.json({ files });
      }

      case 'generate-preview': {
        const { idea, phases, tasks } = body;
        console.log('[Brain API] generate-preview for:', idea?.substring(0, 50));

        // Build HTML directly from project data (no AI call needed - faster and no crash risk)
        const title = String(idea || 'مشروع');
        const phaseItems = Array.isArray(phases) ? phases : [];
        const featuresList = phaseItems.length > 0
          ? phaseItems.flatMap((p: { name: string; description: string; tasks: { label: string; description: string }[] }) =>
              (p.tasks || []).map((t: { label: string; description: string }) => t.label)
            )
          : ['أداء عالي', 'واجهة سهلة', 'أمان متقدم', 'دعم كامل'];
        const icons = ['🚀','⚡','🔒','🎯','💡','🌟'];
        const description = phaseItems.length > 0
          ? phaseItems.map((p: { name: string; description: string }) => p.name + ': ' + p.description).join('. ')
          : 'مشروع مبتكر يقدم حلولاً ذكية ومتطورة';

        const featureCards = featuresList.slice(0, 6).map((f: string, i: number) =>
          '<div class="feature"><div class="feature-icon">' + (icons[i % 6] || '✨') + '</div><h3>' + f + '</h3><p>' + f + ' عالي الجودة يلبي احتياجاتك</p></div>'
        ).join('');

        const html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + title + '</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif}body{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;min-height:100vh;display:flex;flex-direction:column}header{padding:24px 40px;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.15);backdrop-filter:blur(10px)}header h1{font-size:1.5rem;font-weight:700;letter-spacing:1px}nav a{color:rgba(255,255,255,0.85);text-decoration:none;margin-right:24px;font-size:0.95rem;transition:color .2s}nav a:hover{color:#fff}.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 40px;text-align:center;background:radial-gradient(ellipse at center,rgba(255,255,255,0.08) 0%,transparent 70%)}.hero h2{font-size:3.2rem;margin-bottom:16px;font-weight:800;line-height:1.2}.hero p{font-size:1.25rem;opacity:0.85;max-width:640px;line-height:1.8;margin-bottom:32px}.hero button{padding:14px 40px;font-size:1.1rem;border:none;border-radius:50px;background:#fff;color:#667eea;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 20px rgba(0,0,0,0.2)}.hero button:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.3)}.features{padding:60px 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;max-width:1000px;margin:0 auto}.feature{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:16px;padding:32px 24px;text-align:center;border:1px solid rgba(255,255,255,0.15);transition:transform .2s}.feature:hover{transform:translateY(-4px)}.feature-icon{font-size:2.5rem;margin-bottom:12px}.feature h3{font-size:1.1rem;margin-bottom:8px}.feature p{font-size:0.9rem;opacity:0.8}footer{padding:24px;background:rgba(0,0,0,0.2);text-align:center;font-size:0.9rem;opacity:0.7}@media(max-width:768px){.hero h2{font-size:2rem}.hero p{font-size:1rem}.features{grid-template-columns:1fr 1fr;padding:40px 20px}}</style></head><body><header><h1>' + title + '</h1><nav><a href="#">الرئيسية</a><a href="#">الميزات</a><a href="#">تواصل</a></nav></header><section class="hero"><h2>' + title + '</h2><p>' + description + '</p><button>ابدأ الآن</button></section><section class="features">' + featureCards + '</section><footer>توليد تلقائي بواسطة MindFlow Brain</footer></body></html>';

        return NextResponse.json({ html });
      }

      case 'generate-report': {
        const { idea, phases, tasks } = body;
        console.log('[Brain API] generate-report for:', idea?.substring(0, 50));

        // Build report directly from project data with AI enhancement (fallback if AI fails)
        const phaseItems = Array.isArray(phases) ? phases : [];
        const allTaskLabels = phaseItems.flatMap((p: { tasks: { label: string; description: string }[] }) =>
          (p.tasks || []).map((t: { label: string; description: string }) => t.label)
        );

        const report = {
          executiveSummary: 'مشروع ' + (idea || 'مشروع') + ' هو مشروع مبتكر يهدف إلى تقديم حلول ذكية ومتطورة تلبي احتياجات المستخدمين. يمر المشروع بعدة مراحل أساسية تبدأ من التخطيط والتحليل مروراً بالتصميم والتطوير وصولاً إلى الاختبار والإطلاق. يتميز المشروع ببنيته المرنة وقابليته للتوسع مما يضمن استدامته على المدى الطويل.',
          requirements: allTaskLabels.length > 0
            ? allTaskLabels.slice(0, 6).map((t: string) => t)
            : ['واجهة مستخدم سهلة الاستخدام', 'نظام إدارة متكامل', 'دعم اللغة العربية', 'تصميم متجاوب'],
          techStack: ['Next.js 14', 'React 18', 'TypeScript', 'Tailwind CSS', 'Prisma ORM', 'PostgreSQL'],
          architecture: 'بنية ثلاثية الطبقات: واجهة أمامية (Next.js + React) تعمل على المتصفح، خادم API (Next.js API Routes) يعالج المنطق، وقاعدة بيانات (PostgreSQL) لتخزين البيانات. يتم التواصل بين الطبقات عبر REST API.',
          timeline: phaseItems.length > 0
            ? phaseItems.map((p: { name: string }, i: number) => 'المرحلة ' + (i + 1) + ': ' + p.name + ' (' + (2 + i) + ' أسابيع)').join(' → ')
            : 'المرحلة 1: التخطيط (2 أسابيع) → المرحلة 2: التطوير (4 أسابيع) → المرحلة 3: الاختبار (2 أسابيع) → المرحلة 4: الإطلاق (1 أسبوع)',
          risks: ['تأخر في التطوير بسبب تعقيدات تقنية', 'تغيير المتطلبات أثناء التنفيذ', 'تحديات الأداء مع زيادة عدد المستخدمين'],
          recommendations: ['البدء بنسخة أولية بسيطة (MVP) واختبارها مع المستخدمين', 'اتباع منهجية Agile للتطوير التكراري', 'توثيق الكود وال API بشكل مستمر', 'إعداد بيئة CI/CD للنشر التلقائي'],
        };

        // Try to enhance with AI (optional - if it fails, use the basic report)
        try {
          const systemPrompt = 'أنت مستشار مشاريع. ولّد تقرير JSON فقط. الصيغة:\n{"report":{"executiveSummary":"ملخص","requirements":["r1"],"techStack":["t1"],"architecture":"وصف","timeline":"جدول","risks":["خ1"],"recommendations":["ت1"]}}\nكل شيء بالعربية. كن مختصراً. لا تكتب أي شيء قبل أو بعد JSON.';

          const text = await callAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'المشروع: ' + (idea || 'مشروع') },
          ], 0.3, 30000); // 30s timeout

          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const parsed = JSON.parse(m[0]);
              if (parsed.report) return NextResponse.json({ report: parsed.report });
            } catch {
              const fixed = m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
              try {
                const parsed = JSON.parse(fixed);
                if (parsed.report) return NextResponse.json({ report: parsed.report });
              } catch { /* use fallback */ }
            }
          }
        } catch (err) {
          console.error('[Brain API] generate-report AI failed, using fallback:', err instanceof Error ? err.message : String(err));
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
