/** Validate a non-streaming Chat Completions response before it can become stored content. */
export async function readCompletion(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`接口请求失败（HTTP ${response.status}）`);
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error('接口返回的内容不是有效的 JSON'); }
  if (!value || typeof value !== 'object') throw new Error('接口返回格式无效');
  const body = value as Record<string, unknown>;
  if (body.error != null) throw new Error('接口返回了错误，请检查服务状态');
  if (!Array.isArray(body.choices) || !body.choices.length || !body.choices[0] || typeof body.choices[0] !== 'object') throw new Error('接口没有返回有效的回复选项');
  const choice = body.choices[0] as Record<string, unknown>;
  const reason = choice.finish_reason;
  if (typeof reason !== 'string' || !['stop', 'STOP'].includes(reason)) {
    const diagnostic = typeof reason === 'string' && /^[\w-]{1,40}$/.test(reason) ? reason : '未提供';
    throw new Error(`生成未正常结束（原因：${diagnostic}），请检查服务或重试`);
  }
  if (!choice.message || typeof choice.message !== 'object') throw new Error('接口没有返回有效的消息');
  const message = choice.message as Record<string, unknown>;
  if (message.role !== 'assistant') throw new Error('接口返回了非角色回复');
  if (message.refusal || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length)) || message.function_call) throw new Error('接口返回了拒绝或工具调用，未生成聊天正文');
  if (typeof message.content !== 'string' || !message.content.trim()) throw new Error('接口没有返回有效正文');
  return message.content.trim();
}
