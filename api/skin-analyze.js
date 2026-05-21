export const config = {
  api: { bodyParser: { sizeLimit: '20mb' }, maxDuration: 10 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub Token 未配置' });
  }
  try {
    // 压缩图片 base64，超过限制就缩小
    const messages = req.body.messages.map(msg => {
      if (!Array.isArray(msg.content)) return msg;
      return {
        ...msg,
        content: msg.content.map(part => {
          if (part.type === 'image_url') return part;
          if (part.type === 'image' && part.source?.data) {
            // 截断过长的 base64（压缩到约 180KB）
            const data = part.source.data;
            const maxLen = 240000;
            return {
              type: 'image_url',
              image_url: {
                url: `data:${part.source.media_type};base64,${data.length > maxLen ? data.substring(0, maxLen) : data}`,
                detail: 'low'  // 用低分辨率，速度快且省 token
              }
            };
          }
          return part;
        })
      };
    });

    const response = await fetch(
      'https://models.inference.ai.azure.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 800,
          messages
        })
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || JSON.stringify(data)
      });
    }
    const text = data.choices?.[0]?.message?.content || '';
    res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
