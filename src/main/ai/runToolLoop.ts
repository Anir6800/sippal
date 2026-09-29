import type { Content, FunctionCall, Part } from '@google/genai'

const MAX_TOOL_ROUNDS = 6

export interface ModelTurn {
  functionCalls?: FunctionCall[]
  text?: string
  content?: Content
}
export type Generate = (contents: Content[]) => Promise<ModelTurn>

/**
 * Standard function-calling loop: send → execute calls → send function responses → repeat
 * until the model answers with text or we hit MAX_TOOL_ROUNDS.
 */
export async function runToolLoop(
  generate: Generate,
  contents: Content[],
  exec: (name: string, args: unknown) => Record<string, unknown>
): Promise<{ text: string; calls: { name: string; args: unknown; result: unknown }[] }> {
  const calls: { name: string; args: unknown; result: unknown }[] = []
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await generate(contents)
    if (!turn.functionCalls?.length) return { text: turn.text?.trim() || 'Done! ✅', calls }
    // Echo the model's own content back unchanged: Gemini 3 needs its thought signatures.
    contents.push(turn.content ?? { role: 'model', parts: turn.functionCalls.map((functionCall) => ({ functionCall })) })
    const parts: Part[] = turn.functionCalls.map((fc) => {
      const result = exec(fc.name ?? '', fc.args)
      calls.push({ name: fc.name ?? '', args: fc.args, result })
      return { functionResponse: { id: fc.id, name: fc.name, response: result } }
    })
    contents.push({ role: 'user', parts })
  }
  return { text: "Sorry, I got a bit tangled up there. Could you rephrase? 🌀", calls }
}
