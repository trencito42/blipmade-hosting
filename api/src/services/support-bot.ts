import { z } from 'zod';
import DOCS from '../data/docs-index.json' with { type: 'json' };

/**
 * The engine of the support bots.
 *
 * A bot is data: a flow of blocks that the operator edits. The code only runs it, and it runs nothing that the flow
 * carries as code: a block is one of the kinds below, its text is shown as plain text, and a variable is a short string
 * named by the flow. Three limits keep a flow from running away: a flow with a loop that never waits for the customer
 * cannot be saved, one turn runs at most MAX_STEPS_PER_TURN blocks, and one conversation at most MAX_STEPS_PER_SESSION;
 * past a limit the customer is handed to a person.
 */

export const MAX_NODES = 60;
export const MAX_STEPS_PER_TURN = 50;
export const MAX_STEPS_PER_SESSION = 200;
const MAX_TEXT = 1000;

const id = z.string().regex(/^[a-z0-9_-]{1,32}$/, 'An id has lower case letters, digits, dashes and underscores, up to 32.');
const variable = z
  .string()
  .regex(/^[a-z_][a-z0-9_]{0,30}$/, 'A variable name has lower case letters, digits and underscores, and does not start with a digit.')
  .refine((name) => !['__proto__', 'constructor', 'prototype'].includes(name), 'That name is reserved.');
const text = z.string().trim().min(1).max(MAX_TEXT);
const next = id.optional();

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export const nodeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), text, next }),
  z.object({ type: z.literal('buttons'), text, options: z.array(z.object({ id, label: z.string().trim().min(1).max(60), next: id })).min(1).max(8) }),
  z.object({ type: z.literal('ask_text'), text, variable, next }),
  z.object({ type: z.literal('ask_email'), text, variable, next }),
  z.object({ type: z.literal('ask_service'), text, variable, next }),
  z.object({
    type: z.literal('branch'),
    variable,
    cases: z.array(z.object({ equals: z.string().max(200).optional(), contains: z.string().max(200).optional(), next: id }).refine((c) => (c.equals === undefined) !== (c.contains === undefined), 'A case has either "equals" or "contains".')).min(1).max(12),
    else: next,
  }),
  z.object({ type: z.literal('search_kb'), query: text, next, empty: next }),
  z.object({ type: z.literal('ai_answer'), query: text, next }),
  z.object({ type: z.literal('suggest_article'), article: z.string().min(1).max(80), next }),
  z.object({ type: z.literal('create_ticket'), subject: text, next }),
  z.object({ type: z.literal('set_priority'), priority: z.enum(PRIORITIES), next }),
  z.object({ type: z.literal('assign_department'), departmentId: z.string().min(1).max(40), next }),
  z.object({ type: z.literal('transfer'), departmentId: z.string().min(1).max(40).optional(), text: text.optional() }),
  z.object({ type: z.literal('end'), text: text.optional() }),
]);

export const flowSchema = z.object({
  start: id,
  welcome: z.string().trim().max(MAX_TEXT).optional(),
  /** How the bot introduces itself in the chat: the name and a picture. Shown at the top of the chat. */
  persona: z.object({ name: z.string().trim().max(40).optional(), avatarUrl: z.string().trim().max(60_000).refine((value) => value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), 'The picture must be a small uploaded image.').optional() }).optional(),
  /** Where the editor drew each block. Only the editor reads it; it has no effect on how the bot runs. */
  layout: z.record(id, z.object({ x: z.number().min(-10_000).max(10_000), y: z.number().min(-10_000).max(10_000) })).optional(),
  nodes: z.record(id, nodeSchema).refine((nodes) => Object.keys(nodes).length <= MAX_NODES, `A flow has at most ${MAX_NODES} blocks.`),
});

export type Node = z.infer<typeof nodeSchema>;
export type Flow = z.infer<typeof flowSchema>;

const WAITING = new Set(['buttons', 'ask_text', 'ask_email', 'ask_service']);
const FINAL = new Set(['end', 'transfer']);

