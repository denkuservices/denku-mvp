"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { translateDashboardCopy } from "@/i18n/dashboardRuntime";

type DashboardLocaleContextValue = {
  locale: Locale;
  translate: (english: string) => string;
};

const DashboardLocaleContext = createContext<DashboardLocaleContextValue | null>(null);

const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;
const SKIPPED_TAGS = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA"]);

function normalizeCopy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shouldSkip(node: Node): boolean {
  const parent = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!parent) return true;
  if (SKIPPED_TAGS.has(parent.tagName)) return true;
  return Boolean(
    parent.closest(
      '[data-dashboard-no-translate="true"], [contenteditable="true"], [data-dashboard-user-content="true"]',
    ),
  );
}

function translateTextNode(
  node: Text,
  dictionary: Readonly<Record<string, string>>,
  locale: Locale,
) {
  if (shouldSkip(node)) return;
  const raw = node.data;
  const source = normalizeCopy(raw);
  if (!source) return;
  const translated = translateDashboardCopy(source, dictionary, locale);
  if (!translated || translated === source) return;

  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  node.data = `${leading}${translated}${trailing}`;
}

function translateAttributes(
  element: Element,
  dictionary: Readonly<Record<string, string>>,
  locale: Locale,
) {
  if (shouldSkip(element)) return;

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const raw = element.getAttribute(attribute);
    if (!raw) continue;
    const translated = translateDashboardCopy(raw, dictionary, locale);
    if (translated !== raw) element.setAttribute(attribute, translated);
  }
}

function translateLeafElement(
  element: Element,
  dictionary: Readonly<Record<string, string>>,
  locale: Locale,
): boolean {
  if (shouldSkip(element) || element.childElementCount > 0) return false;
  const raw = element.textContent ?? "";
  const source = normalizeCopy(raw);
  if (!source) return false;
  const translated = translateDashboardCopy(source, dictionary, locale);
  if (!translated || translated === source) return false;

  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  element.textContent = `${leading}${translated}${trailing}`;
  return true;
}

function translateElement(
  element: Element,
  dictionary: Readonly<Record<string, string>>,
  locale: Locale,
) {
  if (shouldSkip(element)) return;

  translateAttributes(element, dictionary, locale);
  if (translateLeafElement(element, dictionary, locale)) return;

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current as Text, dictionary, locale);
    } else {
      translateAttributes(current as Element, dictionary, locale);
      translateLeafElement(current as Element, dictionary, locale);
    }
    current = walker.nextNode();
  }
}

/**
 * Locale boundary for the authenticated product.
 *
 * The marketing site was born on next-intl, while the older authenticated tree contains literal
 * English in many server and client components. The observer is intentionally exact-match only:
 * it localises known interface copy (including late dialogs, popovers and toasts), but never
 * guesses at customer names, conversation bodies or other workspace data.
 */
export function DashboardLocaleProvider({
  children,
  locale,
  dictionary,
}: {
  children: ReactNode;
  locale: Locale;
  dictionary: Readonly<Record<string, string>>;
}) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard") ?? false;

  const translate = useCallback(
    (english: string) => translateDashboardCopy(english, dictionary, locale),
    [dictionary, locale],
  );

  const contextValue = useMemo(
    () => ({ locale, translate }),
    [locale, translate],
  );

  useEffect(() => {
    if (!isDashboard) return;
    document.documentElement.lang = locale;
    if (locale === "en" || Object.keys(dictionary).length === 0) return;

    /*
     * App Router can stream an async Server Component after this provider has hydrated. A
     * MutationObserver fires in the microtask immediately after React inserts that HTML — before
     * React necessarily hydrates the newly streamed subtree. Mutating copy in that microtask
     * changes the server HTML underneath React and produces a hydration mismatch.
     *
     * Batch translations into the next animation frame instead. React completes the current
     * commit/hydration work first, then this compatibility layer updates the settled DOM. Explicitly
     * localised client controls opt out of this observer and continue to render from context.
     */
    const pendingNodes = new Set<Node>();
    let animationFrame: number | null = null;

    function flushTranslations() {
      animationFrame = null;
      const nodes = [...pendingNodes];
      pendingNodes.clear();

      for (const node of nodes) {
        if (!document.contains(node)) continue;
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node as Text, dictionary, locale);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateElement(node as Element, dictionary, locale);
        }
      }
    }

    function scheduleTranslation(node: Node) {
      pendingNodes.add(node);
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(flushTranslations);
      }
    }

    scheduleTranslation(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          scheduleTranslation(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          scheduleTranslation(node);
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          scheduleTranslation(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      pendingNodes.clear();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [dictionary, isDashboard, locale]);

  return (
    <DashboardLocaleContext.Provider value={contextValue}>
      {children}
    </DashboardLocaleContext.Provider>
  );
}

export function useDashboardLocale(): DashboardLocaleContextValue {
  const value = useContext(DashboardLocaleContext);
  if (!value) {
    throw new Error("useDashboardLocale must be used inside DashboardLocaleProvider");
  }
  return value;
}

/**
 * The same context, but English rather than an exception when there is no provider.
 *
 * For components that may render outside the authenticated tree — a loading fallback is the case
 * this was added for. A route's `loading.tsx` is the one thing on screen while a page is being
 * fetched, and throwing there would replace a spinner with an error boundary.
 */
export function useOptionalDashboardLocale(): DashboardLocaleContextValue {
  const value = useContext(DashboardLocaleContext);
  return value ?? { locale: "en", translate: (english: string) => english };
}

