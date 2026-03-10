/**
 * Canadian MLS Feeds Compliance knowledge base.
 * Answers and official links derived from the 2026 Compliance Policy document.
 *
 * Note: The app currently uses canadian_mls.txt and CANADIAN_MLS.pdf for chat/DOCS.
 * This file is kept for reference or fallback.
 */

module.exports = {
  defaultAnswer: "I couldn't find a specific answer for that in the compliance guide. Try asking about a province (e.g. Ontario, BC, Quebec), a topic (e.g. DDF, VOW, PIPEDA, RECO), or a board (e.g. TRREB, CREA). I'll give you an answer and official links where possible.",
  sections: [
    {
      keywords: ['crea', 'ddf', 'national', 'realtor.ca', 'data distribution'],
      summary: 'Canada uses a federated MLS system. CREA oversees national coordination through REALTOR.ca. The DDF (Data Distribution Facility) is CREA\'s national feed of active listings for CREA members. Saskatchewan and Quebec do NOT participate in DDF.',
      answer: '**CREA & DDF (National)**\n\nCanada operates a federated MLS system. CREA oversees national coordination through REALTOR.ca. The **DDF** is CREA\'s national feed of active listings—accessible only to CREA members in good standing who are listed as DDF participants. Key rules: active listings only (no historical/sold on DDF), refresh at least every 24 hours, max 10 websites using DDF content, mandatory CREA footer on every page, watermarks must remain on photos. Saskatchewan and Quebec do NOT participate in DDF; agents must use SRA (Saskatchewan) or Centris (Quebec) directly.',
      links: [
        { label: 'CREA', url: 'https://www.crea.ca/' },
        { label: 'CREA DDF — Member Info & Policies', url: 'https://www.crea.ca/realtor-members/data-distribution-facility-ddf/' },
        { label: 'DDF Policy & Rules PDF (Feb 2024)', url: 'https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf' },
        { label: 'CREA DDF API Documentation', url: 'https://ddfapi-docs.realtor.ca/' },
        { label: 'CREA DDF Member Login', url: 'https://member.realtor.ca' },
        { label: 'REALTOR.ca', url: 'https://www.realtor.ca/' },
      ],
    },
    {
      keywords: ['ontario', 'trreb', 'proptx', 'toronto', 'vow', 'idx', 'gta'],
      summary: 'Ontario has four main feeds: TRREB/PropTx, ITSO, WECAR, and CREA DDF. TRREB is the largest board; PropTx distributes its data. VOW requires registration, email verification, and a VOW agreement.',
      answer: '**Ontario — TRREB / PropTx**\n\nTRREB is the largest board in Canada. Data is distributed via **PropTx**. Ontario has four primary feeds: TRREB (PropTx), ITSO, WECAR, and CREA DDF.\n\n**VOW (Virtual Office Website):** Sold/expired data cannot be shown to anonymous visitors. Users must register (full name, valid email), verify email, and agree to a VOW Terms of Use. 2026 update: must verify user is a genuine consumer, not a competitor.\n\n**Display:** Listing brokerage name must be on the first view; use "Listing provided by [Full Brokerage Name]". Watermarks must stay on all images. Expired/Withdrawn/Terminated listings must be removed within 24 hours. noindex/nofollow on all VOW-gated pages.',
      links: [
        { label: 'TRREB', url: 'https://trreb.ca/' },
        { label: 'PropTx', url: 'https://proptx.ca/' },
        { label: 'TRREB Member Hub', url: 'https://member.trreb.ca/' },
        { label: 'PropTx Member Profile', url: 'https://myprofile.torontomls.net/login' },
      ],
    },
    {
      keywords: ['itso', 'ontario central', 'northern ontario', 'idxs', 'vow fee'],
      summary: 'ITSO serves central and northern Ontario. VOW feed costs $1,500/year. IDX download limit: 100 current listings, 200 per search.',
      answer: '**ITSO (Information Technology Systems Ontario)**\n\nITSO serves central and northern Ontario with IDX and VOW feeds (~17,000+ unique listings). You must be a member of an ITSO-affiliated association. **VOW feed cost:** $1,500 annually (IDX is free for members). **IDX/VOW limit:** No more than 100 current listings per user and 200 listings per search. Non-compliance can result in administrative penalties, incident reports to the Professional Standards Committee, and MLS access suspension.',
      links: [
        { label: 'ITSO', url: 'https://www.itsosystems.ca/' },
        { label: 'ITSO System Access & Feed Info', url: 'https://www.itsosystems.ca/access' },
        { label: 'ITSO Professional Standards', url: 'https://www.itsosystems.ca/psc' },
      ],
    },
    {
      keywords: ['reco', 'ontario regulator', 'advertising', 'brokerage name', 'identification'],
      summary: 'RECO regulates Ontario real estate. Advertising must clearly identify the listing brokerage; consent to advertise required; strict rules on "sold" status and prohibited terms.',
      answer: '**RECO (Ontario)**\n\nRECO requires that any property advertisement clearly identify the **listing brokerage** (full legal name, prominent—often visible without scrolling). You cannot advertise without the seller\'s written consent. Do not show a property as "Sold" until the deal is firm and conditions waived; sold price disclosure generally requires consent and is why VOW login is used. You cannot claim "#1 Marketplace" or "Most Listings" without a verifiable, date-stamped source. Marketplaces helping connect consumers with agents should support RECO Information Guide acknowledgment.',
      links: [
        { label: 'RECO', url: 'https://www.reco.on.ca/' },
        { label: 'RECO Bulletin 5.1 — Advertising', url: 'https://www.reco.on.ca/' },
        { label: 'RECO Bulletin 5.3 — Online/Social', url: 'https://www.reco.on.ca/' },
      ],
    },
    {
      keywords: ['british columbia', 'bc', 'gvr', 'fvreb', 'cadreb', 'bridge', 'bridgeapi', 'reso'],
      summary: 'GVR, FVREB, and CADREB share data via BridgeAPI (RESO Web API). RETS deprecated Feb 2025. Compliance review required before production.',
      answer: '**British Columbia — GVR / FVREB / CADREB**\n\n**Access:** You must be a licensed REALTOR with GVR, CADREB, or FVREB. These three boards share data reciprocally—one connection gives all three. **RESO Web API (BridgeAPI):** RETS was deprecated (deadline Feb 28, 2025); all integrations must use RESO Web API via BridgeAPI. Your site must pass GVR compliance review before production credentials. Sold prices cannot be advertised before public registry availability or without consent; VOW participants must keep user records at least 180 days after password expiry.',
      links: [
        { label: 'GVR', url: 'https://www.gvrealtors.ca/' },
        { label: 'GVR Member Portal & BridgeAPI FAQ', url: 'https://member.gvrealtors.ca/en/newsletter/member-update-emails/transitioning-to-webapi-faq-for-vendors-and-developers.html' },
        { label: 'BridgeAPI (RESO)', url: 'https://www.bridgeinteractive.com/' },
        { label: 'FVREB', url: 'https://www.fvreb.bc.ca/' },
        { label: 'CADREB', url: 'https://www.cadreb.ca/' },
      ],
    },
    {
      keywords: ['bcfsa', 'bc regulator', 'brokerage name bc', 'next business day', 'sold purge'],
      summary: 'BCFSA requires full legal brokerage name, prominently displayed. Sold/rented ads must be removed by the next business day.',
      answer: '**BCFSA (BC regulator)**\n\n**Brokerage name:** Full legal name as registered with BCFSA; must be displayed prominently and easily readable (not in a tiny footer). **Real-time accuracy:** Once a property is sold or rented, the ad must be removed by the **next business day**—a 48–72 hour sync may violate BC rules. **Team names:** Must not imply the team is a brokerage; unlicensed assistants must be labeled. **Photos:** No digital enhancement that misrepresents condition; virtual staging requires a clear disclaimer. **HBRP:** BC has a 3-business-day rescission period; do not mark "Sold" until it has lapsed.',
      links: [
        { label: 'BCFSA', url: 'https://www.bcfsa.ca/' },
        { label: 'BCFSA Advertising Checklist', url: 'https://www.bcfsa.ca/' },
      ],
    },
    {
      keywords: ['alberta', 'creb', 'ereb', 'pillar 9', 'pillarnine', 'matrix'],
      summary: 'CREB and EREB use Pillar 9 (Matrix). IDX requires signed license agreement; full address needs VOW.',
      answer: '**Alberta — CREB / EREB / Pillar 9**\n\nCalgary (CREB) and Edmonton (EREB) use the **Pillar 9** provincial MLS platform (Matrix, RESO Gold). IDX requires a signed IDX license agreement (with broker signature) and board approval. Display of full street address requires a VOW. Listings must be removed within 24 hours of status change. Sold prices require written consent or must be gated behind a VOW.',
      links: [
        { label: 'CREB', url: 'https://www.creb.com/' },
        { label: 'Pillar 9', url: 'https://pillarnine.com/' },
      ],
    },
    {
      keywords: ['quebec', 'qpareb', 'centris', 'oaciq'],
      summary: 'Quebec does not participate in DDF. QPAREB/Centris; per-brokerage authentication.',
      answer: '**Quebec — QPAREB / Centris**\n\nQuebec does **not** participate in CREA DDF. Listings are accessed via **Centris** (QPAREB). Per-brokerage authentication is required. Verify current feed and display rules with QPAREB and OACIQ.',
      links: [
        { label: 'QPAREB', url: 'https://qpareb.ca/' },
        { label: 'Centris', url: 'https://www.centris.ca/' },
      ],
    },
    {
      keywords: ['saskatchewan', 'sra', 'sra mls'],
      summary: 'Saskatchewan does not participate in DDF. Must use SRA MLS directly.',
      answer: '**Saskatchewan — SRA**\n\nSaskatchewan does **not** participate in CREA DDF. You must access **SRA MLS** directly. Ensure you comply with SRA\'s feed and display requirements.',
      links: [
        { label: 'SRA', url: 'https://saskatchewanrealtorsassociation.ca/' },
      ],
    },
    {
      keywords: ['pipeda', 'privacy', 'personal information'],
      summary: 'PIPEDA governs collection, use, and disclosure of personal information.',
      answer: '**PIPEDA (Privacy)**\n\nFederal privacy law applies to collection, use, and disclosure of personal information in commercial activity. Obtain meaningful consent, use information only for stated purposes, and protect it with appropriate safeguards. VOW registration data (name, email, etc.) is subject to PIPEDA.',
      links: [],
    },
    {
      keywords: ['reso', 'rets', 'web api', 'data dictionary'],
      summary: 'RESO standards: RETS deprecated in favor of RESO Web API.',
      answer: '**RESO & Technical Standards**\n\nRESO (Real Estate Standards Organization) provides data standards. RETS has been deprecated; boards are moving to **RESO Web API**. Check your board\'s documentation for supported APIs and required compliance.',
      links: [],
    },
  ],
};
