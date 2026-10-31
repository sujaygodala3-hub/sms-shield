// SMS Shield data. Prices are illustrative prototype estimates, not quotes.
window.MR_DATA = (() => {
  // Rough relative cost-of-care index by state (1.00 = US typical).
  const STATES = {
    AL: ["Alabama", 0.86], AK: ["Alaska", 1.38], AZ: ["Arizona", 0.97], AR: ["Arkansas", 0.85], CA: ["California", 1.22],
    CO: ["Colorado", 1.06], CT: ["Connecticut", 1.14], DE: ["Delaware", 1.05], DC: ["District of Columbia", 1.18], FL: ["Florida", 0.99],
    GA: ["Georgia", 0.95], HI: ["Hawaii", 1.12], ID: ["Idaho", 0.94], IL: ["Illinois", 1.03], IN: ["Indiana", 0.97],
    IA: ["Iowa", 0.92], KS: ["Kansas", 0.93], KY: ["Kentucky", 0.89], LA: ["Louisiana", 0.92], ME: ["Maine", 1.04],
    MD: ["Maryland", 1.02], MA: ["Massachusetts", 1.19], MI: ["Michigan", 0.98], MN: ["Minnesota", 1.05], MS: ["Mississippi", 0.84],
    MO: ["Missouri", 0.94], MT: ["Montana", 1.01], NE: ["Nebraska", 0.96], NV: ["Nevada", 1.00], NH: ["New Hampshire", 1.09],
    NJ: ["New Jersey", 1.15], NM: ["New Mexico", 0.93], NY: ["New York", 1.21], NC: ["North Carolina", 0.97], ND: ["North Dakota", 1.02],
    OH: ["Ohio", 0.95], OK: ["Oklahoma", 0.89], OR: ["Oregon", 1.08], PA: ["Pennsylvania", 1.01], RI: ["Rhode Island", 1.06],
    SC: ["South Carolina", 0.93], SD: ["South Dakota", 0.98], TN: ["Tennessee", 0.90], TX: ["Texas", 0.98], UT: ["Utah", 0.95],
    VT: ["Vermont", 1.07], VA: ["Virginia", 0.99], WA: ["Washington", 1.10], WV: ["West Virginia", 0.94], WI: ["Wisconsin", 1.04],
    WY: ["Wyoming", 1.08],
  };

  // 3-digit ZIP prefixes for large metro areas, which tend to price above the state index.
  const METRO_ZIP3 = ["100", "101", "102", "103", "104", "112", "113", "021", "022", "200", "202", "606", "607", "900", "901", "902", "904", "906", "908", "910", "911", "912", "941", "940", "943", "945", "946", "947", "950", "951", "981", "980", "770", "772", "750", "752", "303", "331", "330", "191", "152", "021", "802", "972", "554", "551", "852", "850", "891", "920", "921", "922", "232", "222", "070", "071", "073"];

  const CONDITIONS = {
    strep: {
      name: "Strep throat", early: [["Urgent care visit", 140], ["Rapid strep test", 35], ["Antibiotics (amoxicillin)", 15]],
      late: [["ER visit", 1450], ["Peritonsillar abscess drainage", 1350], ["CT scan of neck", 650], ["IV antibiotics", 280]],
      lateLabel: "Untreated, can become a throat abscess or rheumatic fever", meds: ["amoxicillin", "penicillin", "azithromycin"],
    },
    uti: {
      name: "Urinary tract infection", early: [["Telehealth or clinic visit", 90], ["Urinalysis", 30], ["Antibiotics (nitrofurantoin)", 20]],
      late: [["ER visit", 1450], ["Kidney infection workup (labs, imaging)", 900], ["Hospital stay, 2 nights", 4800], ["IV antibiotics", 350]],
      lateLabel: "Untreated, can spread to the kidneys", meds: ["nitrofurantoin", "cephalexin"],
    },
    appendicitis: {
      name: "Appendicitis", early: [["ER visit and CT", 2600], ["Laparoscopic appendectomy", 11800], ["1-night stay", 2400]],
      late: [["ER visit and CT", 2600], ["Surgery for ruptured appendix", 17500], ["4-night stay", 9600], ["IV antibiotics and drain", 1600]],
      lateLabel: "Delay risks rupture and a longer, more complex stay", meds: ["ibuprofen"],
    },
    diabetes: {
      name: "Type 2 diabetes", early: [["Primary care visits (4/yr)", 520], ["A1C and lab tests", 180], ["Metformin, 1 year", 96]],
      late: [["Hospital stay for complications", 18500], ["Specialist and wound care", 6200], ["Insulin, 1 year", 3600]],
      lateLabel: "Unmanaged, leads to hospital stays, nerve and kidney damage", meds: ["metformin", "atorvastatin"],
      unit: "first year",
    },
    hypertension: {
      name: "High blood pressure", early: [["Primary care visits (3/yr)", 390], ["Home BP monitor", 45], ["Lisinopril, 1 year", 72]],
      late: [["Stroke or heart attack hospital stay", 32000], ["Rehab", 9000], ["Follow-up care, 1 year", 3800]],
      lateLabel: "Uncontrolled, raises the risk of stroke and heart attack", meds: ["lisinopril", "amlodipine", "atorvastatin"],
      unit: "first year",
    },
    pneumonia: {
      name: "Pneumonia", early: [["Clinic visit", 160], ["Chest X-ray", 120], ["Antibiotics", 25]],
      late: [["ER visit", 1450], ["Hospital stay, 4 nights", 10500], ["IV antibiotics and oxygen", 900]],
      lateLabel: "Delay can mean hospitalization, especially for older adults", meds: ["azithromycin", "amoxicillin"],
    },
    asthma: {
      name: "Asthma", early: [["Primary care visits (2/yr)", 260], ["Rescue inhaler", 30], ["Controller inhaler, 1 year", 720]],
      late: [["ER visits for attacks (2)", 2900], ["Hospital stay, 2 nights", 5600], ["Rescue inhalers and steroids", 220]],
      lateLabel: "Without a controller, attacks send people to the ER", meds: ["albuterol", "fluticasone-salmeterol"],
      unit: "first year",
    },
    cellulitis: {
      name: "Cellulitis (skin infection)", early: [["Clinic visit", 150], ["Antibiotics (cephalexin)", 15], ["Follow-up visit", 110]],
      late: [["ER visit", 1450], ["Hospital stay, 3 nights", 7400], ["IV antibiotics", 600]],
      lateLabel: "Spreading infection can need IV antibiotics in hospital", meds: ["cephalexin"],
    },
    migraine: {
      name: "Migraine", early: [["Primary care visit", 150], ["Sumatriptan, 1 year", 180], ["Preventive plan", 120]],
      late: [["ER visits (2)", 2900], ["Head CT", 650], ["Lost work days", 900]],
      lateLabel: "Untreated, frequent attacks end up in the ER", meds: ["sumatriptan", "ibuprofen"],
      unit: "first year",
    },
  };

  const MEDS = [
    { id: "amoxicillin", generic: "Amoxicillin", brand: "Amoxil", g: 12, b: 48, dose: "500 mg, 10-day course", for: ["strep", "pneumonia"] },
    { id: "penicillin", generic: "Penicillin VK", brand: "Veetids", g: 11, b: 40, dose: "500 mg, 10-day course", for: ["strep"] },
    { id: "azithromycin", generic: "Azithromycin", brand: "Zithromax", g: 14, b: 72, dose: "250 mg Z-Pak", for: ["strep", "pneumonia"] },
    { id: "nitrofurantoin", generic: "Nitrofurantoin", brand: "Macrobid", g: 18, b: 125, dose: "100 mg, 5-day course", for: ["uti"] },
    { id: "cephalexin", generic: "Cephalexin", brand: "Keflex", g: 13, b: 190, dose: "500 mg, 7-day course", for: ["cellulitis", "uti"] },
    { id: "metformin", generic: "Metformin", brand: "Glucophage", g: 8, b: 95, dose: "500 mg, 30 days", for: ["diabetes"] },
    { id: "lisinopril", generic: "Lisinopril", brand: "Zestril", g: 6, b: 78, dose: "10 mg, 30 days", for: ["hypertension"] },
    { id: "amlodipine", generic: "Amlodipine", brand: "Norvasc", g: 8, b: 160, dose: "5 mg, 30 days", for: ["hypertension"] },
    { id: "atorvastatin", generic: "Atorvastatin", brand: "Lipitor", g: 10, b: 330, dose: "20 mg, 30 days", for: ["hypertension", "diabetes"] },
    { id: "albuterol", generic: "Albuterol inhaler", brand: "Ventolin HFA", g: 28, b: 68, dose: "90 mcg, 1 inhaler", for: ["asthma"] },
    { id: "fluticasone-salmeterol", generic: "Fluticasone-salmeterol", brand: "Advair Diskus", g: 62, b: 420, dose: "250/50, 30 days", for: ["asthma"] },
    { id: "sumatriptan", generic: "Sumatriptan", brand: "Imitrex", g: 14, b: 690, dose: "50 mg, 9 tablets", for: ["migraine"] },
    { id: "ibuprofen", generic: "Ibuprofen", brand: "Advil / Motrin", g: 5, b: 11, dose: "200 mg, 100 tablets", for: ["migraine", "appendicitis"] },
    { id: "omeprazole", generic: "Omeprazole", brand: "Prilosec", g: 9, b: 38, dose: "20 mg, 30 days", for: [] },
  ];

  // Demo-mode symptom matcher, used when the server has no API key.
  const SYMPTOM_RULES = [
    { key: "strep", name: "Strep throat", words: ["throat", "swallow", "tonsil", "strep"], urgency: "urgent", why: "Sore throat with fever and painful swallowing, without a cough, often points to strep.", next: "Get a rapid strep test at urgent care or a clinic today or tomorrow." },
    { key: "uti", name: "Urinary tract infection", words: ["pee", "urinat", "burn", "bladder", "uti"], urgency: "urgent", why: "Burning and frequent urination are classic UTI signs.", next: "See a clinician or use telehealth within 24 hours. Fever or back pain means go sooner." },
    { key: "appendicitis", name: "Appendicitis", words: ["lower right", "right side", "belly", "abdomen", "stomach"], urgency: "emergency", why: "Pain in the lower right belly with nausea can be appendicitis.", next: "Go to the ER now, especially if the pain is getting worse." },
    { key: "asthma", name: "Asthma flare", words: ["wheez", "tight chest", "short of breath", "inhaler", "asthma"], urgency: "urgent", why: "Wheezing and chest tightness, especially at night, suggest asthma.", next: "Use your rescue inhaler if you have one and see a clinician soon. Can't speak in full sentences means call 911." },
    { key: "pneumonia", name: "Pneumonia", words: ["cough", "phlegm", "fever", "chills"], urgency: "urgent", why: "Cough with fever and chills can be a chest infection.", next: "See a clinician within 24 hours; a chest X-ray may be needed." },
    { key: "cellulitis", name: "Cellulitis (skin infection)", words: ["red", "swollen", "warm", "skin", "leg", "rash"], urgency: "urgent", why: "A red, warm, swollen, painful patch of skin is typical of cellulitis.", next: "See a clinician within 24 hours. A spreading red line or fever means go sooner." },
    { key: "migraine", name: "Migraine", words: ["headache", "migraine", "light", "aura"], urgency: "soon", why: "Throbbing headache with light sensitivity or nausea fits migraine.", next: "Book a visit this week. The worst headache of your life means call 911." },
    { key: "hypertension", name: "High blood pressure", words: ["blood pressure", "bp", "dizzy", "pounding"], urgency: "soon", why: "High readings or pounding headaches can come from blood pressure.", next: "Recheck your blood pressure and book a primary care visit this week." },
    { key: "diabetes", name: "Type 2 diabetes", words: ["thirst", "thirsty", "peeing a lot", "blurry", "sugar"], urgency: "soon", why: "Constant thirst, frequent urination and blurry vision can point to high blood sugar.", next: "Book a visit this week for an A1C blood test." },
  ];

  const RED_FLAGS = [
    "Chest pain or pressure", "Trouble breathing or lips turning blue", "Face drooping, arm weakness or slurred speech",
    "Sudden, severe pain", "Confusion or fainting", "Thoughts of harming yourself (call or text 988)",
  ];

  const CHAT_ANSWERS = [
    { words: ["no surprises", "surprise", "out-of-network", "out of network"], reply: "The No Surprises Act (in effect since January 1, 2022) stops most surprise out-of-network bills. For emergency care, and for out-of-network doctors at an in-network hospital or surgery center, you only owe your in-network cost-sharing. It also covers air ambulances, but not ground ambulances. Use Bill Check to see if your bill qualifies." },
    { words: ["charity", "financial assistance", "afford", "qualify", "501"], reply: "If the hospital is a nonprofit, IRS rule 501(r) requires it to have a financial assistance policy and to cap what eligible patients pay. Many hospitals give free care below 200% of the federal poverty level and discounts up to 300 to 400%, but each sets its own limits. Ask the billing office for the policy and the application; you have at least 240 days after the first bill to apply." },
    { words: ["appeal", "denied", "denial", "reject"], reply: "1. Read the denial letter for the reason and the deadline.\n2. File an internal appeal with your plan within 180 days of the denial notice.\n3. Include a letter from your doctor and any records.\n4. If it's denied again, request an independent external review. The plan must follow that decision." },
    { words: ["itemized", "itemised", "codes", "error"], reply: "Ask the billing office for an itemized bill with CPT billing codes. Check it against your insurer's Explanation of Benefits for duplicates, services you didn't receive, and charges higher than your EOB says you owe." },
    { words: ["good faith", "estimate", "uninsured", "cash"], reply: "If you're uninsured or paying cash, providers must give you a Good Faith Estimate before scheduled care. If the final bill is $400 or more above it, you can start patient-provider dispute resolution within 120 days of the bill." },
    { words: ["collections", "credit", "sued", "lawsuit"], reply: "Nonprofit hospitals must check whether you qualify for financial assistance before taking extraordinary collection actions like credit reporting or lawsuits. Applying for assistance pauses those actions. Send a written dispute and keep copies." },
    { words: ["generic", "brand", "medication", "drug", "prescription", "pharmacy"], reply: "Generics have the same active ingredient as the brand and are usually much cheaper. Ask your doctor to prescribe the generic, compare prices on the Medication Prices tab, and ask the pharmacy for its cash price with a discount card." },
    { words: ["chest pain", "can't breathe", "cant breathe", "stroke", "suicid", "overdose"], reply: "This could be an emergency. Call 911 now. For thoughts of self-harm, call or text 988." },
  ];

  return { STATES, METRO_ZIP3, CONDITIONS, MEDS, SYMPTOM_RULES, RED_FLAGS, CHAT_ANSWERS };
})();
