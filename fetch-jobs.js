const fs = require('fs');
const path = require('path');

// Keywords that must NOT be present in the title (blocks senior/management roles)
const EXCLUDED_KEYWORDS = [
  "senior", "sr", "lead", "director", "manager", 
  "principal", "staff", "head of", "chief", "expert", "experienced"
];

const CURRICULUM_TRACKS = {
  "3D Game Art": [
    "3d artist", "3d modeler", "modeling", "modeler", "texturing",
    "texture artist", "rigging", "technical artist", "environment artist",
    "character artist", "vfx", "animator", "animation",
    "prop artist", "props artist", "prop modeling",
    "maya", "blender", "substance painter", "substance", "zbrush",
    "unreal", "unity", "game engine", "3d"
  ],
  "2D Game Art": [
    "2d artist", "illustrator", "concept artist", "concept art", "ui artist", "ui/ux",
    "ux designer", "graphic design", "character design",
    "environment design", "map design", "print production", "pixel art",
    "2d character", "skybox", "game rules", "layout design", "photoshop",
    "board game art", "tabletop art", "prop art", "prop design", "props design",
    "game designer", "game design", "level design", "level designer"
  ],
  "Vehicle / Product Design": [
    "automotive", "vehicle", "product design", "industrial design", "cad", "solidworks", "keyshot"
  ],
  "Medical / Simulation": [
    "medical", "biomedical", "simulation", "prosthetics", "anatomical"
  ],
  "Digital Playspaces": [
    "experimental media", "live media", "alternate controller",
    "accessibility", "board game design", "tabletop design", "board game", "tabletop",
    "installation", "interactive media", "physical computing",
    "game designer", "game design", "level design", "level designer",
    "unreal", "unity"
  ]
};

function isSeniorOrManagement(title) {
  const t = title.toLowerCase();
  return EXCLUDED_KEYWORDS.some(keyword => t.includes(keyword));
}

function determineJobTypeTag(title) {
  const t = title.toLowerCase();
  if (t.includes('co-op') || t.includes('co op')) return 'Co-Op';
  if (t.includes('intern') || t.includes('internship') || t.includes('apprentice') || t.includes('trainee')) return 'Internship';
  if (t.includes('entry') || t.includes('junior')) return 'Entry-Level';
  return 'Internship';
}

function classifyTracks(title) {
  const t = title.toLowerCase();
  return Object.entries(CURRICULUM_TRACKS)
    .filter(([, keywords]) => keywords.some(k => t.includes(k)))
    .map(([trackName]) => trackName);
}

async function fetchGoogleJobs() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.log("No SerpApi key found, skipping automated external fetch.");
    return [];
  }

  // OPTIMIZED QUERY: Added board game, tabletop, and 2d game art entry targets
  const query = "3d artist intern OR 3d modeler entry level OR junior 3d designer OR product design junior OR 3d art apprentice OR game design apprentice OR board game intern OR tabletop junior OR 2d game art intern OR board game designer entry level OR character design intern OR concept artist junior OR concept art intern OR prop artist intern OR game designer entry level OR level design intern OR pixel artist intern OR pixel art junior";
  const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(query)}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.jobs_results) return [];

    const filteredJobs = data.jobs_results.filter(job => !isSeniorOrManagement(job.title));

    return filteredJobs.map(job => {
      const typeTag = determineJobTypeTag(job.title);
      const tracks = classifyTracks(job.title);
      
      return {
        title: job.title,
        company: job.company_name,
        location: job.location || "Remote",
        url: job.related_links?.[0]?.link || job.apply_options?.[0]?.link || "https://www.google.com/search?q=" + encodeURIComponent(job.title),
        posted: new Date().toISOString().split('T')[0],
        tags: [typeTag, ...tracks]
      };
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return [];
  }
}

async function updateBoard() {
  const newJobs = await fetchGoogleJobs();
  const indexPath = path.join(__dirname, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error(`Could not find index.html at expected path: ${indexPath}`);
    return;
  }

  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const regex = /manualListings:\s*\[([\s\S]*?)\]\s*,/;
  const match = indexHtml.match(regex);

  if (!match) {
    console.error("Could not find the 'manualListings' block inside index.html configuration.");
    return;
  }

  let existingListings = [];
  try {
    existingListings = new Function(`return [${match[1]}]`)();
  } catch (e) {
    console.error("Error parsing existing manual listings within HTML source code:", e);
    return;
  }

  const combinedListings = [...existingListings];
  newJobs.forEach(newJob => {
    const spaceDeduplicated = combinedListings.some(job => job.url === newJob.url);
    if (!spaceDeduplicated) {
      combinedListings.push(newJob);
    }
  });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 60);

  const cleanActiveListings = combinedListings.filter(job => {
    const postDate = new Date(job.posted);
    return postDate >= cutoffDate;
  });

  const formattedArrayString = JSON.stringify(cleanActiveListings, null, 4);
  const updatedHtml = indexHtml.replace(regex, `manualListings: ${formattedArrayString},`);
  
  fs.writeFileSync(indexPath, updatedHtml, 'utf8');
  console.log(`Successfully synced and updated index.html. Total items in manualListings: ${cleanActiveListings.length}`);
}

updateBoard();
