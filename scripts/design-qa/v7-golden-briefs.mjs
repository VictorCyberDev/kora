/** Golden benchmark businesses. Briefs are deliberately minimal; assets are only what an owner could really supply. */
const a = (o = {}) => ({
  logo: false,
  photos: 0,
  testimonials: 0,
  prices: false,
  team: false,
  ...o,
});
export const GOLDEN = [
  [
    "bakery",
    {
      name: "Tola's Cakes",
      description:
        "I sell birthday cakes from home in Lekki. I only have my WhatsApp and three phone photos.",
      goal: "sales",
      whatsapp: "+2348099999999",
      location: "Lekki, Lagos",
      services: ["Birthday cakes", "Cupcakes", "Small chops"],
    },
  ],
  [
    "barber",
    {
      name: "Fade Lab",
      description:
        "We focus on clean fades and beard grooming in Lekki. We want more bookings.",
      goal: "bookings",
      location: "Lekki, Lagos",
      phone: "+2348012345678",
      whatsapp: "+2348012345678",
      services: ["Clean fades", "Beard grooming", "Kids cuts"],
      hours: [{ days: "Mon–Sat", hours: "9am–8pm" }],
    },
  ],
  [
    "salon",
    {
      name: "Amara Beauty Studio",
      description:
        "A calm braiding and hair care studio in Abuja for women who want healthy hair.",
      goal: "bookings",
      location: "Wuse 2, Abuja",
      whatsapp: "+2348033333333",
      services: ["Braids", "Hair treatments", "Wig installs"],
      feel: "calm soft",
    },
  ],
  [
    "restaurant",
    {
      name: "Ofada Table",
      description:
        "A restaurant serving ofada rice, grilled fish and jollof for lunch and dinner in Ikeja.",
      goal: "visits",
      location: "Ikeja, Lagos",
      phone: "+2348044444444",
      services: ["Ofada rice", "Grilled fish", "Jollof rice"],
      hours: [{ days: "Daily", hours: "12pm–10pm" }],
    },
  ],
  [
    "law",
    {
      name: "Adeyemi & Co",
      description:
        "We are a corporate law firm focused on commercial disputes.",
      location: "Victoria Island, Lagos",
      phone: "+2348055555555",
      email: "hello@adeyemi.example",
      services: ["Commercial disputes", "Arbitration", "Contract review"],
    },
  ],
  [
    "clinic",
    {
      name: "Greenfield Family Clinic",
      description:
        "A family clinic offering general check-ups, child health and vaccinations in Port Harcourt.",
      goal: "bookings",
      location: "GRA, Port Harcourt",
      phone: "+2348066666666",
      whatsapp: "+2348066666666",
      services: ["General check-ups", "Child health", "Vaccinations"],
      hours: [{ days: "Mon–Fri", hours: "8am–5pm" }],
    },
  ],
  [
    "property",
    {
      name: "Cornerstone Homes",
      description:
        "Real estate agents helping families rent and buy homes in Lagos Island.",
      goal: "leads",
      location: "Lagos Island",
      whatsapp: "+2348077777777",
      email: "info@cornerstone.example",
      services: ["Rentals", "Sales", "Property management"],
    },
  ],
  [
    "plumber",
    {
      name: "QuickFix Plumbing",
      description:
        "We fix leaks, blocked drains and water heaters across Abuja.",
      goal: "calls",
      location: "Abuja",
      phone: "+2348088888888",
      whatsapp: "+2348088888888",
      services: ["Leak repairs", "Drain unblocking", "Water heater install"],
    },
  ],
  [
    "photographer",
    {
      name: "Lens & Light",
      description:
        "Wedding and portrait photographer based in Lagos. Natural light, honest moments.",
      goal: "show-work",
      location: "Lagos",
      whatsapp: "+2348012121212",
      services: ["Weddings", "Portraits", "Events"],
      feel: "minimal quiet",
    },
  ],
  [
    "fashion",
    {
      name: "Ife Studio",
      description:
        "A womenswear boutique making ready-to-wear dresses with African prints.",
      goal: "sales",
      whatsapp: "+2348023232323",
      services: ["Ready-to-wear dresses", "Custom orders"],
      feel: "elegant editorial",
    },
  ],
  [
    "hotel",
    {
      name: "Palmview Hotel",
      description:
        "A boutique hotel with garden rooms and a restaurant near the Calabar waterfront.",
      goal: "bookings",
      location: "Calabar",
      phone: "+2348034343434",
      whatsapp: "+2348034343434",
      services: ["Garden rooms", "Suites", "Restaurant"],
      feel: "luxury",
    },
  ],
  [
    "interior",
    {
      name: "Studio Okoro",
      description:
        "An interior design studio creating calm family homes and small offices.",
      goal: "show-work",
      location: "Lekki, Lagos",
      email: "hello@okoro.example",
      services: ["Residential interiors", "Office fit-out"],
      feel: "minimal",
    },
  ],
  [
    "mechanic",
    {
      name: "Dele Auto Care",
      description:
        "We repair and service cars and fix electrical faults in Ibadan.",
      goal: "calls",
      location: "Ibadan",
      phone: "+2348045454545",
      services: ["Servicing", "Brake repair", "Auto electrical"],
    },
  ],
  [
    "school",
    {
      name: "Little Steps Daycare",
      description:
        "A daycare and early learning centre for children aged one to five in Enugu.",
      goal: "leads",
      location: "Enugu",
      phone: "+2348056565656",
      whatsapp: "+2348056565656",
      services: ["Daycare", "Early learning", "After-school care"],
    },
  ],
  [
    "gym",
    {
      name: "Iron Yard Gym",
      description:
        "A strength and conditioning gym with personal training and group classes in Surulere.",
      goal: "leads",
      location: "Surulere, Lagos",
      whatsapp: "+2348067676767",
      services: ["Personal training", "Group classes", "Strength area"],
      feel: "bold",
    },
  ],
  [
    "logistics",
    {
      name: "SwiftRoute Logistics",
      description:
        "We deliver parcels and move cargo between Lagos, Abuja and Port Harcourt.",
      goal: "leads",
      phone: "+2348078787878",
      whatsapp: "+2348078787878",
      services: ["Parcel delivery", "Cargo haulage", "Last-mile delivery"],
    },
  ],
  [
    "agriculture",
    {
      name: "Green Acre Farms",
      description:
        "We grow and supply fresh vegetables and eggs to restaurants and households in Ogun State.",
      goal: "sales",
      whatsapp: "+2348089898989",
      location: "Ogun State",
      services: ["Fresh vegetables", "Eggs", "Bulk supply"],
    },
  ],
  [
    "saas",
    {
      name: "Ledgerly",
      description:
        "Ledgerly is accounting software for small shops that tracks sales, stock and debts in one place.",
      goal: "leads",
      email: "hello@ledgerly.example",
      services: ["Sales tracking", "Stock control", "Debt reminders"],
    },
  ],
];
