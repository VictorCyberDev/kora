import type { AnySiteSpec } from "@kora/site-schema";
import type { BusinessFacts } from "./facts.js";

/**
 * Writes profile facts onto a copy of a site spec. Only business-level fields move; layout, copy and design are
 * untouched. Fields the profile does not state are left as the site has them rather than erased.
 */
export function applyFactsToSpec(
  spec: AnySiteSpec,
  facts: BusinessFacts,
): AnySiteSpec {
  const next = structuredClone<AnySiteSpec>(spec);
  const b = next.business;
  b.name = facts.identity.name;
  if (facts.identity.description) b.description = facts.identity.description;
  if (facts.identity.industry) b.industry = facts.identity.industry;
  if (facts.contact.phone) b.phone = facts.contact.phone;
  if (facts.contact.whatsapp) b.whatsapp = facts.contact.whatsapp;
  if (facts.contact.email) b.email = facts.contact.email;
  const place = facts.contact.address ?? facts.contact.city;
  if (place) b.location = place;
  if ("hours" in b && facts.availability.hours.length)
    b.hours = facts.availability.hours.map((h) => ({
      days: h.days,
      hours: h.hours,
    }));
  return next;
}
