import en from "../../src/messages/en.json";
import es from "../../src/messages/es.json";
import de from "../../src/messages/de.json";
import tr from "../../src/messages/tr.json";

/**
 * `next-intl/server` under Node.
 *
 * The real module is published behind the `react-server` export condition. Vitest resolves the
 * browser build instead, which throws "`getTranslations` is not supported in Client Components"
 * the moment a server action asks for a translator — so every test that calls such an action
 * fails for a reason that has nothing to do with what it is testing.
 *
 * This resolves against the real message files, so a test still asserts the copy a customer
 * would read, and a key that does not exist still shows up as a wrong-looking string rather
 * than passing silently.
 */
const TREES: Record<string, unknown> = { en, es, de, tr };

function lookup(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
}

function format(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

type TranslatorOptions = string | { locale?: string; namespace?: string };

export async function getTranslations(options?: TranslatorOptions) {
  const namespace = typeof options === "string" ? options : options?.namespace;
  const locale = typeof options === "string" ? "en" : (options?.locale ?? "en");
  const tree = TREES[locale] ?? en;

  const translate = (key: string, values?: Record<string, unknown>) => {
    const full = namespace ? `${namespace}.${key}` : key;
    const value = lookup(tree, full);
    return typeof value === "string" ? format(value, values) : full;
  };

  return Object.assign(translate, {
    raw: (key: string) => lookup(tree, namespace ? `${namespace}.${key}` : key),
    rich: translate,
    markup: translate,
    has: (key: string) => lookup(tree, namespace ? `${namespace}.${key}` : key) !== undefined,
  });
}

export async function getLocale() {
  return "en";
}

export async function getMessages() {
  return en;
}

export function setRequestLocale() {
  // The real one records the locale for the request; nothing reads it here.
}
