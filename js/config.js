/* ==========================================================================
   CALEBOZO LABS — SITE SETTINGS
   This is the only file you need to edit to manage the website.
   Products, prices, images and descriptions come from your Tebex panel
   automatically. Change them in Tebex, not here.
   ========================================================================== */

window.STORE_CONFIG = {

  // Your Tebex PUBLIC token (Tebex panel > Integrations > API Keys > "Public Token").
  // Leave empty to show demo products.
  // Never paste your PRIVATE key here. Anyone can read this file.
  tebexToken: "",

  // Links (leave "" to hide)
  discordUrl: "",
  docsUrl: "",
  youtubeUrl: "",
  githubUrl: "",
  supportEmail: "",

  // Banner above the header. HTML allowed. Leave "" to hide.
  announcement: "",

  // Homepage text
  heroLead: "Optimized, framework-ready resources for serious roleplay servers. Clean code, near-zero resmon and support that actually answers.",

  stats: [
    { value: "0.00ms",   label: "Idle Resmon" },
    { value: "ESX · QB", label: "Framework Ready" },
    { value: "24/7",     label: "Discord Support" },
    { value: "Instant",  label: "Keymaster Delivery" }
  ],

  // Framework tags shown on every product card. Set to [] to hide.
  defaultTags: ["ESX", "QBCore", "QBox"],

  faq: [
    { q: "How do I receive my script?", a: "Purchases are delivered automatically to your Cfx.re account. Download them from Keymaster → Granted Assets right after checkout." },
    { q: "Which frameworks are supported?", a: "Each product page lists its supported frameworks. Most scripts support ESX, QBCore and QBox, and include open bridge files for custom frameworks." },
    { q: "Are the scripts escrowed?", a: "Core logic is protected with Cfx.re asset escrow. Configs, locales and bridge files stay open so you can customize everything that matters." },
    { q: "Do I get updates?", a: "Yes. Updates are free for life and appear in Keymaster automatically. Changelogs are posted in our Discord." },
    { q: "Can I get a refund?", a: "Digital goods are non-refundable once downloaded. If something isn't working, open a ticket and we'll get it sorted." },
    { q: "Can I transfer a script to another account?", a: "Cfx.re handles asset transfers. Open a ticket in our Discord and we'll walk you through it." }
  ],

  footerAbout: "Premium FiveM resources engineered for performance, stability and clean code. FiveM scripts. Built different."
};