function edges(node: Node): string[] {
  switch (node.type) {
    case 'buttons':
      return node.options.map((option) => option.next);
    case 'branch':
      return [...node.cases.map((c) => c.next), ...(node.else ? [node.else] : [])];
    case 'search_kb':
      return [node.next, node.empty].filter((value): value is string => Boolean(value));
    case 'end':
    case 'transfer':
      return [];
    default:
      return node.next ? [node.next] : [];
  }
}

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  flow?: Flow;
}

/** Everything that makes a flow unsafe to publish. Errors block the publication; warnings only say what looks wrong. */
export function validateFlow(input: unknown): Validation {
  const parsed = flowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'flow'}: ${issue.message}`), warnings: [] };
  }
  const flow = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(Object.keys(flow.nodes));
  if (!ids.has(flow.start)) errors.push(`start: the block "${flow.start}" does not exist.`);

  for (const [key, node] of Object.entries(flow.nodes)) {
    for (const target of edges(node)) if (!ids.has(target)) errors.push(`${key}: leads to "${target}", which does not exist.`);
    if (node.type === 'buttons') {
      const seen = new Set<string>();
      for (const option of node.options) {
        if (seen.has(option.id)) errors.push(`${key}: two buttons share the id "${option.id}".`);
        seen.add(option.id);
      }
    }
    if (!FINAL.has(node.type) && node.type !== 'branch' && node.type !== 'buttons' && !('next' in node && node.next)) {
      warnings.push(`${key}: has no next block, so the conversation ends here.`);
    }
  }

  // A loop that never waits for the customer would run until the limit: refuse it while the flow is saved.
  const color = new Map<string, 1 | 2>();
  const visit = (key: string, path: string[]): void => {
    const node = flow.nodes[key];
    if (!node || WAITING.has(node.type)) return;
    if (color.get(key) === 2) return;
    if (color.get(key) === 1) {
      errors.push(`loop without a question: ${[...path.slice(path.indexOf(key)), key].join(' → ')}. A loop must ask the customer something.`);
      return;
    }
    color.set(key, 1);
    for (const target of edges(node)) visit(target, [...path, key]);
    color.set(key, 2);
  };
  if (ids.has(flow.start)) for (const key of ids) visit(key, []);

  // Blocks that cannot be reached.
  const reached = new Set<string>();
  const walk = (key: string) => {
    if (reached.has(key) || !flow.nodes[key]) return;
    reached.add(key);
    for (const target of edges(flow.nodes[key]!)) walk(target);
  };
  walk(flow.start);
  for (const key of ids) if (!reached.has(key)) warnings.push(`${key}: cannot be reached from the start.`);

  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings, flow };
}

// --- running ----------------------------------------------------------------

export type Out =
  | { kind: 'text'; text: string; ai?: boolean }
  | { kind: 'buttons'; text: string; options: { id: string; label: string }[] }
  | { kind: 'ask'; text: string; input: 'text' | 'email' | 'service'; options?: { id: string; label: string }[] }
  | { kind: 'articles'; articles: { title: string; url: string; summary: string }[] }
  /** Questions the customer may want to ask next, about the same topic. Shown as buttons that send the question. */
  | { kind: 'suggestions'; items: string[] };

export interface BotSession {
  /** The block that waits for the customer. Null when the flow is over. */
  node: string | null;
  variables: Record<string, string>;
  steps: number;
  state: 'ACTIVE' | 'HANDED_OFF' | 'ENDED';
}

/** What a flow may ask the platform to do. The route that runs the engine decides how, and checks every one of them. */
export interface Hooks {
  services(): Promise<{ id: string; name: string }[]>;
  createTicket(subject: string, variables: Record<string, string>): Promise<{ number: number }>;
  transfer(departmentId: string | undefined, variables: Record<string, string>): Promise<{ mode: 'chat' | 'ticket'; number: number }>;
  setPriority(priority: (typeof PRIORITIES)[number]): Promise<void>;
  assignDepartment(departmentId: string): Promise<boolean>;
  /** An answer of the assistant to a question, from the public documentation. Null when there is none: the flow then goes on without it. */
  answer?(question: string): Promise<{ text: string; handoff: boolean; followups?: string[] } | null>;
  /** Where the documentation is searched, when it is more than the public pages (the notes the operator marked for customers). */
  search?(query: string): Promise<Article[]>;
  /** True when the assistant can answer customers: the buttons that only lead to a person are then shown on the first menu only. */
  ai?: boolean;
}

export interface Article {
  title: string;
  url: string;
  summary: string;
  /** The start of the text of the page, for a model to answer from. */
  text?: string;
}

/** The published documentation that matches the words, best first. Only the public documentation: never the notes of the team. */
export interface DocItem {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  url: string;
  text?: string;
}

/** Words that say nothing about a topic: they never make a page match on their own. */
const STOP = new Set(['the', 'and', 'for', 'are', 'you', 'there', 'hello', 'hi', 'hey', 'please', 'help', 'with', 'have', 'has', 'not', 'cant', 'can', 'does', 'doesnt', 'did', 'how', 'what', 'why', 'when', 'where', 'who', 'this', 'that', 'it', 'its', 'my', 'me', 'our', 'your', 'from', 'but', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should', 'about', 'any', 'some', 'get', 'got', 'need', 'want', 'like', 'just', 'now', 'today', 'problem', 'issue', 'working', 'work', 'works', 'thanks', 'thank']);
/** Words that name the product itself: real, but too common to decide a page alone. */
const COMMON = new Set(['server', 'servers', 'service', 'services', 'app', 'apps', 'site', 'account', 'hosting', 'blipmade']);

/**
 * The published documentation that matches the words, best first. Only the public documentation: never the notes of the
 * team. A page needs a real match: a word of its title or of its keywords, or several words of its summary. A word that only
 * names the product ("server") is not enough alone, so "my server is not reachable" does not list every page about a server.
 */
export function searchDocs(query: string, limit = 3, extra: DocItem[] = []): Article[] {
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP.has(word)))];
  if (words.length === 0) return [];
  return [...(DOCS as DocItem[]), ...extra]
    .map((page) => {
      const body = (page.text ?? '').toLowerCase();
      const title = page.title.toLowerCase();
      const summary = page.summary.toLowerCase();
      const keywords = page.keywords.join(' ').toLowerCase();
      let score = 0;
      let decisive = false;
      for (const word of words) {
        const weight = COMMON.has(word) ? 0.5 : 1;
        const hit = (title.includes(word) ? 5 : 0) + (keywords.includes(word) ? 3 : 0) + (summary.includes(word) ? 1 : 0) + (body.includes(word) ? 0.5 : 0);
        score += hit * weight;
        // A word found only in the body of a page helps to rank it; it does not make it a match.
        if (hit >= 1 && !COMMON.has(word)) decisive = true;
      }
      // A page must match on a word that is about a topic, not only on the name of the product.
      return { page, score: decisive ? score : 0 };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page }) => ({ title: page.title, url: page.url, summary: page.summary, text: page.text }));
}

export function articleById(idOrUrl: string): Article | null {
  const page = (DOCS as { id: string; title: string; summary: string; url: string }[]).find((entry) => entry.id === idOrUrl);
  return page ? { title: page.title, url: page.url, summary: page.summary } : null;
}

/** `{{name}}` is replaced by the value of the variable. Nothing else is interpreted, and the result is shown as plain text. */
export function render(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_][a-z0-9_]{0,30})\s*\}\}/g, (_match, name: string) => (Object.hasOwn(variables, name) ? variables[name]! : ''));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface Input {
  text?: string;
  option?: string;
}

export interface StepResult {
  session: BotSession;
  out: Out[];
}

function handOver(session: BotSession, out: Out[], reason: string): StepResult {
  out.push({ kind: 'text', text: reason });
  return { session: { ...session, state: 'HANDED_OFF', node: null }, out };
}

/** The buttons to show. With the assistant on, a button that only leads to a person is kept on the first menu and left out later: the assistant answers, and hands over by itself when it cannot. */
function visibleOptions(flow: Flow, key: string, options: { id: string; label: string; next: string }[], hooks: Hooks): { id: string; label: string }[] {
  const keep = hooks.ai && key !== flow.start ? options.filter((option) => flow.nodes[option.next]?.type !== 'transfer') : options;
  return (keep.length > 0 ? keep : options).map(({ id: optionId, label }) => ({ id: optionId, label }));
}

/** What the bot is waiting for now: the question or the buttons of the block the conversation stopped at. */
export async function promptFor(flow: Flow, session: BotSession, hooks: Hooks): Promise<Out | null> {
  const node = session.node ? flow.nodes[session.node] : undefined;
  if (!node || session.state !== 'ACTIVE') return null;
  switch (node.type) {
    case 'buttons':
      return { kind: 'buttons', text: render(node.text, session.variables), options: visibleOptions(flow, session.node!, node.options, hooks) };
    case 'ask_text':
      return { kind: 'ask', text: render(node.text, session.variables), input: 'text' };
    case 'ask_email':
      return { kind: 'ask', text: render(node.text, session.variables), input: 'email' };
    case 'ask_service': {
      const services = await hooks.services();
      return { kind: 'ask', text: render(node.text, session.variables), input: 'service', options: services.map((service) => ({ id: service.id, label: service.name })) };
    }
    default:
      return null;
  }
}

/** The assistant could not answer, or the customer asked for a person: the conversation goes to a person (a chat, or a ticket when nobody is online). */
async function handoffTo(session: BotSession, out: Out[], hooks: Hooks): Promise<StepResult> {
  const result = await hooks.transfer(undefined, session.variables);
  session.variables.ticket_number = String(result.number);
  return handOver(session, out, result.mode === 'chat' ? 'I will connect you to a person of the team. They will answer here.' : 'I cannot help with that here, and nobody is online right now. Your conversation is saved as a ticket and a person will answer it.');
}

/** Starts a conversation at the first block of the flow. */
export async function startFlow(flow: Flow, hooks: Hooks): Promise<StepResult> {
  const out: Out[] = [];
  if (flow.welcome) out.push({ kind: 'text', text: flow.welcome });
  return run(flow, { node: flow.start, variables: {}, steps: 0, state: 'ACTIVE' }, out, hooks);
}

/** Takes what the customer wrote or picked, and goes on until the flow waits again or ends. */
export async function advance(flow: Flow, current: BotSession, input: Input, hooks: Hooks): Promise<StepResult> {
  if (current.state !== 'ACTIVE' || !current.node) return { session: current, out: [] };
  const node = flow.nodes[current.node];
  const session: BotSession = { ...current, variables: { ...current.variables } };
  const out: Out[] = [];
  if (!node) return handOver(session, out, 'Something went wrong with this conversation. A person will take over.');

  const raw = (input.text ?? '').trim().slice(0, MAX_TEXT);
  switch (node.type) {
    case 'buttons': {
      const chosen = node.options.find((option) => option.id === input.option) ?? node.options.find((option) => option.label.toLowerCase() === raw.toLowerCase());
      if (!chosen) {
        // Words that are not a choice: the assistant may answer them. When it cannot, or the customer asks for a person, the
        // conversation goes to a person; the choices are shown again after an answer.
        const answered = raw && hooks.answer ? await hooks.answer(raw) : null;
        if (answered?.handoff) return handoffTo(session, out, hooks);
        out.push(answered ? { kind: 'text', text: answered.text, ai: true } : { kind: 'text', text: 'Please choose one of the options.' });
        if (answered?.followups?.length) out.push({ kind: 'suggestions', items: answered.followups });
        out.push({ kind: 'buttons', text: render(node.text, session.variables), options: visibleOptions(flow, current.node!, node.options, hooks) });
        return { session, out };
      }
      session.node = chosen.next;
      break;
    }
    case 'ask_text': {
      if (!raw) {
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'text' });
        return { session, out };
      }
      session.variables[node.variable] = raw;
      session.node = node.next ?? null;
      break;
    }
    case 'ask_email': {
      if (!EMAIL.test(raw)) {
        out.push({ kind: 'text', text: 'That does not look like an email address.' });
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'email' });
        return { session, out };
      }
      session.variables[node.variable] = raw;
      session.node = node.next ?? null;
      break;
    }
    case 'ask_service': {
      const services = await hooks.services();
      const chosen = services.find((service) => service.id === input.option);
      if (!chosen) {
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'service', options: services.map((service) => ({ id: service.id, label: service.name })) });
        return { session, out };
      }
      session.variables[node.variable] = chosen.id;
      session.variables[`${node.variable}_name`] = chosen.name;
      session.node = node.next ?? null;
      break;
    }
    default:
      break;
  }
  return run(flow, session, out, hooks);
}

async function run(flow: Flow, start: BotSession, out: Out[], hooks: Hooks): Promise<StepResult> {
  const session: BotSession = { ...start, variables: { ...start.variables } };
  let turn = 0;
  while (session.node) {
    if (turn >= MAX_STEPS_PER_TURN || session.steps >= MAX_STEPS_PER_SESSION) {
      const transfer = await hooks.transfer(undefined, session.variables);
      return handOver(session, out, transfer.mode === 'chat' ? 'This is taking too many steps. A person will take over here.' : 'This is taking too many steps. Your message is saved as a ticket and a person will answer.');
    }
    const key = session.node;
    const node = flow.nodes[key];
    if (!node) return handOver(session, out, 'Something went wrong with this conversation. A person will take over.');
    turn += 1;
    session.steps += 1;
    const go = (target: string | undefined) => {
      session.node = target ?? null;
    };
    switch (node.type) {
      case 'message':
        out.push({ kind: 'text', text: render(node.text, session.variables) });
        go(node.next);
        break;
      case 'buttons':
        out.push({ kind: 'buttons', text: render(node.text, session.variables), options: visibleOptions(flow, key, node.options, hooks) });
        return { session, out };
      case 'ask_text':
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'text' });
        return { session, out };
      case 'ask_email':
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'email' });
        return { session, out };
      case 'ask_service': {
        const services = await hooks.services();
        out.push({ kind: 'ask', text: render(node.text, session.variables), input: 'service', options: services.map((service) => ({ id: service.id, label: service.name })) });
        return { session, out };
      }
      case 'branch': {
        const value = (Object.hasOwn(session.variables, node.variable) ? session.variables[node.variable]! : '').toLowerCase();
        const hit = node.cases.find((c) => (c.equals !== undefined ? value === c.equals.toLowerCase() : value.includes((c.contains ?? '').toLowerCase())));
        go(hit?.next ?? node.else);
        break;
      }
      case 'search_kb': {
        const found = hooks.search ? await hooks.search(render(node.query, session.variables)) : searchDocs(render(node.query, session.variables));
        if (found.length > 0) {
          out.push({ kind: 'articles', articles: found });
          go(node.next);
        } else {
          go(node.empty ?? node.next);
        }
        break;
      }
      case 'ai_answer': {
        const question = render(node.query, session.variables);
        const answered = hooks.answer && question.trim() ? await hooks.answer(question) : null;
        if (answered?.handoff) return handoffTo(session, out, hooks);
        if (answered) out.push({ kind: 'text', text: answered.text, ai: true });
        if (answered?.followups?.length) out.push({ kind: 'suggestions', items: answered.followups });
        go(node.next);
        break;
      }
      case 'suggest_article': {
        const article = articleById(node.article);
        if (article) out.push({ kind: 'articles', articles: [article] });
        go(node.next);
        break;
      }
      case 'create_ticket': {
        const ticket = await hooks.createTicket(render(node.subject, session.variables), session.variables);
        session.variables.ticket_number = String(ticket.number);
        go(node.next);
        break;
      }
      case 'set_priority':
        await hooks.setPriority(node.priority);
        go(node.next);
        break;
      case 'assign_department': {
        const done = await hooks.assignDepartment(node.departmentId);
        if (!done) return handOver(session, out, 'This conversation could not be sorted. A person will take over.');
        go(node.next);
        break;
      }
      case 'transfer': {
        const result = await hooks.transfer(node.departmentId, session.variables);
        session.variables.ticket_number = String(result.number);
        const line = node.text ? render(node.text, session.variables) : result.mode === 'chat' ? 'A person of the team is joining this chat.' : 'Nobody is online right now. Your conversation is saved as a ticket and a person will answer it.';
        return handOver(session, out, line);
      }
      case 'end':
        if (node.text) out.push({ kind: 'text', text: render(node.text, session.variables) });
        return { session: { ...session, state: 'ENDED', node: null }, out };
    }
  }
  return { session: { ...session, state: 'ENDED', node: null }, out };
}

/** The template that a new bot starts from. It is only a draft: the operator edits every line of it. */
export function templateFlow(): Flow {
  return {
    start: 'menu',
    welcome: 'Hello! How can we help?',
    nodes: {
      menu: {
        type: 'buttons',
        text: 'What do you need?',
        options: [
          { id: 'technical', label: 'Technical issue', next: 'tech_ask' },
          { id: 'billing', label: 'Billing', next: 'billing_info' },
          { id: 'account', label: 'Account', next: 'account_info' },
          { id: 'plans', label: 'Hosting plans', next: 'plans_info' },
          { id: 'agent', label: 'Talk to an agent', next: 'human' },
        ],
      },
      tech_ask: { type: 'ask_service', text: 'Which service is it about?', variable: 'service', next: 'tech_problem' },
      tech_problem: { type: 'ask_text', text: 'What is the problem? A sentence is enough.', variable: 'problem', next: 'tech_search' },
      tech_search: { type: 'search_kb', query: '{{problem}}', next: 'tech_ai', empty: 'tech_ai' },
      // Answers from the documentation when the operator has switched the assistant on for customers; otherwise the flow goes on.
      tech_ai: { type: 'ai_answer', query: '{{problem}}', next: 'tech_check' },
      tech_check: { type: 'message', text: 'First steps that fix most problems: restart the service from its page, read the last lines of the console, and check that the disk is not full.', next: 'tech_next' },
      tech_next: {
        type: 'buttons',
        text: 'Did that help?',
        options: [
          { id: 'solved', label: 'Yes, thanks', next: 'bye' },
          { id: 'ticket', label: 'Not yet, open a ticket', next: 'ticket' },
          { id: 'human', label: 'Talk to an agent', next: 'human' },
        ],
      },
      billing_info: { type: 'message', text: 'Invoices, payment methods and your plan are under Billing in the menu. A refund or a dispute is decided by a person.', next: 'billing_next' },
      billing_next: {
        type: 'buttons',
        text: 'Do you want a person to look at it?',
        options: [
          { id: 'human', label: 'Talk to an agent', next: 'human' },
          { id: 'bye', label: 'No, thanks', next: 'bye' },
        ],
      },
      account_info: { type: 'search_kb', query: 'account security sign in password', next: 'account_next', empty: 'account_next' },
      account_next: { type: 'message', text: 'We never ask for your password, recovery codes or keys, in the chat or anywhere else.', next: 'account_choice' },
      account_choice: {
        type: 'buttons',
        text: 'Anything else?',
        options: [
          { id: 'human', label: 'Talk to an agent', next: 'human' },
          { id: 'bye', label: 'That is all', next: 'bye' },
        ],
      },
      plans_info: { type: 'message', text: 'The plans and their prices are in the catalog, under Deploy.', next: 'account_choice' },
      ticket: { type: 'create_ticket', subject: 'From the chat: {{problem}}', next: 'ticket_done' },
      ticket_done: { type: 'end', text: 'Your ticket number is {{ticket_number}}. You can follow it in Support.' },
      human: { type: 'transfer' },
      bye: { type: 'end', text: 'Glad to help. Write again if you need us.' },
    },
  };
}
