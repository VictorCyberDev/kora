import type { DesignBrief } from "../../src/v2/plan.js";

/** Short, realistic owner briefs. Used for the diversity matrix and screenshot QA. */
export const BRIEFS: Record<string, DesignBrief> = {
  interior: {
    name: "Nkem Interiors",
    description:
      "We design homes and small offices in Lagos. We provide space planning, furnishing, lighting and styling. Every project starts with a conversation about how you live.",
    location: "Lekki, Lagos",
    email: "hello@nkeminteriors.example",
    feel: "calm, editorial",
  },
  repair: {
    name: "QuickFix Appliance Repair",
    description:
      "Fast repairs for home appliances. We repair fridges, washing machines, cookers and air conditioners.",
    location: "Ikeja, Lagos",
    phone: "+234 803 555 0142",
    whatsapp: "+2348035550142",
    hours: [{ days: "Mon–Sat", hours: "8am – 6pm" }],
    goal: "calls",
  },
  saas: {
    name: "Ledgerly",
    description:
      "Invoicing and cash-flow software for small agencies. We provide invoicing, payment reminders, expense tracking and monthly reports.",
    email: "team@ledgerly.example",
    goal: "leads",
    feel: "modern, sleek",
  },
  restaurant: {
    name: "Mama Tola's Kitchen",
    description:
      "A family restaurant serving Nigerian classics. We serve jollof rice, pepper soup, suya and fresh palm wine on weekends.",
    location: "Surulere, Lagos",
    phone: "+234 802 555 0177",
    hours: [{ days: "Tue–Sun", hours: "12pm – 10pm" }],
    goal: "bookings",
  },
  consultant: {
    name: "Adaeze Okafor",
    description:
      "Independent operations consultant for growing businesses. I provide process reviews, hiring plans and quarterly planning workshops.",
    email: "adaeze@okafor.example",
    goal: "leads",
    feel: "minimal",
  },
  barber: {
    name: "Sharp Lines Barbershop",
    description:
      "Neighbourhood barbershop for clean cuts. We offer haircuts, beard trims, hot towel shaves and kids' cuts.",
    location: "Yaba, Lagos",
    whatsapp: "+2348095550123",
    hours: [{ days: "Mon–Sat", hours: "9am – 8pm" }],
    goal: "bookings",
    feel: "bold",
  },
  dental: {
    name: "BrightSmile Dental",
    description:
      "A family dental clinic with a gentle approach. We provide check-ups, cleaning, fillings, whitening and braces.",
    location: "Abuja",
    phone: "+234 809 555 0190",
    hours: [{ days: "Mon–Fri", hours: "8am – 5pm" }],
    goal: "bookings",
  },
  photography: {
    name: "Lens & Light Studio",
    description:
      "Wedding and portrait photography with a documentary eye. We shoot weddings, portraits, family sessions and events.",
    location: "Port Harcourt",
    email: "book@lensandlight.example",
    feel: "dark",
  },
  law: {
    name: "Adeyemi & Partners",
    description:
      "A commercial law firm advising businesses and founders. We advise on contracts, company formation, employment and property.",
    location: "Victoria Island, Lagos",
    phone: "+234 1 555 0111",
    goal: "leads",
    feel: "professional",
  },
  fitness: {
    name: "Iron Row Gym",
    description:
      "A strength-focused gym with coaching. We offer personal training, small group classes, strength programmes and nutrition guidance.",
    location: "Wuse, Abuja",
    whatsapp: "+2348065550166",
    hours: [{ days: "Mon–Sat", hours: "5am – 10pm" }],
    goal: "leads",
  },
  boutique: {
    name: "Zuri Atelier",
    description:
      "Contemporary African womenswear made in small batches. We design dresses, co-ords, headwraps and bespoke pieces.",
    location: "Ikoyi, Lagos",
    email: "hello@zuriatelier.example",
    whatsapp: "+2348025550188",
    feel: "luxury",
  },
  bakery: {
    name: "Crumb & Co",
    description:
      "A neighbourhood bakery making bread and cakes daily. We bake sourdough, croissants, celebration cakes and cupcakes.",
    location: "Enugu",
    phone: "+234 807 555 0120",
    hours: [{ days: "Daily", hours: "7am – 7pm" }],
    goal: "visits",
    feel: "friendly",
  },
  phones: {
    name: "Fix Hub Phone & Laptop Repair",
    description:
      "Same-day phone and laptop repair. We repair cracked screens, batteries, charging ports and water-damaged phones.",
    location: "Computer Village, Ikeja",
    whatsapp: "+2348033330101",
    hours: [{ days: "Mon–Sat", hours: "9am – 7pm" }],
    goal: "calls",
  },
  salon: {
    name: "Ayo Beauty Lounge",
    description:
      "A hair and beauty salon for women. We offer braiding, silk press, wash and set, makeup and nails.",
    location: "Victoria Island, Lagos",
    whatsapp: "+2348044440202",
    hours: [{ days: "Tue–Sun", hours: "10am – 8pm" }],
    goal: "bookings",
  },
  studio: {
    name: "Studio Okwu Architects",
    description:
      "Architecture and interior architecture studio for private houses and small commercial spaces. We provide concept design, planning drawings, interior architecture and site supervision.",
    location: "Abuja",
    email: "studio@okwu.example",
  },
  fine: {
    name: "Ọkọ Dining",
    description:
      "A fine dining restaurant serving modern West African tasting menus. We serve a seven-course tasting menu, a wine pairing and a private dining room.",
    location: "Victoria Island, Lagos",
    phone: "+234 1 555 0199",
    hours: [{ days: "Wed–Sun", hours: "6pm – 11pm" }],
    goal: "bookings",
    feel: "dark and refined",
  },
  construction: {
    name: "Okoro Build & Renovate",
    description:
      "Residential building and renovation. We provide extensions, roofing, tiling, painting and kitchen refits.",
    location: "Benin City",
    phone: "+234 805 555 0133",
    goal: "leads",
  },
};
