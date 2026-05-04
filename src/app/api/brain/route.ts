import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, nodes, nodeLabel, nodeTag, nodeSummary, brainKnowledge } = body;

    const zai = await ZAI.create();

    switch (action) {
      case 'summarize': {
        // Generate a smart summary of the entire knowledge network
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean; label?: string; tag?: string; summary?: string }) => !n.isBrain)
          .map((n: { label: string; tag: string; summary: string }) => `${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت عقل معرفي ذكي. قدم تحليلاً مختصراً وعميقاً بالعربية للشبكة المعرفية التالية. اكتب ملخصاً من 3-4 جمل يربط بين المواضيع المختلفة ويكشف أنماطاً خفية. ثم اطرح سؤالين مثيرين للتفكير يربطان بين مواضيع مختلفة في الشبكة.',
            },
            {
              role: 'user',
              content: `شبكة معرفية تحوي ${nodes.length} عقدة بمستوى معرفة ${brainKnowledge}:\n${nodeDescriptions}`,
            },
          ],
          temperature: 0.7,
        });

        const responseText = completion.choices[0]?.message?.content || '';
        const parts = responseText.split('سؤال');
        const summary = parts[0]?.trim() || '';
        const questions = [];
        if (parts.length > 1) {
          questions.push(...parts.slice(1).map(q => 'سؤال' + q.trim()).filter(q => q.length > 5));
        }
        if (questions.length === 0) {
          questions.push('كيف ترتبط هذه المواضيع ببعضها البعض؟');
          questions.push('ما هو المفهوم المشترك الخفي بين هذه العقد؟');
        }

        return NextResponse.json({ summary, questions: questions.slice(0, 3) });
      }

      case 'suggest-links': {
        // Suggest hidden connections between nodes
        const nodeList = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { id: string; label: string; tag: string; summary: string }) => `ID:${n.id} | ${n.label} (${n.tag}): ${n.summary}`)
          .join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت محلل شبكات معرفية. بناءً على العقد التالية، اقترح 3 روابط خفية بين عقد لا تبدو مرتبطة ظاهرياً. لكل رابط، اكتب: from_id, to_id, reason. أجب بصيغة JSON فقط: {"links":[{"from":"id","to":"id","reason":"السبب"}]}',
            },
            {
              role: 'user',
              content: nodeList,
            },
          ],
          temperature: 0.8,
        });

        let links = [];
        try {
          const text = completion.choices[0]?.message?.content || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            links = parsed.links || [];
          }
        } catch {}

        return NextResponse.json({ suggestedLinks: links });
      }

      case 'generate-nodes': {
        // Generate new sub-nodes for a topic
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت مولد معرفة. بناءً على الموضوع التالي، اقترح 4 عقد فرعية جديدة مفيدة ومثيرة. لكل عقدة اكتب: label, tag, summary. أجب بصيغة JSON فقط: {"nodes":[{"label":"الاسم","tag":"التصنيف","summary":"الوصف"}]}',
            },
            {
              role: 'user',
              content: `الموضوع: ${nodeLabel} (${nodeTag})\nالوصف: ${nodeSummary}`,
            },
          ],
          temperature: 0.8,
        });

        let newNodes = [];
        try {
          const text = completion.choices[0]?.message?.content || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            newNodes = parsed.nodes || [];
          }
        } catch {}

        return NextResponse.json({ suggestedNodes: newNodes });
      }

      case 'ask': {
        // Answer a question about the knowledge network
        const nodeDescriptions = nodes
          .filter((n: { isBrain?: boolean }) => !n.isBrain)
          .map((n: { label: string; summary: string }) => `${n.label}: ${n.summary}`)
          .join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت عقل معرفي ذكي. أجب على السؤال التالي بناءً على المعرفة المتاحة في الشبكة. كن مختصراً (3-4 جمل) وعميقاً.',
            },
            {
              role: 'user',
              content: `المعرفة المتاحة:\n${nodeDescriptions}\n\nالسؤال: ${body.question}`,
            },
          ],
          temperature: 0.6,
        });

        const answer = completion.choices[0]?.message?.content || '';
        return NextResponse.json({ answer });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Brain API error:', error);
    return NextResponse.json(
      { error: 'Failed to process AI request', summary: '', questions: [] },
      { status: 500 }
    );
  }
}
