const fs = require('fs');

// Helper to scan text and safely inject the Remote tag
function applyRemoteTag(tags, location, title) {
  const combinedText = `${location} ${title}`.toLowerCase();
  const cleanTags = [...new Set(tags)];
  
  if (combinedText.includes('remote') || combinedText.includes('wfh') || combinedText.includes('anywhere')) {
    if (!cleanTags.includes('Remote')) {
      cleanTags.push('Remote');
    }
  }
  return cleanTags;
}

// Manual adjustments or studios without open API streams
const MANUAL_JOBS = [
  {
    title: "Junior Technical Artist",
    company: "Believer Games",
    location: "Los Angeles, CA (Hybrid)",
    url: "https://www.believer.gg/careers",
    posted: new Date().toISOString(),
    tags: ["Full-Time", "Technical Art"]
  }
];

// --- STUDIO TARGET CONFIGURATIONS ---
// Simply add a row to expand your tracking footprint instantly!

const GREENHOUSE_TARGETS = [
  { id: "your_board_token", name: "Greenhouse Partner" }
];

const LEVER_TARGETS = [
  { id: "your_lever_token", name: "Lever Partner" }
];

const SMARTRECRUITERS_TARGETS = [
  { id: "Ubisoft", name: "Ubisoft" },
  { id: "PeopleCanFly", name: "People Can Fly" }
];

const ASHBY_TARGETS = [
  { id: "arenanet", name: "ArenaNet" }
];

// --- API IMPLEMENTATION MODULES ---

async function fetchGreenhouse(companyId, companyName) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${companyId}/jobs`);
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data.jobs || []).map(j => {
      const loc = j.location?.name || "Remote / US";
      return {
        title: j.title,
        company: companyName,
        location: loc,
        url: j.absolute_url,
        posted: j.updated_at || new Date().toISOString(),
        tags: applyRemoteTag(["Greenhouse", "Entry-Level"], loc, j.title)
      };
    });
  } catch (e) {
    console.error(`Error fetching Greenhouse for ${companyName}:`, e);
    return [];
  }
}

async function fetchLever(companyId, companyName) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${companyId}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data || []).map(j => {
      const loc = j.categories?.location || "US Nationwide";
      return {
        title: j.title,
        company: companyName,
        location: loc,
        url: j.hostedUrl,
        posted: new Date(j.createdAt).toISOString(),
        tags: applyRemoteTag(["Lever", "Internship"], loc, j.title)
      };
    });
  } catch (e) {
    console.error(`Error fetching Lever for ${companyName}:`, e);
    return [];
  }
}

async function fetchSmartRecruiters(companyId, companyName) {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${companyId}/postings`);
    if (!res.ok) return [];
    const data = await res.json();
    const postings = data.content || [];
    
    return postings.map(j => {
      const isRemote = j.location?.remote ? "Remote" : "";
      const city = j.location?.city || "";
      const country = j.location?.country || "";
      const locStr = [city, country, isRemote].filter(Boolean).join(", ") || "US / Global";
      
      return {
        title: j.name,
        company: companyName,
        location: locStr,
        url: j.postingUrl,
        posted: j.releasedDate || new Date().toISOString(),
        tags: applyRemoteTag(["SmartRecruiters", "Entry-Level"], locStr, j.name)
      };
    });
  } catch (e) {
    console.error(`Error fetching SmartRecruiters for ${companyName}:`, e);
    return [];
  }
}

async function fetchAshby(companyId, companyName) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${companyId}?includeCompensation=true`);
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.jobs || [];
    
    return jobs.map(j => {
      const locStr = j.location || j.locationName || `${j.workplaceType || "Global"}`;
      return {
        title: j.title,
        company: companyName,
        location: locStr,
        url: j.jobUrl,
        posted: j.publishedAt || new Date().toISOString(),
        tags: applyRemoteTag(["Ashby", j.employmentType || "Entry-Level"], locStr, j.title)
      };
    });
  } catch (e) {
    console.error(`Error fetching Ashby for ${companyName}:`, e);
    return [];
  }
}

// --- MAIN RUN ORCHESTRATOR ---

async function main() {
  console.log("Starting Server-Side Multi-ATS Scanning Loop...");
  let aggregatedJobs = [];

  // 1. Process Greenhouse Targets
  for (const target of GREENHOUSE_TARGETS) {
    const jobs = await fetchGreenhouse(target.id, target.name);
    aggregatedJobs.push(...jobs);
  }

  // 2. Process Lever Targets
  for (const target of LEVER_TARGETS) {
    const jobs = await fetchLever(target.id, target.name);
    aggregatedJobs.push(...jobs);
  }

  // 3. Process SmartRecruiters Targets
  for (const target of SMARTRECRUITERS_TARGETS) {
    const jobs = await fetchSmartRecruiters(target.id, target.name);
    aggregatedJobs.push(...jobs);
  }

  // 4. Process Ashby Targets
  for (const target of ASHBY_TARGETS) {
    const jobs = await fetchAshby(target.id, target.name);
    aggregatedJobs.push(...jobs);
  }
  
  // Clean manual entries through the tag engine
  const processedManual = MANUAL_JOBS.map(j => ({
    ...j,
    tags: applyRemoteTag(j.tags, j.location, j.title)
  }));
  
  const allJobs = [...processedManual, ...aggregatedJobs];
  
  fs.writeFileSync('jobs.json', JSON.stringify(allJobs, null, 2));
  console.log(`Successfully generated jobs.json with ${allJobs.length} live listings.`);
}

main();