const fs = require('fs');

// Helper to scan text and safely inject the Remote tag
function applyRemoteTag(tags, locationOrSource, title) {
  const combinedText = `${locationOrSource} ${title}`.toLowerCase();
  const cleanTags = [...new Set(tags)];
  
  if (combinedText.includes('remote') || combinedText.includes('wfh') || combinedText.includes('discord') || combinedText.includes('online')) {
    if (!cleanTags.includes('Remote')) {
      cleanTags.push('Remote');
    }
  }
  return cleanTags;
}

// Validation Gate: Filters out standard full-time postings to isolate actual gigs
function isContractGig(title, targetTags = []) {
  const combinedText = `${title} ${targetTags.join(' ')}`.toLowerCase();
  return (
    combinedText.includes('contract') || 
    combinedText.includes('freelance') || 
    combinedText.includes('gig') || 
    combinedText.includes('temporary') || 
    combinedText.includes('part-time') || 
    combinedText.includes('commission')
  );
}

// Helper to isolate or format budget/compensation data gracefully
function determineBudget(locationStr, compensationObj) {
  if (compensationObj && typeof compensationObj === 'string') return compensationObj;
  if (locationStr && locationStr.toLowerCase().includes('remote')) return "Contract / Remote";
  return locationStr || "Project Rate / TBD";
}

// --- ACTIVE CONTRACT TARGET MATRICES ---
const GREENHOUSE_GIG_TARGETS = [
  { id: "your_board_token", name: "Indie Studio Hub" }
];

const LEVER_GIG_TARGETS = [
  { id: "your_lever_token", name: "Global Outsourcer" }
];

const SMARTRECRUITERS_GIG_TARGETS = [
  { id: "Ubisoft", name: "Ubisoft Contracts" },
  { id: "PeopleCanFly", name: "People Can Fly Gigs" }
];

const ASHBY_GIG_TARGETS = [
  { id: "arenanet", name: "ArenaNet Outsourcing" }
];

// Manual micro-gigs (e.g. curated Discord listings, forum tasks)
const MANUAL_GIGS = [
  {
    title: "UI Pixel Artist (Short-Term Contract)",
    client: "Indie Studio Delta",
    budget: "$2,500 Milestone",
    url: "https://discord.gg/example",
    source: "Discord Jobs",
    tags: ["Contract", "2D Art"]
  }
];

// --- API EXTRACTION AND TRANSFORMATION PIPELINES ---

async function fetchGreenhouseGigs(companyId, companyName) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${companyId}/jobs`);
    if (!res.ok) return [];
    const data = await res.json();
    
    const validGigs = (data.jobs || []).filter(j => isContractGig(j.title));
    
    return validGigs.map(g => {
      const loc = g.location?.name || "Remote / US";
      return {
        title: g.title,
        client: companyName,
        budget: determineBudget(loc, null),
        url: g.absolute_url,
        source: "Greenhouse Engine",
        tags: applyRemoteTag(["Contract", "Outsourcing"], loc, g.title)
      };
    });
  } catch (e) {
    console.error(`Error filtering Greenhouse gigs for ${companyName}:`, e);
    return [];
  }
}

async function fetchLeverGigs(companyId, companyName) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${companyId}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    
    const validGigs = (data || []).filter(j => isContractGig(j.title, [j.categories?.commitment]));
    
    return validGigs.map(g => {
      const loc = g.categories?.location || "US Nationwide";
      const commitment = g.categories?.commitment || "Contract";
      return {
        title: g.title,
        client: companyName,
        budget: determineBudget(loc, null),
        url: g.hostedUrl,
        source: "Lever Board",
        tags: applyRemoteTag([commitment, "Freelance"], loc, g.title)
      };
    });
  } catch (e) {
    console.error(`Error filtering Lever gigs for ${companyName}:`, e);
    return [];
  }
}

async function fetchSmartRecruitersGigs(companyId, companyName) {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${companyId}/postings`);
    if (!res.ok) return [];
    const data = await res.json();
    
    const postings = data.content || [];
    const validGigs = postings.filter(j => isContractGig(j.name, [j.typeOfEmployment?.id]));
    
    return validGigs.map(g => {
      const isRemote = g.location?.remote ? "Remote" : "";
      const locStr = [g.location?.city, isRemote].filter(Boolean).join(", ") || "Global";
      const employmentType = g.typeOfEmployment?.label || "Contract";
      
      return {
        title: g.name,
        client: companyName,
        budget: determineBudget(locStr, null),
        url: g.postingUrl,
        source: "SmartRecruiters Stream",
        tags: applyRemoteTag([employmentType, "Asset Creation"], locStr, g.name)
      };
    });
  } catch (e) {
    console.error(`Error filtering SmartRecruiters gigs for ${companyName}:`, e);
    return [];
  }
}

async function fetchAshbyGigs(companyId, companyName) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${companyId}?includeCompensation=true`);
    if (!res.ok) return [];
    const data = await res.json();
    
    const jobs = data.jobs || [];
    const validGigs = jobs.filter(j => isContractGig(j.title, [j.employmentType]));
    
    return validGigs.map(g => {
      const locStr = g.locationName || "Remote";
      const compText = g.compensation?.compensationDescription || null;
      
      return {
        title: g.title,
        client: companyName,
        budget: determineBudget(locStr, compText),
        url: g.jobUrl,
        source: "Ashby Platform",
        tags: applyRemoteTag([g.employmentType || "Contract"], locStr, g.title)
      };
    });
  } catch (e) {
    console.error(`Error filtering Ashby gigs for ${companyName}:`, e);
    return [];
  }
}

// --- RUN ORCHESTRATOR LOOP ---

async function main() {
  console.log("Initializing Automated Game Dev Gig Aggregator Pipeline...");
  let aggregatedGigs = [];

  // Scrape Greenhouse Gig Targets
  for (const target of GREENHOUSE_GIG_TARGETS) {
    const gigs = await fetchGreenhouseGigs(target.id, target.name);
    aggregatedGigs.push(...gigs);
  }

  // Scrape Lever Gig Targets
  for (const target of LEVER_GIG_TARGETS) {
    const gigs = await fetchLeverGigs(target.id, target.name);
    aggregatedGigs.push(...gigs);
  }

  // Scrape SmartRecruiters Gig Targets
  for (const target of SMARTRECRUITERS_GIG_TARGETS) {
    const gigs = await fetchSmartRecruitersGigs(target.id, target.name);
    aggregatedGigs.push(...gigs);
  }

  // Scrape Ashby Gig Targets
  for (const target of ASHBY_GIG_TARGETS) {
    const gigs = await fetchAshbyGigs(target.id, target.name);
    aggregatedGigs.push(...gigs);
  }

  // Parse custom manual layout additions
  const processedManual = MANUAL_GIGS.map(g => ({
    ...g,
    tags: applyRemoteTag(g.tags, g.source, g.title)
  }));

  const allGigs = [...processedManual, ...aggregatedGigs];

  // Overwrite production gigs file archive
  fs.writeFileSync('gigs.json', JSON.stringify(allGigs, null, 2));
  console.log(`Successfully compiled gigs.json database with ${allGigs.length} filtered items.`);
}

main();