/* SMS Shield legal layer. One module that every feature calls: billing rules
   (No Surprises Act, 501(r) charity care, Good Faith Estimates, appeals),
   disability healthcare rights, precedent, dispute steps and letter templates.
   Loaded as a plain script in the browser and imported by server.js so the
   chatbot gets the same rules as context.

   Rule of the data: a citation appears only when it is a real statute or
   regulation. Anything without one is labeled "General principle". */
globalThis.SMSLegal = (() => {
  const DISCLAIMER = "General information, not legal advice.";
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  // 2025 HHS poverty guideline, 48 contiguous states.
  const FPL = { base: 15650, perPerson: 5500, year: 2025 };
  const fplFor = (size) => FPL.base + FPL.perPerson * Math.max(0, size - 1);

  /* ---------------- Rights: short, plain, cited ---------------- */
  // tags: where a right applies. modes: which access mode it matters most for.
  const RIGHTS = [
    {
      id: "interpreter", law: "ADA and Section 1557", title: "A free qualified interpreter",
      plain: "Doctors and hospitals must give you a qualified interpreter, like ASL, in person or by video, at no cost to you.",
      ask: "Ask for a free qualified ASL interpreter when you book.",
      cite: "28 CFR 36.303; 28 CFR 35.160; 45 CFR 92.202", tags: ["visit", "communication"], modes: ["text"],
    },
    {
      id: "no-family-interpreter", law: "ADA Title III", title: "You do not have to bring someone to interpret",
      plain: "Staff cannot make you bring a family member or friend to interpret. They should only rely on them in an emergency or if you ask.",
      ask: "Say: I need a qualified interpreter, not my family.",
      cite: "28 CFR 36.303(c)", tags: ["visit", "communication"], modes: ["text"],
    },
    {
      id: "formats", law: "ADA and Section 504", title: "Forms and results in a format you can use",
      plain: "You can ask for large print, braille, audio, or an accessible electronic copy of forms, instructions and results.",
      ask: "Ask for your papers in large print, braille, or an accessible digital file.",
      cite: "28 CFR 36.303(b); 45 CFR Part 84", tags: ["visit", "communication"], modes: ["voice"],
    },
    {
      id: "no-charge", law: "ADA", title: "No extra charge for access",
      plain: "A provider cannot add a fee for an interpreter, an accessible format, or other help you need because of a disability.",
      ask: "If you see a charge for an interpreter or access help, ask them to remove it.",
      cite: "28 CFR 36.301(c)", tags: ["visit", "billing"], modes: [],
    },
    {
      id: "exam-room", law: "Section 504 and ADA", title: "An accessible exam room and equipment",
      plain: "You can ask for an exam table that lowers, a lift, a scale you can use, and help moving safely. You should get a real exam, not a skipped one.",
      ask: "Ask for an accessible exam room, a height adjustable table, and help with transfers.",
      cite: "45 CFR Part 84; 28 CFR 36.302", tags: ["visit", "physical"], modes: ["handsfree"],
    },
    {
      id: "longer-visit", law: "ADA Title III", title: "Reasonable changes, like a longer visit",
      plain: "Providers must make reasonable changes to how they do things, like a longer appointment, a quiet room, or help filling out forms.",
      ask: "Ask for a longer appointment and help with forms.",
      cite: "28 CFR 36.302(a)", tags: ["visit"], modes: ["voice", "text", "handsfree"],
    },
    {
      id: "equal-access", law: "ADA Title II and III", title: "Equal access to medical care",
      plain: "Hospitals, clinics and doctor offices cannot refuse you or give you lesser care because of a disability.",
      ask: "If you are turned away, ask for the reason in writing.",
      cite: "42 U.S.C. § 12132; 42 U.S.C. § 12182", tags: ["visit", "discrimination"], modes: [],
    },
    {
      id: "section-504", law: "Section 504 of the Rehabilitation Act", title: "Programs that get federal money must include you",
      plain: "Any provider that takes federal money, including Medicare or Medicaid, cannot exclude you or treat you worse because of a disability.",
      ask: "You can file a complaint with the HHS Office for Civil Rights.",
      cite: "29 U.S.C. § 794; 45 CFR Part 84", tags: ["visit", "discrimination"], modes: [],
    },
    {
      id: "section-1557", law: "ACA Section 1557", title: "No discrimination in health programs",
      plain: "Health programs and insurers that get federal money cannot discriminate based on disability, race, national origin, sex or age, and must offer language help.",
      ask: "Ask for the provider's Section 1557 coordinator or grievance process.",
      cite: "42 U.S.C. § 18116; 45 CFR Part 92", tags: ["visit", "discrimination", "insurance"], modes: [],
    },
    {
      id: "service-animal", law: "ADA", title: "Your service animal can come with you",
      plain: "Your service dog can go with you in waiting rooms, exam rooms and patient rooms. Staff may only ask if it is needed for a disability and what task it does.",
      ask: "Staff may ask only two questions. You do not need papers or a vest.",
      cite: "28 CFR 36.302(c); 28 CFR 35.136", tags: ["visit"], modes: ["voice"],
    },
    {
      id: "service-animal-sterile", law: "General principle", title: "Limits in sterile areas",
      plain: "A hospital may keep a service animal out of places that must stay sterile, like an operating room. It should not keep it out of normal patient areas.",
      ask: "Ask where your animal can wait if it cannot come into one room.",
      cite: null, tags: ["visit"], modes: ["voice"],
    },
    {
      id: "emtala", law: "EMTALA", title: "The ER must check and stabilize you",
      plain: "A hospital ER must screen you and stabilize an emergency, even if you cannot pay or have no insurance.",
      ask: "You can ask for care first and talk about the bill later.",
      cite: "42 U.S.C. § 1395dd", tags: ["emergency"], modes: [],
    },
    {
      id: "nsa-emergency", law: "No Surprises Act", title: "No surprise bill for emergency care",
      plain: "For emergency care, you only owe your normal in-network share, even if the ER or doctor was out of network.",
      ask: "If the bill is higher, dispute it in writing.",
      cite: "42 U.S.C. § 300gg-131; 45 CFR 149.410", tags: ["emergency", "billing"], modes: [],
    },
    {
      id: "nsa-oon", law: "No Surprises Act", title: "Out of network doctors at in-network places",
      plain: "Doctors like anesthesiologists or radiologists at an in-network hospital cannot bill you above your in-network share.",
      ask: "Do not sign a form giving up these protections unless you choose to.",
      cite: "42 U.S.C. § 300gg-132; 45 CFR 149.420", tags: ["billing", "visit"], modes: [],
    },
    {
      id: "gfe", law: "No Surprises Act", title: "A Good Faith Estimate if you pay yourself",
      plain: "If you have no insurance or pay cash, you can get a written cost estimate before a scheduled visit. A bill $400 or more over it can be disputed.",
      ask: "Ask for a Good Faith Estimate when you book.",
      cite: "45 CFR 149.610; 45 CFR 149.620", tags: ["billing", "visit"], modes: [],
    },
    {
      id: "charity", law: "IRS Section 501(r)", title: "Financial help at nonprofit hospitals",
      plain: "Nonprofit hospitals must have a financial assistance policy and cannot charge people who qualify more than insured patients pay.",
      ask: "Ask the billing office for the financial assistance policy and application.",
      cite: "26 U.S.C. § 501(r)(4) and (5)", tags: ["billing", "cost"], modes: [],
    },
    {
      id: "collections", law: "IRS Section 501(r)", title: "No harsh collections before checking help",
      plain: "A nonprofit hospital must check if you qualify for help before credit reporting or suing. You have at least 240 days to apply.",
      ask: "Apply for financial help to pause collections.",
      cite: "26 U.S.C. § 501(r)(6); 26 CFR 1.501(r)-6", tags: ["billing"], modes: [],
    },
    {
      id: "sliding-fee", law: "Health center program", title: "Community health centers charge by income",
      plain: "Federally funded community health centers must offer a sliding fee based on your income, and serve you even if you cannot pay.",
      ask: "Ask the clinic for its sliding fee scale.",
      cite: "42 U.S.C. § 254b", tags: ["cost"], modes: [],
    },
    {
      id: "appeal", law: "ACA appeal rights", title: "You can appeal a denied claim",
      plain: "You have 180 days after a denial to ask your plan to look again. If they still say no, an independent reviewer can decide.",
      ask: "File an internal appeal, then ask for external review.",
      cite: "ACA § 2719; 45 CFR 147.136", tags: ["insurance", "billing"], modes: [],
    },
    {
      id: "medicaid-hearing", law: "Medicaid", title: "A fair hearing if Medicaid says no",
      plain: "If Medicaid denies, cuts or ends a service, you can ask for a fair hearing. Deadlines are set by your state, often up to 90 days.",
      ask: "Ask for a fair hearing in writing and keep a copy of the notice.",
      cite: "42 U.S.C. § 1396a(a)(3); 42 CFR 431.220", tags: ["insurance"], modes: [],
    },
  ];

  /* ---------------- Precedent and authority (only what is confirmed) ---------------- */
  const CASES = [
    {
      tag: "nsa", kind: "Federal regulation", title: "No balance billing for emergency care",
      holding: "Out-of-network emergency providers and facilities can't bill you more than your in-network cost-sharing.",
      body: "Applies to ER care and to care after you're stabilized until you can consent to transfer. Cost-sharing must count toward your in-network deductible.",
      cite: "No Surprises Act, 42 U.S.C. § 300gg-131; 45 CFR 149.410", url: "https://www.ecfr.gov/current/title-45/part-149",
    },
    {
      tag: "nsa", kind: "Federal regulation", title: "Out-of-network doctors at in-network hospitals",
      holding: "Anesthesiologists, radiologists, pathologists, ER doctors and similar can't ask you to waive your protections.",
      body: "Other out-of-network providers can bill more only if they gave written notice and you signed consent at least 72 hours before care (3 hours for same-day appointments).",
      cite: "42 U.S.C. § 300gg-132; 45 CFR 149.420", url: "https://www.ecfr.gov/current/title-45/part-149",
    },
    {
      tag: "nsa", kind: "Federal regulation", title: "Air ambulance protection",
      holding: "Out-of-network air ambulance providers are limited to in-network cost-sharing for covered services.",
      body: "Ground ambulances are not covered by the federal law; many states have their own ground-ambulance rules.",
      cite: "42 U.S.C. § 300gg-112; 45 CFR 149.130", url: "https://www.ecfr.gov/current/title-45/part-149",
    },
    {
      tag: "nsa", kind: "Court ruling", title: "Texas Medical Association v. HHS (2022)",
      holding: "The court struck down a rule tilting payment arbitration toward insurers. Patient protections were untouched.",
      body: "The fight over what out-of-network providers get paid happens between providers and insurers through independent dispute resolution. Your share stays capped either way.",
      cite: "Tex. Med. Ass'n v. U.S. Dep't of Health & Human Servs., E.D. Tex. 2022", url: "https://www.cms.gov/nosurprises",
    },
    {
      tag: "nsa", kind: "Federal regulation", title: "Uninsured? Your Good Faith Estimate counts",
      holding: "If your bill is at least $400 more than the Good Faith Estimate, you can dispute it.",
      body: "Start patient-provider dispute resolution within 120 days of receiving the bill. Providers can't send the disputed amount to collections while it's under review.",
      cite: "45 CFR 149.610 and 149.620", url: "https://www.cms.gov/nosurprises",
    },
    {
      tag: "charity", kind: "Federal tax rule", title: "Nonprofit hospitals must offer financial assistance",
      holding: "Every tax-exempt hospital needs a written financial assistance policy that's widely publicized.",
      body: "The policy must state who qualifies, how to apply, and what discounts are available. Ask the billing office for it and the application.",
      cite: "26 U.S.C. § 501(r)(4); 26 CFR 1.501(r)-4", url: "https://www.irs.gov/charities-non-profits/requirements-for-501c3-hospitals-under-the-affordable-care-act-section-501r",
    },
    {
      tag: "charity", kind: "Federal tax rule", title: "Limits on what eligible patients are charged",
      holding: "If you qualify for assistance, the hospital can't charge more than it generally bills insured patients.",
      body: "That cap is called \"amounts generally billed\". Gross charges, the full list price, are off limits for eligible patients.",
      cite: "26 U.S.C. § 501(r)(5); 26 CFR 1.501(r)-5", url: "https://www.irs.gov/charities-non-profits/requirements-for-501c3-hospitals-under-the-affordable-care-act-section-501r",
    },
    {
      tag: "charity", kind: "Federal tax rule", title: "No aggressive collections before checking eligibility",
      holding: "Hospitals must make reasonable efforts to see if you qualify before credit reporting, lawsuits or liens.",
      body: "You can apply for assistance for at least 240 days after the first post-discharge bill. Applying pauses these extraordinary collection actions.",
      cite: "26 U.S.C. § 501(r)(6); 26 CFR 1.501(r)-6", url: "https://www.irs.gov/charities-non-profits/requirements-for-501c3-hospitals-under-the-affordable-care-act-section-501r",
    },
    {
      tag: "appeal", kind: "Federal regulation", title: "Internal appeal and external review",
      holding: "You have 180 days from a denial notice to file an internal appeal, then the right to independent external review.",
      body: "Urgent care claims get expedited decisions. If the external reviewer overturns the denial, the plan must pay.",
      cite: "ACA § 2719; 45 CFR 147.136", url: "https://www.ecfr.gov/current/title-45/part-147",
    },
    {
      tag: "state", kind: "State law", title: "New York surprise bill law (2015)",
      holding: "New York protects patients from surprise out-of-network bills and created an independent dispute process.",
      body: "One of the state laws that preceded the federal No Surprises Act. Many states have similar rules that can add protection, such as for ground ambulances.",
      cite: "N.Y. Financial Services Law, Article 6", url: "https://www.dfs.ny.gov/consumers/health_insurance/surprise_medical_bills",
    },
    {
      tag: "state", kind: "State law", title: "California AB 72 (2016)",
      holding: "Patients at in-network California facilities pay only in-network cost-sharing to out-of-network doctors there.",
      body: "Applies to state-regulated plans. Check your state insurance department for the rules where you live.",
      cite: "Cal. Health & Safety Code § 1371.9", url: "https://www.dmhc.ca.gov/",
    },
    {
      tag: "access", kind: "Federal regulation", title: "Effective communication in health care",
      holding: "Health care providers must give auxiliary aids, like interpreters and accessible formats, so communication works as well as it does for others.",
      body: "The provider pays, and can't ask you to bring your own interpreter. The type of aid depends on the situation and what you use.",
      cite: "28 CFR 36.303; 45 CFR 92.202", url: "https://www.ada.gov/resources/effective-communication/",
    },
    {
      tag: "access", kind: "Federal regulation", title: "Service animals in medical settings",
      holding: "Service animals can go where the public and patients are allowed to go.",
      body: "Staff may ask only if the dog is needed for a disability and what task it is trained to do.",
      cite: "28 CFR 36.302(c)", url: "https://www.ada.gov/resources/service-animals-2010-requirements/",
    },
  ];

  // Typical dispute steps for each kind of issue. Plain steps, no promises.
  const PROCESS = {
    access: [
      "Ask in writing for the accommodation before the visit. Keep a copy.",
      "If they say no, ask for the provider's grievance or Section 1557 coordinator.",
      "File a complaint with the HHS Office for Civil Rights. It is usually due within 180 days.",
      "You can also file an ADA complaint with the U.S. Department of Justice.",
    ],
    nsa: [
      "Do not pay the extra amount yet. Ask for an itemized bill.",
      "Compare it to your insurer's Explanation of Benefits.",
      "Send a written dispute that names the No Surprises Act.",
      "If it is not fixed, call the No Surprises Help Desk at 1-800-985-3059.",
    ],
    charity: [
      "Ask for the hospital's financial assistance policy and application.",
      "Apply, even if you are not sure you qualify. You have at least 240 days.",
      "Ask them to hold the account while they review it.",
      "If they do not respond, contact your state attorney general or the IRS.",
    ],
    appeal: [
      "Read the denial letter for the reason and the deadline.",
      "File an internal appeal within 180 days, with a letter from your doctor.",
      "If it is denied again, ask for an independent external review.",
      "For Medicaid, ask for a fair hearing before your state's deadline.",
    ],
  };

  // Realistic outcome language. These are not statistics.
  const OUTCOMES = {
    access: "Estimate: many access problems get fixed once you ask in writing and name the law. If not, a civil rights complaint can lead to an investigation. Results vary.",
    nsa: "Estimate: when the No Surprises Act applies, providers often correct the bill to your in-network amount after a written dispute. Results vary.",
    charity: "Estimate: people who qualify can see their bill lowered or erased. Each hospital sets its own income limits.",
    appeal: "Estimate: some denials are reversed on appeal, especially with a doctor's letter. If an external reviewer overturns it, the plan must pay.",
    state: "Estimate: state laws can add protection. Check your state insurance department.",
  };

  const label = (r) => (r.cite ? `${r.law} · ${r.cite}` : "General principle");

  /* ---------------- Context: which rights apply right now ---------------- */
  // ctx: { mode, urgency, insurance, outOfNetwork, nonprofit, denied, tags[] }
  function rightsFor(ctx = {}) {
    const want = new Set(["visit", ...(ctx.tags || [])]);
    if (ctx.urgency === "emergency") want.add("emergency");
    if (ctx.insurance === "medicaid") want.add("insurance");
    const picked = RIGHTS.filter((r) => r.tags.some((t) => want.has(t)));
    // Rights for the user's mode first, then the rest.
    const score = (r) => (r.modes.includes(ctx.mode) ? 0 : r.modes.length ? 2 : 1);
    return picked.sort((a, b) => score(a) - score(b));
  }

  // Accommodations to ask for at a visit, by access mode.
  function accommodationsFor(mode) {
    const base = ["A longer appointment", "Written instructions to take home"];
    const byMode = {
      voice: ["Forms and results in large print, braille or an accessible digital file", "Staff to read forms aloud", "Your service animal with you"],
      text: ["A free qualified ASL interpreter, in person or by video", "Written notes or live captions", "Text or email instead of phone calls"],
      handsfree: ["An accessible exam room with a lowering table", "Help with transfers and a lift", "Help filling out forms"],
      typing: ["To write or type your answers instead of speaking", "Text or email instead of phone calls", "Extra time to type or point to answers"],
      full: ["A free qualified ASL interpreter, in person or by video", "Forms and results in large print, braille or an accessible digital file", "Written notes or live captions"],
    };
    return [...(byMode[mode] || ["Whatever help you need to communicate and get a full exam"]), ...base];
  }

  // The "What this could cost and what protects you" panel after a photo check.
  // costRange comes from the app's cost data: { low, high } in dollars or null.
  function costAndRights({ urgency, mode, costRange, insurance } = {}) {
    const emergency = urgency === "emergency";
    const items = [];
    items.push({
      status: "protected", title: "Financial help may apply",
      body: "If the hospital is a nonprofit, it must offer financial assistance. Many give free care at lower incomes and discounts above that.",
      cite: label(RIGHTS.find((r) => r.id === "charity")), tag: "charity",
    });
    if (emergency) {
      items.push({
        status: "protected", title: "No Surprises Act covers emergency care",
        body: "You only owe your normal in-network share for emergency care, even out of network. The ER must treat you even if you cannot pay.",
        cite: `${label(RIGHTS.find((r) => r.id === "nsa-emergency"))}; EMTALA · 42 U.S.C. § 1395dd`, tag: "nsa",
      });
    } else {
      items.push({
        status: "action", title: insurance === "uninsured" ? "Ask for a Good Faith Estimate" : "Check the network before you go",
        body: insurance === "uninsured"
          ? "Paying yourself? You can get a written estimate first. A bill $400 or more over it can be disputed."
          : "Out of network doctors at an in-network hospital cannot bill you above your in-network share.",
        cite: label(RIGHTS.find((r) => r.id === (insurance === "uninsured" ? "gfe" : "nsa-oon"))), tag: "nsa",
      });
    }
    items.push({
      status: "action", title: "Accommodations you can ask for",
      body: accommodationsFor(mode).slice(0, 3).join(". ") + ".",
      cite: label(RIGHTS.find((r) => r.id === (mode === "text" || mode === "full" ? "interpreter" : mode === "voice" ? "formats" : mode === "handsfree" ? "exam-room" : "longer-visit"))), tag: "access",
    });
    return {
      cost: costRange ? `${money(costRange.low)} to ${money(costRange.high)}` : null,
      costNote: "Estimate based on typical US prices. Your cost depends on insurance and location.",
      items, disclaimer: DISCLAIMER,
    };
  }

  // Similar authority, dispute steps and outcome language for flagged issues.
  function precedentFor(tags) {
    const set = new Set(tags);
    return {
      cases: CASES.filter((c) => set.has(c.tag)).slice(0, 3),
      steps: [...set].map((t) => PROCESS[t]).find(Boolean) || PROCESS.access,
      outcome: [...set].map((t) => OUTCOMES[t]).find(Boolean) || OUTCOMES.access,
      disclaimer: DISCLAIMER,
    };
  }

  /* ---------------- Bill Check engine ---------------- */
  function analyzeBill(b) {
    const out = [];
    const billed = +b.billed || 0, expected = +b.expected || 0, gfe = +b.gfe || 0;
    const overage = billed && expected ? billed - expected : 0;
    const insured = b.insurance === "private";
    const ancillary = "anesthesiology, radiology, pathology, emergency medicine, labs";

    if (b.insurance === "medicare") {
      out.push({
        level: "info", title: "Medicare and Medicaid have their own protections",
        body: "The No Surprises Act doesn't apply to Medicare or Medicaid, but both already bar most balance billing by participating providers. Call the number on your card to ask about the charge.",
        impact: "Ask your plan whether this provider can bill you the difference", sources: ["Medicare and Medicaid balance-billing rules"],
      });
    }
    if (insured && b.setting === "er" && (b.facilityNetwork === "out" || b.providerNetwork === "out")) {
      out.push({
        level: "high", title: "Possible No Surprises Act violation: emergency care",
        body: "Out-of-network emergency providers can't bill you more than your in-network cost-sharing, and you can't waive this protection for emergency care.",
        impact: overage > 0 ? `You may owe ${money(expected)}, not ${money(billed)}. Up to ${money(overage)} in dispute.` : "You owe only your in-network cost-sharing",
        sources: ["42 U.S.C. § 300gg-131", "45 CFR 149.410", "CMS No Surprises Help Desk"], reason: "nsa", tag: "nsa",
      });
    }
    if (insured && b.setting === "scheduled" && b.facilityNetwork === "in" && b.providerNetwork === "out") {
      out.push({
        level: b.signedWaiver ? "medium" : "high",
        title: b.signedWaiver ? "Check the consent form you signed" : "Possible No Surprises Act violation: out-of-network doctor at an in-network facility",
        body: b.signedWaiver
          ? `Consent only counts if you got written notice at least 72 hours before care (3 hours for same-day), and it can never apply to ${ancillary}. If the doctor was one of those, the waiver is invalid.`
          : "An out-of-network doctor at an in-network hospital or surgery center can't bill you above in-network cost-sharing unless you gave valid written consent in advance.",
        impact: overage > 0 ? `Up to ${money(overage)} may not be owed` : "You may owe only in-network cost-sharing",
        sources: ["42 U.S.C. § 300gg-132", "45 CFR 149.420"], reason: "nsa", tag: "nsa",
      });
    }
    if (insured && b.setting === "air" && b.providerNetwork !== "in") {
      out.push({
        level: "high", title: "Possible No Surprises Act violation: air ambulance",
        body: "Out-of-network air ambulance providers are limited to your in-network cost-sharing for covered services.",
        impact: overage > 0 ? `Up to ${money(overage)} in dispute` : "You owe only in-network cost-sharing",
        sources: ["42 U.S.C. § 300gg-112", "45 CFR 149.130"], reason: "nsa", tag: "nsa",
      });
    }
    if (b.setting === "ground") {
      out.push({
        level: "medium", title: "Ground ambulance: check your state's law",
        body: "The federal No Surprises Act doesn't cover ground ambulances, but a growing number of states limit ground-ambulance balance billing. Check your state insurance department.",
        impact: "State law may cap this bill", sources: ["State balance-billing statutes"], reason: "itemized", tag: "state",
      });
    }
    if (b.insurance === "uninsured") {
      if (gfe && billed - gfe >= 400) {
        out.push({
          level: "high", title: "Bill is $400+ over your Good Faith Estimate",
          body: "Uninsured and self-pay patients can dispute a bill that's at least $400 above the Good Faith Estimate. Start patient-provider dispute resolution within 120 days of receiving the bill.",
          impact: `${money(billed - gfe)} above your estimate is disputable`, sources: ["45 CFR 149.610", "45 CFR 149.620"], reason: "gfe", tag: "nsa",
        });
      } else if (!gfe && b.setting !== "er") {
        out.push({
          level: "medium", title: "Did you get a Good Faith Estimate?",
          body: "For scheduled care, providers must give uninsured and self-pay patients a written Good Faith Estimate. If you never got one, say so in your dispute.",
          impact: "Missing estimates strengthen your dispute", sources: ["45 CFR 149.610"], reason: "gfe", tag: "nsa",
        });
      }
    }
    const income = +b.income || 0, size = +b.household || 1;
    if (b.hospital === "nonprofit" || b.hospital === "unknown") {
      const pct = income ? Math.round((income / fplFor(size)) * 100) : null;
      const strong = pct !== null && pct <= 200, maybe = pct !== null && pct <= 400;
      out.push({
        level: strong ? "high" : maybe || pct === null ? "medium" : "info",
        title: strong ? "You likely qualify for free or reduced-cost care" : maybe ? "You may qualify for discounted care" : pct === null ? "Check charity-care eligibility" : "Charity care: worth asking",
        body: (b.hospital === "unknown" ? "If the hospital is a nonprofit (most are), " : "As a nonprofit hospital, ") +
          `it must have a financial assistance policy and can't charge eligible patients more than it generally bills insured patients.` +
          (pct !== null ? ` Your income is about ${pct}% of the ${FPL.year} federal poverty level for a household of ${size}. Many hospitals give free care below 200% and discounts up to 300 to 400%.` : " Add your income above to estimate eligibility."),
        impact: strong ? "Your bill could drop to $0" : maybe ? "Your bill could be significantly reduced" : "Apply within 240 days of the first bill",
        sources: ["26 U.S.C. § 501(r)(4)–(6)", "IRS 501(r) requirements"], reason: "charity", tag: "charity",
      });
    }
    if (b.denied === "yes") {
      out.push({
        level: "high", title: "Appeal the denied claim",
        body: "You have 180 days from the denial notice to file an internal appeal with your plan. If they deny it again, you can request an independent external review, and the plan must follow its decision.",
        impact: "Overturned denials must be paid by your plan", sources: ["ACA § 2719", "45 CFR 147.136"], reason: "appeal", tag: "appeal",
      });
    }
    if (b.accessCharge) {
      out.push({
        level: "high", title: "You were charged for an interpreter or access help",
        body: "Providers cannot add a fee for an interpreter, accessible format, or other help you need because of a disability.",
        impact: "That charge should be removed", sources: ["28 CFR 36.301(c)"], reason: "itemized", tag: "access",
      });
    }
    out.push({
      level: "info", title: "Ask for an itemized bill first",
      body: "Request an itemized bill with billing codes and compare it to your insurer's Explanation of Benefits. Look for duplicates and services you didn't receive. Ask them to hold the account while you review.",
      impact: "Billing errors are common and easy to dispute", sources: ["Your right to request your billing records"], reason: "itemized",
    });
    return out;
  }

  /* ---------------- Letters ---------------- */
  const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[date of service]");

  // kind: accommodation | appeal | nsa | charity | gfe | itemized
  // f: { name, address, provider, account, billed, date, needs[], mode, plan }
  // bill: saved Bill Check answers, used to fill billing letters.
  function letter(kind, f = {}, bill = {}) {
    const name = f.name || "[Your full name]", addr = f.address || "[Your mailing address]";
    const prov = f.provider || "[Hospital or provider name]", acct = f.account || "[Account or claim number]";
    const amt = f.billed ? money(+f.billed) : "[amount]";
    const date = fmtDate(f.date);
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const expected = bill.expected ? money(+bill.expected) : "my in-network cost-sharing amount";
    const needs = (f.needs && f.needs.length ? f.needs : accommodationsFor(f.mode)).map((n) => `- ${n}`).join("\n");

    const bodies = {
      accommodation: `I am a patient with a disability, and I have an upcoming visit${f.date ? ` on ${date}` : ""}. I am writing to ask for the following accommodations so that I can communicate with my care team and get a full exam:

${needs}

Under Title III of the Americans with Disabilities Act (28 CFR 36.302 and 36.303), Section 504 of the Rehabilitation Act (29 U.S.C. § 794), and Section 1557 of the Affordable Care Act (45 CFR Part 92), health care providers must make reasonable modifications and provide auxiliary aids and services at no cost to me (28 CFR 36.301(c)).

Please confirm in writing which accommodations will be in place before my visit. If you cannot provide one of them, please tell me what you can offer instead and the name of your Section 1557 or ADA coordinator.`,
      nsa: `I am writing to dispute the bill of ${amt} for services on ${date}. ${bill.setting === "er" ? "These were emergency services." : "These services were provided by an out-of-network provider at an in-network facility."} Under the federal No Surprises Act (42 U.S.C. §§ 300gg-131 and 300gg-132; 45 CFR 149.410 and 149.420), I cannot be billed more than ${expected}${bill.signedWaiver ? "" : ", and I did not give valid advance written consent to waive these protections"}.

Please correct the bill to reflect only my in-network cost-sharing, as determined by my health plan, and refund any amount I have paid above it. Please also confirm in writing that the account has been placed on hold and will not be sent to collections while this dispute is resolved.

If the bill is not corrected, I will file a complaint with the No Surprises Help Desk (1-800-985-3059) and my state insurance regulator.`,
      charity: `I am writing to request financial assistance for the bill of ${amt} for services on ${date}. As a tax-exempt hospital, ${prov} must maintain a financial assistance policy under 26 U.S.C. § 501(r)(4), limit charges to eligible patients to amounts generally billed under § 501(r)(5), and refrain from extraordinary collection actions while an application is pending under § 501(r)(6).

Please send me your financial assistance policy, a plain-language summary, and the application. ${bill.income ? `My household of ${bill.household || 1} has an annual income of about ${money(+bill.income)}.` : ""} I ask that you place this account on hold, and suspend any collection activity, while my application is reviewed.`,
      gfe: `I am writing to dispute the bill of ${amt} for services on ${date}. I was uninsured or self-paying for this care. ${bill.gfe ? `The Good Faith Estimate I received was ${money(+bill.gfe)}, and this bill exceeds it by ${money(+bill.billed - +bill.gfe)}.` : "I did not receive the Good Faith Estimate required before scheduled care."}

Under 45 CFR 149.610 and 149.620, I am entitled to dispute a bill that is $400 or more above the Good Faith Estimate through patient-provider dispute resolution. Please treat this letter as notice of that dispute, and do not send this account to collections while it is pending.`,
      itemized: `I am writing about the bill of ${amt} for services on ${date}. Before I make any payment, please send me a fully itemized bill listing each service with its date, CPT or HCPCS billing code, quantity, and charge, along with any payments or adjustments from my insurer.

Please place this account on hold, and do not send it to collections or report it to a credit bureau, while I review the itemized bill. I will follow up on any errors I find.`,
      appeal: `I am writing to appeal the denial of my claim for services on ${date} (billed ${amt}). Under the Affordable Care Act (45 CFR 147.136), I request a full and fair internal review of this decision.

The services were medically necessary, as my provider will confirm. Please send me copies of all documents, records, and criteria used to decide this claim. If the denial is upheld, I request information on how to obtain an independent external review. If my coverage is through Medicaid, please also treat this as a request for a fair hearing under 42 CFR 431.220.`,
    };
    const to = kind === "appeal" ? `Appeals Department, ${f.plan || "[Your health plan]"}`
      : kind === "accommodation" ? `Patient Services or ADA Coordinator, ${prov}` : `Billing Department, ${prov}`;
    const subject = {
      accommodation: "Request for disability accommodations at my visit", nsa: "Dispute of surprise medical bill",
      charity: "Request for financial assistance", gfe: "Dispute of bill exceeding Good Faith Estimate",
      itemized: "Request for itemized bill and account hold", appeal: "Request for internal appeal of denied claim",
    }[kind] || "Request";
    const refLines = kind === "accommodation" ? (f.account ? `Patient or account number: ${acct}\n` : "")
      : `Account / claim number: ${acct}\nDate of service: ${date}\n`;

    return `${name}
${addr}

${today}

${to}

Re: ${subject}
${refLines}
To whom it may concern,

${bodies[kind] || bodies.itemized}

Please respond in writing within ${kind === "accommodation" ? "5 business days, or before my visit if sooner" : "30 days"}. Thank you.

Sincerely,

${name}`;
  }

  const LETTER_KINDS = {
    accommodation: "Accommodation request", nsa: "Billing dispute (No Surprises Act)", charity: "Financial assistance request",
    gfe: "Billing dispute (Good Faith Estimate)", itemized: "Itemized bill request", appeal: "Insurance appeal",
  };

  /* ---------------- Text for the chatbot ---------------- */
  function aiContext() {
    const rights = RIGHTS.map((r) => `- ${r.title}: ${r.plain} [${label(r)}]`).join("\n");
    const cases = CASES.map((c) => `- ${c.title}: ${c.holding} [${c.cite}]`).join("\n");
    return `Healthcare rights (use only these citations; if a point is not here, call it a general principle):\n${rights}\n\nPrecedent and authority in our data (do not name any other cases):\n${cases}`;
  }

  return {
    DISCLAIMER, FPL, fplFor, RIGHTS, CASES, PROCESS, OUTCOMES, LETTER_KINDS,
    label, rightsFor, accommodationsFor, costAndRights, precedentFor, analyzeBill, letter, aiContext,
  };
})();
