// server/seed-corpus.js
// Seeds legal_corpus_documents with landmark SA cases.
// Usage: node server/seed-corpus.js
require("dotenv").config();
const { pool } = require("./db");

const CASES = [
  // ── Constitutional Court ──────────────────────────────────────────────
  { title: "S v Makwanyane and Another", citation: "[1995] ZACC 3", court: "Constitutional Court", year: 1995, tags: ["constitutional", "criminal"], url: "https://www.saflii.org/za/cases/ZACC/1995/3.html", summary: "Abolished the death penalty in South Africa. The Court held that the death penalty constitutes cruel, inhuman and degrading punishment in violation of section 11(2) of the interim Constitution." },
  { title: "Certification of the Constitution of the Republic of South Africa", citation: "[1996] ZACC 26", court: "Constitutional Court", year: 1996, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/1996/26.html", summary: "First certification judgment. The Court assessed whether the final Constitution complied with the Constitutional Principles in Schedule 4 of the interim Constitution." },
  { title: "President of the RSA v Hugo", citation: "[1997] ZACC 4", court: "Constitutional Court", year: 1997, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/1997/4.html", summary: "Presidential pardon of mothers with minor children under 12. Court considered the right to equality and unfair discrimination under section 9 of the Constitution." },
  { title: "Soobramoney v Minister of Health (KwaZulu-Natal)", citation: "[1997] ZACC 17", court: "Constitutional Court", year: 1997, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/1997/17.html", summary: "Right of access to health care services under section 27. The Court held that the State is not obliged to provide renal dialysis to all patients where resources are limited." },
  { title: "Government of the RSA v Grootboom", citation: "[2000] ZACC 19", court: "Constitutional Court", year: 2000, tags: ["constitutional", "property law"], url: "https://www.saflii.org/za/cases/ZACC/2000/19.html", summary: "Right of access to adequate housing under section 26. The State must devise and implement a reasonable programme providing relief for those in desperate need." },
  { title: "Minister of Health v Treatment Action Campaign (No 2)", citation: "[2002] ZACC 15", court: "Constitutional Court", year: 2002, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2002/15.html", summary: "Ordered government to provide nevirapine to HIV-positive mothers at public hospitals to prevent mother-to-child transmission. Landmark socio-economic rights case." },
  { title: "Barkhuizen v Napier", citation: "[2007] ZACC 5", court: "Constitutional Court", year: 2007, tags: ["constitutional", "contract law"], url: "https://www.saflii.org/za/cases/ZACC/2007/5.html", summary: "Time-bar clause in insurance contract. Public policy and the Constitution require that contractual terms be fair and reasonable." },
  { title: "Glenister v President of the RSA", citation: "[2011] ZACC 6", court: "Constitutional Court", year: 2011, tags: ["constitutional", "criminal"], url: "https://www.saflii.org/za/cases/ZACC/2011/6.html", summary: "The Constitution requires an independent anti-corruption unit. Disbanding the Scorpions and replacing them with the Hawks was found to lack sufficient independence." },
  { title: "Economic Freedom Fighters v Speaker of the National Assembly", citation: "[2016] ZACC 11", court: "Constitutional Court", year: 2016, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2016/11.html", summary: "Nkandla judgment. President Zuma failed to uphold the Constitution by not complying with the Public Protector's remedial action regarding upgrades to his private residence." },
  { title: "Minister of Justice v Prince", citation: "[2018] ZACC 30", court: "Constitutional Court", year: 2018, tags: ["constitutional", "criminal"], url: "https://www.saflii.org/za/cases/ZACC/2018/30.html", summary: "Decriminalised the private use, possession and cultivation of cannabis by adults. The prohibition infringed the right to privacy under section 14 of the Constitution." },
  { title: "Daniels v Scribante", citation: "[2017] ZACC 13", court: "Constitutional Court", year: 2017, tags: ["constitutional", "property law"], url: "https://www.saflii.org/za/cases/ZACC/2017/13.html", summary: "Occupiers under ESTA have the right to make improvements to property necessary for human dignity, even without the owner's consent." },
  { title: "My Vote Counts NPC v Speaker of the National Assembly", citation: "[2015] ZACC 31", court: "Constitutional Court", year: 2015, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2015/31.html", summary: "Right of access to information about private funding of political parties and independent candidates." },
  { title: "Mazibuko v City of Johannesburg", citation: "[2009] ZACC 28", court: "Constitutional Court", year: 2009, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2009/28.html", summary: "The right of access to sufficient water under section 27. Upheld the City's free basic water policy of 6 kilolitres per household per month." },
  { title: "Alexkor Ltd v Richtersveld Community", citation: "[2003] ZACC 18", court: "Constitutional Court", year: 2003, tags: ["constitutional", "property law"], url: "https://www.saflii.org/za/cases/ZACC/2003/18.html", summary: "Indigenous law land rights. The Richtersveld community was dispossessed of ownership and minerals rights by racially discriminatory laws after 19 June 1913." },
  { title: "Juma Musjid Primary School v Essay NO", citation: "[2011] ZACC 13", court: "Constitutional Court", year: 2011, tags: ["constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2011/13.html", summary: "Right to basic education under section 29. Eviction of a public school from private property must consider the best interests of children." },

  // ── Supreme Court of Appeal ───────────────────────────────────────────
  { title: "Jowell v Bramwell-Jones", citation: "[1998] ZASCA 51", court: "Supreme Court of Appeal", year: 1998, tags: ["contract law"], url: "https://www.saflii.org/za/cases/ZASCA/1998/51.html", summary: "Estoppel in the context of contract law. A party who by representation causes another to alter their position to their detriment is estopped from denying the representation." },
  { title: "Afrox Healthcare v Strydom", citation: "[2002] ZASCA 73", court: "Supreme Court of Appeal", year: 2002, tags: ["contract law", "delict"], url: "https://www.saflii.org/za/cases/ZASCA/2002/73.html", summary: "Exemption clauses in hospital admission forms. The clause excluding liability for negligence was not contrary to public policy where freely agreed." },
  { title: "Carmichele v Minister of Safety and Security", citation: "[2001] ZACC 22", court: "Constitutional Court", year: 2001, tags: ["constitutional", "delict"], url: "https://www.saflii.org/za/cases/ZACC/2001/22.html", summary: "The State owes a duty of care to protect individuals from violent crime. Failure of police and prosecutors to act on known danger constitutes wrongfulness." },
  { title: "Everfresh Market Virginia v Shoprite Checkers", citation: "[2011] ZACC 30", court: "Constitutional Court", year: 2011, tags: ["contract law"], url: "https://www.saflii.org/za/cases/ZACC/2011/30.html", summary: "Good faith in contract negotiation. Duty to negotiate in good faith when a lease contains an option to renew subject to agreement on terms." },
  { title: "Bredenkamp v Standard Bank", citation: "[2010] ZASCA 75", court: "Supreme Court of Appeal", year: 2010, tags: ["contract law", "banking"], url: "https://www.saflii.org/za/cases/ZASCA/2010/75.html", summary: "Bank's right to close accounts. A bank may terminate a banking relationship on notice, provided the cancellation clause is exercised in good faith." },
  { title: "Van der Merwe v Road Accident Fund", citation: "[2006] ZACC 4", court: "Constitutional Court", year: 2006, tags: ["delict", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2006/4.html", summary: "Loss of support claim by unmarried partner in a same-sex relationship. Extending dependant's action to same-sex life partners." },
  { title: "Bothma-Batho Transport v S Bothma & Seun Transport", citation: "[2013] ZASCA 176", court: "Supreme Court of Appeal", year: 2013, tags: ["contract law"], url: "https://www.saflii.org/za/cases/ZASCA/2013/176.html", summary: "Contractual interpretation. Endorsed the integrated approach to interpretation requiring consideration of context, text and purpose together." },
  { title: "Natal Joint Municipal Pension Fund v Endumeni Municipality", citation: "[2012] ZASCA 13", court: "Supreme Court of Appeal", year: 2012, tags: ["contract law"], url: "https://www.saflii.org/za/cases/ZASCA/2012/13.html", summary: "Leading authority on interpretation of documents. The triad of text, context and purpose must be considered holistically in interpretation." },

  // ── Labour / Employment ───────────────────────────────────────────────
  { title: "NEHAWU v University of Cape Town", citation: "[2002] ZACC 27", court: "Constitutional Court", year: 2002, tags: ["employment", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2002/27.html", summary: "Right to fair labour practices. Section 23 of the Constitution applies to all workers and employers and protects the right to engage in collective bargaining." },
  { title: "Sidumo v Rustenburg Platinum Mines", citation: "[2007] ZACC 22", court: "Constitutional Court", year: 2007, tags: ["employment"], url: "https://www.saflii.org/za/cases/ZACC/2007/22.html", summary: "Standard of review of CCMA arbitration awards. A reviewing court must determine whether the commissioner's decision was one a reasonable decision-maker could reach." },
  { title: "National Union of Metalworkers of SA v Bader Bop", citation: "[2002] ZACC 30", court: "Constitutional Court", year: 2002, tags: ["employment", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2002/30.html", summary: "Right to strike under section 23(2)(c) of the Constitution. Minority trade unions have the right to strike in support of organisational rights demands." },
  { title: "Aviation Union of SA v SA Airways", citation: "[2011] ZACC 39", court: "Constitutional Court", year: 2011, tags: ["employment"], url: "https://www.saflii.org/za/cases/ZACC/2011/39.html", summary: "Transfer of undertaking under section 197 of the LRA. Employees' contracts transfer automatically to the new employer on transfer of a business as a going concern." },

  // ── Company law ───────────────────────────────────────────────────────
  { title: "Botha v Rich NO", citation: "[2014] ZACC 11", court: "Constitutional Court", year: 2014, tags: ["company law", "insolvency"], url: "https://www.saflii.org/za/cases/ZACC/2014/11.html", summary: "Business rescue proceedings under Chapter 6 of the Companies Act 71 of 2008. Practitioner's reasonable prospect of rescue standard." },
  { title: "Hlumisa Investment Holdings v Kirkinis", citation: "[2020] ZASCA 41", court: "Supreme Court of Appeal", year: 2020, tags: ["company law"], url: "https://www.saflii.org/za/cases/ZASCA/2020/41.html", summary: "Statutory derivative action under section 165 of the Companies Act. Shareholders may bring proceedings on behalf of the company against delinquent directors." },

  // ── Property ──────────────────────────────────────────────────────────
  { title: "Ndlovu v Ngcobo; Bekker v Jika", citation: "[2002] ZACC 29", court: "Constitutional Court", year: 2002, tags: ["property law"], url: "https://www.saflii.org/za/cases/ZACC/2002/29.html", summary: "Eviction under the Prevention of Illegal Eviction from and Unlawful Occupation of Land Act (PIE Act). Courts must consider all relevant circumstances including the rights of the elderly, children and disabled." },
  { title: "Port Elizabeth Municipality v Various Occupiers", citation: "[2004] ZACC 7", court: "Constitutional Court", year: 2004, tags: ["property law", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2004/7.html", summary: "PIE Act eviction. A court must have regard to the circumstances of the occupiers, how long they have resided, and the availability of alternative land." },
  { title: "Agri SA v Minister of Minerals and Energy", citation: "[2013] ZACC 9", court: "Constitutional Court", year: 2013, tags: ["property law"], url: "https://www.saflii.org/za/cases/ZACC/2013/9.html", summary: "Mineral rights under the MPRDA. The conversion of old order mineral rights to new order rights was not an arbitrary deprivation of property under section 25." },

  // ── Criminal ──────────────────────────────────────────────────────────
  { title: "S v Zuma", citation: "[1995] ZACC 1", court: "Constitutional Court", year: 1995, tags: ["criminal", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/1995/1.html", summary: "Right to a fair trial and privilege against self-incrimination under section 25(2) of the interim Constitution. Confession obtained without informing accused of right to counsel is inadmissible." },
  { title: "S v Thebus", citation: "[2003] ZACC 12", court: "Constitutional Court", year: 2003, tags: ["criminal"], url: "https://www.saflii.org/za/cases/ZACC/2003/12.html", summary: "Common purpose doctrine and constitutional validity. Active association and participation in the commission of a crime by a group satisfies the fault requirement." },
  { title: "S v Mhlungu", citation: "[1995] ZACC 4", court: "Constitutional Court", year: 1995, tags: ["criminal", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/1995/4.html", summary: "Application of the interim Constitution to pending criminal cases. The Constitution applies to all cases from the date it came into force." },
  { title: "S v Dodo", citation: "[2001] ZACC 16", court: "Constitutional Court", year: 2001, tags: ["criminal", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2001/16.html", summary: "Minimum sentences under the Criminal Law Amendment Act. Mandatory minimum sentences are constitutional provided courts retain a discretion in cases of substantial and compelling circumstances." },

  // ── Delict ────────────────────────────────────────────────────────────
  { title: "Minister of Safety and Security v Van Duivenboden", citation: "[2002] ZASCA 79", court: "Supreme Court of Appeal", year: 2002, tags: ["delict"], url: "https://www.saflii.org/za/cases/ZASCA/2002/79.html", summary: "State liability for police negligence. The SAPS owed a legal duty to protect the public from a known dangerous person who later shot the plaintiff." },
  { title: "Country Cloud Trading v MEC, Department of Infrastructure Development", citation: "[2014] ZACC 28", court: "Constitutional Court", year: 2014, tags: ["delict", "contract law"], url: "https://www.saflii.org/za/cases/ZACC/2014/28.html", summary: "Pure economic loss from unlawful administrative action. The State may be held delictually liable for economic loss caused by unlawful conduct." },
  { title: "Lee v Minister of Correctional Services", citation: "[2012] ZACC 30", court: "Constitutional Court", year: 2012, tags: ["delict", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2012/30.html", summary: "State liability for prisoner contracting TB in prison. The State has a constitutional duty to provide conditions of detention consistent with human dignity." },

  // ── Family law ────────────────────────────────────────────────────────
  { title: "Minister of Home Affairs v Fourie", citation: "[2005] ZACC 19", court: "Constitutional Court", year: 2005, tags: ["family law", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2005/19.html", summary: "Same-sex marriage. The common law definition of marriage and the Marriage Act were declared unconstitutional insofar as they failed to provide for same-sex couples to marry." },
  { title: "Gumede v President of the RSA", citation: "[2008] ZACC 23", court: "Constitutional Court", year: 2008, tags: ["family law", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2008/23.html", summary: "Customary marriage property rights. Section 7(1) of the Recognition of Customary Marriages Act discriminated unfairly against women married under customary law before the Act." },
  { title: "Bhe v Magistrate, Khayelitsha", citation: "[2004] ZACC 17", court: "Constitutional Court", year: 2004, tags: ["family law", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2004/17.html", summary: "Male primogeniture in customary law of succession. The rule that only the eldest male heir could inherit was declared unconstitutional for unfairly discriminating against women and children." },

  // ── Administrative law ────────────────────────────────────────────────
  { title: "Pharmaceutical Manufacturers Association of SA: In Re Ex Parte President of the RSA", citation: "[2000] ZACC 1", court: "Constitutional Court", year: 2000, tags: ["administrative", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2000/1.html", summary: "Principle of legality and rationality review of executive action. All exercises of public power must be rational and authorised by law." },
  { title: "Bato Star Fishing v Minister of Environmental Affairs", citation: "[2004] ZACC 15", court: "Constitutional Court", year: 2004, tags: ["administrative", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2004/15.html", summary: "Review of administrative action under PAJA. The standard of reasonableness applies and transformation objectives are relevant to the exercise of administrative discretion." },
  { title: "Albutt v Centre for the Study of Violence and Reconciliation", citation: "[2010] ZACC 4", court: "Constitutional Court", year: 2010, tags: ["administrative", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2010/4.html", summary: "Presidential pardon process. Victims of politically motivated crimes have a right to be heard before the President exercises the pardoning power." },

  // ── Banking / NCA ─────────────────────────────────────────────────────
  { title: "National Credit Regulator v Opperman", citation: "[2012] ZACC 29", court: "Constitutional Court", year: 2012, tags: ["banking", "consumer"], url: "https://www.saflii.org/za/cases/ZACC/2012/29.html", summary: "Reckless credit under the National Credit Act 34 of 2005. A credit agreement entered into recklessly may be declared void, and the debtor's obligations may be restructured." },
  { title: "Sebola v Standard Bank of South Africa", citation: "[2012] ZACC 11", court: "Constitutional Court", year: 2012, tags: ["banking", "property law"], url: "https://www.saflii.org/za/cases/ZACC/2012/11.html", summary: "Section 129 NCA notice must be delivered to the debtor's registered address. A credit provider must prove delivery before enforcing the credit agreement." },

  // ── Consumer protection ───────────────────────────────────────────────
  { title: "Eskom Holdings v Halstead-Cleak", citation: "[2016] ZASCA 150", court: "Supreme Court of Appeal", year: 2016, tags: ["consumer", "delict"], url: "https://www.saflii.org/za/cases/ZASCA/2016/150.html", summary: "Strict liability under the Consumer Protection Act 68 of 2008 for harm caused by defective goods, unsafe products or inadequate warnings." },

  // ── Tax ───────────────────────────────────────────────────────────────
  { title: "Commissioner for SARS v Brummeria Renaissance", citation: "[2007] ZASCA 99", court: "Supreme Court of Appeal", year: 2007, tags: ["tax"], url: "https://www.saflii.org/za/cases/ZASCA/2007/99.html", summary: "Interest-free loan as gross income. The right to use loan funds interest-free has an ascertainable money value that constitutes gross income under the Income Tax Act." },
  { title: "ITC 1890", citation: "[2016] ZATC 4", court: "Tax Court", year: 2016, tags: ["tax"], url: "https://www.saflii.org/za/cases/ZATC/2016/4.html", summary: "Transfer pricing and section 31 of the Income Tax Act. Arm's length pricing applied to cross-border transactions between connected persons." },

  // ── Insolvency ────────────────────────────────────────────────────────
  { title: "Investec Bank v Mutemeri", citation: "[2010] ZASCA 2", court: "Supreme Court of Appeal", year: 2010, tags: ["insolvency", "banking"], url: "https://www.saflii.org/za/cases/ZASCA/2010/2.html", summary: "Advantage to creditors requirement in compulsory sequestration. The applicant creditor must show a reasonable prospect of advantage to creditors from sequestration." },

  // ── Environmental ─────────────────────────────────────────────────────
  { title: "Fuel Retailers Association of SA v Director-General: Environmental Management", citation: "[2007] ZACC 13", court: "Constitutional Court", year: 2007, tags: ["environmental", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2007/13.html", summary: "Environmental right under section 24 of the Constitution. Sustainable development requires integration of socio-economic development and environmental protection." },

  // ── IP ────────────────────────────────────────────────────────────────
  { title: "Laugh It Off Promotions v SAB International", citation: "[2005] ZACC 7", court: "Constitutional Court", year: 2005, tags: ["intellectual property", "constitutional"], url: "https://www.saflii.org/za/cases/ZACC/2005/7.html", summary: "Freedom of expression versus trademark rights. A parody of a well-known trademark is protected expression unless the trademark owner proves likelihood of substantial economic harm." },
];

async function seed() {
  console.info(`[seed] Seeding ${CASES.length} landmark SA cases...`);
  let inserted = 0;

  for (const c of CASES) {
    // Ensure source record
    const srcRes = await pool.query(
      "select id from legal_corpus_sources where court_or_body = $1 and source_type = 'case_law' limit 1",
      [c.court]
    );
    let sourceId;
    if (srcRes.rowCount) {
      sourceId = srcRes.rows[0].id;
    } else {
      const ins = await pool.query(
        `insert into legal_corpus_sources (source_name, source_type, court_or_body, base_url, index_status, is_platform_corpus, document_count)
         values ($1, 'case_law', $2, 'https://www.saflii.org', 'indexed', true, 0) returning id`,
        [`SAFLII — ${c.court}`, c.court]
      );
      sourceId = ins.rows[0].id;
    }

    const exists = await pool.query(
      "select id from legal_corpus_documents where citation = $1 limit 1",
      [c.citation]
    );
    if (exists.rowCount) continue;

    await pool.query(
      `insert into legal_corpus_documents
        (source_id, title, citation, court, decision_date, jurisdiction, document_type,
         summary, full_text_snippet, source_url, tags, year)
       values ($1,$2,$3,$4,$5,'South Africa','judgment',$6,$7,$8,$9,$10)
       on conflict do nothing`,
      [
        sourceId, c.title, c.citation, c.court, `${c.year}-01-01`,
        c.summary, c.summary, c.url, c.tags, c.year
      ]
    );
    inserted++;
    console.info(`[seed]   ✓ ${c.citation} — ${c.title}`);
  }

  // Update counts
  const counts = await pool.query("select court, count(*) as cnt from legal_corpus_documents group by court");
  for (const r of counts.rows) {
    await pool.query(
      "update legal_corpus_sources set document_count = $2, last_indexed_at = now() where court_or_body = $1",
      [r.court, parseInt(r.cnt)]
    ).catch(() => {});
  }

  console.info(`[seed] Done — ${inserted} new cases inserted.`);
  await pool.end().catch(() => {});
}

seed().catch(err => { console.error("[seed] Fatal:", err); process.exit(1); });
