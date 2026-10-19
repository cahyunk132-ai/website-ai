/**
 * Hyunk AI Hub - Conversation Title Generator
 * Shared between the API routes and the chat pipeline so auto-created
 * conversations receive the same concise, human readable title.
 */

const LEADING_NOISE = [
  'can you',
  'could you',
  'please',
  'tell me about',
  'how to',
  'how do i',
  'what is',
  'what are',
  'explain',
  'write a',
  'build a',
  'create a',
  'make a',
];

/**
 * Turns a raw user prompt into a short 3-6 word conversation title.
 */
export function buildConversationTitle(prompt: string): string {
  if (!prompt || !prompt.trim()) return 'New Chat';

  let title = prompt
    .replace(/^[\s#*>"'-]+/, '')
    .replace(new RegExp(`^(${LEADING_NOISE.join('|')})\\s+`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) return 'New Chat';

  const words = title.split(' ').slice(0, 5);
  title = words.join(' ');

  if (title.length > 40) {
    title = title.slice(0, 40).trimEnd() + '...';
  }

  return title.charAt(0).toUpperCase() + title.slice(1);
}
