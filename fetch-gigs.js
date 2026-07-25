const fs = require('fs');
const path = require('path');

const EXCLUDED_KEYWORDS = [
  "senior", "sr", "lead", "director", "manager", "full time", "full-time",
  "permanent", "[for hire]", "l4h",
  "engineer", "engineering", "producer", "production coordinator",
  "cloud infrastructure", "devops", "site reliability",
  "backend developer", "backend engineer",
];

const FREELANCE_TRACKS = {
  "3D Game Art": [
    "3d artist", "3d modeler", "modeling", "modeler", "texturing",
    "texture artist", "rigging", "technical artist", "environment artist",
    "character artist", "vfx", "animator", "animation",
    "prop artist", "props artist", "prop modeling",
    "maya", "blender", "substance painter", "substance", "zbrush",
    "unreal", "unity", "game engine", "3d", "asset",
  ],
  "2D Game Art": [
    "2d artist", "illustrator", "concept artist", "concept art", "ui artist", "ui/ux",
    "ux designer", "graphic design", "character design",
    "environment design", "map design", "print production", "pixel art",
    "2d character", "skybox", "game rules", "layout design", "photoshop",
    "sprite", "2d art", "board game art", "tabletop art",
    "prop art", "prop design", "props design",
    "game designer", "game design", "level design", "level designer",
  ],
  "Vehicle / Product Design": [
    "automotive", "vehicle", "product design", "industrial design", "cad", "solidworks", "keyshot",
  ],
  "Medical / Simulation": [
    "medical", "biomedical", "simulation", "prosthetics", "anatomical",
  ],
  "Digital Playspaces": [
    "experimental media", "live media", "alternate controller",
    "accessibility", "board game design", "tabletop design", "board game", "tabletop", "card game",
    "installation", "interactive media", "physical computing",
    "game designer", "game design", "level design", "level designer",
    "unreal", "unity",
  ],
};

function isSeniorOrFullTime(title) {
  const t = title.toLowerCase();
  return EXCLUDED_KEYWORDS.some(keyword => t.includes(keyword));
}

function determineGigType(title) {
  const t = title.toLowerCase();
  if (t.includes('freelance') || t.includes('freelancer')) return 'Freelance';
  if (t.includes('commission')) return 'Commission';
  return 'Contract';
}

function classifyTracks(title) {
  const t = title.toLowerCase();
  return Object.entries(FREELANCE_TRACKS)
    .filter(([, keywords]) => keywords.some(k => t.includes(k)))
    .map(([trackName]) => trackName);
}

// ==========================================
// SOURCE 1: GOOGLE JOBS API (SERPAPI)
// ==========================================
async function fetchContractJobs() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const query = '"3d freelance" OR "game art contract" OR "3d asset commission" OR "2d concept contract" OR "board game freelance" OR "tabletop contract" OR "2d game art freelance" OR "board game illustrator" OR "character design freelance" OR "concept artist contract" OR "concept art commission" OR "prop artist contract" OR "prop art commission" OR "level design contract" OR "game designer freelance" OR "pixel artist freelance" OR "pixel art commission" -engineer -engineering -producer -"cloud infrastructure" -devops';
  const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(query)}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.jobs_results) return [];

    return data.jobs_results
      .filter(job => !isSeniorOrFullTime(job.title))
      .filter(job => classifyTracks(job.title).length > 0)
      .map(job => ({
        title: job.title,
        company: job.company_name,
        location: job.location || "Remote",
        url: job.related_links?.[0]?.link || job.apply_options?.[0]?.link || "https://www.google.com/search?q=" + encodeURIComponent(job.title),
        posted: new Date().toISOString().split('T')[0],
        tags: [determineGigType(job.title), ...classifyTracks(job.title)]
      }));
  } catch (error) {
    console.error("Error fetching gigs from SerpApi:", error);
    return [];
  }
}

// ==========================================
// SOURCE 2: DISCORD COMMUNITY CHANNELS
// ==========================================
// Replace placeholder strings with actual Server/Guild IDs and Channel IDs
const TARGET_CHANNELS = {
  "Game Dev League": { 
    guildId: "131495071477530624", 
    channelId: "123456789012345678" 
  }, 
  "Tabletop Design": { 
    guildId: "987654321098765432", 
    channelId: "888888888888888888" 
  }
};

async function fetchDiscordGigs() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.log("No Discord bot token found, skipping Discord stream.");
    return [];
  }

  let allGigs = [];

  for (const [serverName, config] of Object.entries(TARGET_CHANNELS)) {
    const url = `https://discord.com/api/v10/channels/${config.channelId}/messages?limit=50`;
    
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bot ${botToken}` }
      });
      const messages = await response.json();

      if (!Array.isArray(messages)) continue;

      // Filter for active community hiring opportunities that also match
      // an art/design curriculum track — same relevance bar as the other
      // sources, so off-topic posts (LFP programmers, etc.) don't leak in.
      const hiringMessages = messages.filter(msg => {
        const text = msg.content.toLowerCase();
        const looksLikeGig = (text.includes('hiring') || text.includes('looking for') || text.includes('paid') || text.includes('lfa') || text.includes('gig')) && !msg.author.bot;
        return looksLikeGig && classifyTracks(text).length > 0;
      });

      hiringMessages.forEach(msg => {
        // Parse the top line of the text block out for a clean card heading
        const firstLine = msg.content.split('\n')[0].substring(0, 60);
        const dynamicTitle = firstLine.trim() || `Gig on ${serverName}`;

        allGigs.push({
          title: dynamicTitle,
          company: `Community Post — ${serverName}`,
          location: "Remote / Discord",
          url: `https://discord.com/channels/${config.guildId}/${config.channelId}/${msg.id}`,
          posted: new Date(msg.timestamp).toISOString().split('T')[0],
          // Tags automatically evaluate the text payload to pull out tracks
          tags: ["Discord", determineGigType(msg.content), ...classifyTracks(msg.content)]
        });
      });
    } catch (error) {
      console.error(`Failed to fetch from Discord server [${serverName}]:`, error);
    }
  }
  return allGigs;
}

// ==========================================
// COMPILATION AND BOARD SAVE INTERACTION
// ==========================================
async function updateGigBoard() {
  const gigsPath = path.join(__dirname, 'gigs.html');
  if (!fs.existsSync(gigsPath)) return;

  // Pull asynchronously from both networks
  const [newGigsFromSerp, newGigsFromDiscord] = await Promise.all([
    fetchContractJobs(),
    fetchDiscordGigs()
  ]);
  
  const newGigs = [...newGigsFromSerp, ...newGigsFromDiscord];

  let html = fs.readFileSync(gigsPath, 'utf8');
  const regex = /manualListings:\s*\[([\s\S]*?)\]\s*,/;
  const match = html.match(regex);
  if (!match) return;

  let existingGigs = [];
  try {
    existingGigs = new Function(`return [${match[1]}]`)();
  } catch (e) {
    console.error("Error parsing existing manual gigs within HTML source code:", e);
    return;
  }

  const combined = [...existingGigs];

  newGigs.forEach(gig => {
    if (!combined.some(g => g.url === gig.url)) combined.push(gig);
  });

  // Balance board freshness by trimming items older than 45 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 45);

  const activeGigs = combined.filter(g => new Date(g.posted) >= cutoff);
  const updatedHtml = html.replace(regex, `manualListings: ${JSON.stringify(activeGigs, null, 4)},`);
  
  fs.writeFileSync(gigsPath, updatedHtml, 'utf8');
  console.log(`Synced gigs.html successfully. Total listings stored: ${activeGigs.length}`);
}

updateGigBoard();
