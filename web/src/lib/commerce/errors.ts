/**
 * A read that failed for an infrastructure reason, as opposed to one that found nothing.
 *
 * The distinction is the whole point. "We do not carry that" and "I could not check right now"
 * are different sentences to a customer, and a tool that collapses them teaches the AI to say the
 * first when the second is true — which is how a store loses a sale it could have made.
 *
 * Provider-agnostic on purpose: every `CommerceReader` throws this one type, so the tool layer
 * has a single thing to catch and never learns a provider's failure vocabulary.
 */
export class CommerceReadError extends Error {
  constructor(public readonly reason: string) {
    super(`commerce_read_failed:${reason}`);
    this.name = "CommerceReadError";
  }
}

export function isCommerceReadError(err: unknown): err is CommerceReadError {
  return err instanceof CommerceReadError;
}
