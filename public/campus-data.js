'use strict';
/*
 * OwlPark campus model: KSU Kennesaw and Marietta campuses.
 * Names and relative positions come from KSU's official parking maps
 * (Kennesaw updated 8/12/2026, Marietta updated 8/7/2026). The maps are schematic: not to scale.
 * Each lot is a sensor-equipped pilot section (rows x cols), not the whole deck.
 *
 * Lot ids and sizes must match data/lots.json (the server's sensor registry).
 * Sensor id = `${lot.id}-${row letter}${number}`, e.g. east-deck-A1.
 *
 * x, y = top-left corner in the campus map's coordinates (viewBox 0 0 w h).
 * area = KSU permit area label; permits = PERMIT_TYPES ids that may park there.
 */
// KSU permit types, from the legends of the official parking maps. KSU says each permit is
// valid for one parking area and is reciprocal on both campuses, so a permit unlocks the
// lots of that area on Kennesaw AND Marietta. group = audience (used by v1 and the dashboard default).
const PERMIT_TYPES = [
  { id: 'central',      name: 'Central',            group: 'student' },
  { id: 'east',         name: 'East',               group: 'student' },
  { id: 'west',         name: 'West',               group: 'student' },
  { id: 'north',        name: 'North Commuter',     group: 'student' },
  { id: 'east-economy', name: 'East Economy',       group: 'student' },
  { id: 'town-point',   name: 'Town Point Economy', group: 'student' },
  { id: 'south-lot',    name: 'South Lot',          group: 'student' },
  { id: 'faculty',      name: 'Faculty/Staff',      group: 'faculty' },
  { id: 'visitor',      name: 'Visitor (no permit)', group: 'visitor' },
];

const CAMPUSES = [
  {
    id: 'kennesaw', name: 'Kennesaw', address: '1000 Chastain Rd, Kennesaw', w: 1000, h: 1000,
    mpp: 1.3, hub: 'carmichael', cartouche: [18, 18, 168], compass: [950, 948],
    roads: [
      { d: 'M920 0 L965 500 L1000 760', hwy: true, label: 'I-75', shield: '75', at: [944, 250], rot: 84.9 },
      { d: 'M800 0 L870 500 L900 738', label: 'Frey Rd', at: [828, 200], rot: 82 },
      { d: 'M1000 738 L610 738', label: 'Chastain Rd NW', at: [790, 738] },
      { d: 'M200 0 L200 800 Q200 840 240 840 L560 840 L610 738', label: 'Campus Loop Rd', at: [200, 620], rot: -90 },
    ],
    greens: [{ x: 420, y: 420, w: 170, h: 70, label: 'Campus Green' }],
  },
  {
    id: 'marietta', name: 'Marietta', address: '1100 S. Marietta Pkwy, Marietta', w: 1000, h: 680,
    mpp: 1.2, hub: 'jmw-student-center', cartouche: [18, 590, 190], compass: [905, 630],
    roads: [
      { d: 'M0 95 Q120 18 260 18 L1000 18', hwy: true, label: 'South Marietta Pkwy', at: [640, 18] },
      { d: 'M935 110 L990 680', hwy: true, label: 'Cobb Pkwy · US 41', at: [962, 420], rot: 84.5 },
      { d: 'M220 163 L690 163', label: 'Rossbacher Way', at: [420, 163] },
      { d: 'M225 240 L225 660', label: 'Polytechnic Ln', at: [225, 560], rot: -90 },
    ],
    greens: [{ x: 640, y: 570, w: 110, h: 80, label: 'Kelly Field' }],
  },
];

const LOTS = [
  // ---------------- Kennesaw ----------------
  { id: 'north-deck',   campus: 'kennesaw', name: 'North Deck',          short: 'North Deck',   code: 'ND', kind: 'Parking deck', area: 'North Commuter',     permits: ['north'],            rows: 4, cols: 10, x: 230, y: 30,  demand: 0.9 },
  { id: 'lot-l',        campus: 'kennesaw', name: 'Lot L',               short: 'Lot L',        code: 'LL', kind: 'Surface lot',  area: 'Faculty/Staff',      permits: ['faculty'],            rows: 3, cols: 8,  x: 20,  y: 170, demand: 0.85 },
  { id: 'central-deck', campus: 'kennesaw', name: 'Central Deck',        short: 'Central Deck', code: 'CD', kind: 'Parking deck', area: 'Central',            permits: ['central'], rows: 4, cols: 12, x: 450, y: 110, demand: 1.08 },
  { id: 'v2-visitor',   campus: 'kennesaw', name: 'V2 Visitor Lot',      short: 'V2 Visitor',   code: 'V2', kind: 'Surface lot',  area: 'Visitor',            permits: ['visitor'],            rows: 3, cols: 6,  x: 570, y: 255, demand: 0.75 },
  { id: 'west-deck',    campus: 'kennesaw', name: 'West Deck',           short: 'West Deck',    code: 'WD', kind: 'Parking deck', area: 'West',               permits: ['west'], rows: 5, cols: 8,  x: 20,  y: 470, demand: 1.0 },
  { id: 'lot-b',        campus: 'kennesaw', name: 'Lot B',               short: 'Lot B',        code: 'LB', kind: 'Surface lot',  area: 'Faculty/Staff',      permits: ['faculty'],            rows: 4, cols: 10, x: 400, y: 560, demand: 0.85 },
  { id: 'east-deck',    campus: 'kennesaw', name: 'East Deck',           short: 'East Deck',    code: 'ED', kind: 'Parking deck', area: 'East',               permits: ['east'], rows: 5, cols: 10, x: 650, y: 560, demand: 0.95 },
  { id: 'west-lot',     campus: 'kennesaw', name: 'West Lot',            short: 'West Lot',     code: 'WL', kind: 'Surface lot',  area: 'West',               permits: ['west'],            rows: 3, cols: 8,  x: 20,  y: 660, demand: 0.8 },
  { id: 'east-economy', campus: 'kennesaw', name: 'East Economy Lot',    short: 'East Economy', code: 'EE', kind: 'Surface lot',  area: 'East Economy',       permits: ['east-economy'],            rows: 4, cols: 12, x: 640, y: 770, demand: 0.7 },
  { id: 'town-point',   campus: 'kennesaw', name: 'Town Point Economy',  short: 'Town Point',   code: 'TP', kind: 'Surface lot',  area: 'Town Point Economy', permits: ['town-point'],            rows: 4, cols: 10, x: 380, y: 860, demand: 0.6 },
  // ---------------- Marietta ----------------
  { id: 'mar-central-1', campus: 'marietta', name: 'Central Lot 1',      short: 'Central Lot 1', code: 'MC1', kind: 'Surface lot',  area: 'Central',       permits: ['central'],            rows: 3, cols: 12, x: 290, y: 50,  demand: 1.05 },
  { id: 'mar-central-2', campus: 'marietta', name: 'Central Lot 2',      short: 'Central Lot 2', code: 'MC2', kind: 'Surface lot',  area: 'Central',       permits: ['central'],                       rows: 4, cols: 10, x: 20,  y: 110, demand: 0.85 },
  { id: 'mar-lot-y',     campus: 'marietta', name: 'Lot Y',              short: 'Lot Y',         code: 'MLY', kind: 'Surface lot',  area: 'Faculty/Staff', permits: ['faculty'],                       rows: 3, cols: 6,  x: 535, y: 50,  demand: 0.85 },
  { id: 'mar-east-1',    campus: 'marietta', name: 'East Lot 1',         short: 'East Lot 1',    code: 'ME1', kind: 'Surface lot',  area: 'East',          permits: ['east'],            rows: 3, cols: 8,  x: 675, y: 50,  demand: 1.0 },
  { id: 'mar-east-2',    campus: 'marietta', name: 'East Lot 2',         short: 'East Lot 2',    code: 'ME2', kind: 'Surface lot',  area: 'East',          permits: ['east'],                       rows: 4, cols: 10, x: 690, y: 175, demand: 0.9 },
  { id: 'mar-visitor',   campus: 'marietta', name: 'Visitor Parking',    short: 'Visitor',       code: 'MV', kind: 'Surface lot',  area: 'Visitor',       permits: ['visitor'],                       rows: 2, cols: 6,  x: 545, y: 175, demand: 0.75 },
  { id: 'mar-west-deck', campus: 'marietta', name: 'West Deck (Marietta)', short: 'West Deck',   code: 'MWD', kind: 'Parking deck', area: 'West · Visitor on level 2', permits: ['west', 'visitor'], rows: 4, cols: 10, x: 20, y: 330, demand: 1.0 },
  { id: 'mar-south-lot', campus: 'marietta', name: 'South Lot',          short: 'South Lot',     code: 'MSL', kind: 'Surface lot',  area: 'South Lot',     permits: ['south-lot'],                       rows: 3, cols: 10, x: 400, y: 560, demand: 0.65 },
  { id: 'mar-lot-e',     campus: 'marietta', name: 'Lot E',              short: 'Lot E',         code: 'MLE', kind: 'Surface lot',  area: 'Faculty/Staff', permits: ['faculty'],                       rows: 3, cols: 6,  x: 760, y: 470, demand: 0.8 },
];

const PLACES = [
  // ---------------- Kennesaw ----------------
  { id: 'carmichael',      campus: 'kennesaw', name: 'Carmichael Student Center',  x: 340, y: 300, w: 125, h: 50 },
  { id: 'sturgis',         campus: 'kennesaw', name: 'Sturgis Library',            x: 225, y: 290, w: 100, h: 40 },
  { id: 'social-sciences', campus: 'kennesaw', name: 'Social Sciences Building',   x: 25,  y: 380, w: 150, h: 40 },
  { id: 'visual-arts',     campus: 'kennesaw', name: 'Visual Arts',                x: 25,  y: 300, w: 150, h: 36 },
  { id: 'bailey-pac',      campus: 'kennesaw', name: 'Bailey Performance Center',  x: 225, y: 180, w: 130, h: 40 },
  { id: 'english',         campus: 'kennesaw', name: 'English Building',           x: 225, y: 240, w: 100, h: 36 },
  { id: 'prillaman',       campus: 'kennesaw', name: 'Prillaman Health Sciences',  x: 450, y: 250, w: 105, h: 44 },
  { id: 'commons',         campus: 'kennesaw', name: 'The Commons',                x: 715, y: 250, w: 100, h: 36 },
  { id: 'bagwell',         campus: 'kennesaw', name: 'Bagwell Education Building', x: 715, y: 300, w: 110, h: 44 },
  { id: 'kennesaw-hall',   campus: 'kennesaw', name: 'Kennesaw Hall',              x: 715, y: 365, w: 105, h: 36 },
  { id: 'math-stats',      campus: 'kennesaw', name: 'Math & Statistics',          x: 225, y: 345, w: 100, h: 36 },
  { id: 'burruss',         campus: 'kennesaw', name: 'Burruss Building',           x: 575, y: 375, w: 100, h: 36 },
  { id: 'science',         campus: 'kennesaw', name: 'Science Building',           x: 225, y: 400, w: 100, h: 36 },
  { id: 'convocation',     campus: 'kennesaw', name: 'Convocation Center',         x: 730, y: 420, w: 120, h: 50 },
  { id: 'clendenin',       campus: 'kennesaw', name: 'Clendenin Building',         x: 225, y: 455, w: 100, h: 36 },
  { id: 'siegel',          campus: 'kennesaw', name: 'Siegel Recreation Center',   x: 610, y: 500, w: 130, h: 44 },
  { id: 'science-lab',     campus: 'kennesaw', name: 'Science Laboratory',         x: 225, y: 510, w: 100, h: 36 },
  { id: 'mickey-dunn',     campus: 'kennesaw', name: 'Mickey Dunn Stadium',        x: 400, y: 700, w: 150, h: 44 },
  { id: 'austin',          campus: 'kennesaw', name: 'Austin Residence Complex',   x: 225, y: 720, w: 140, h: 44 },
  { id: 'admissions',      campus: 'kennesaw', name: 'Town Point (Admissions)',    x: 595, y: 905, w: 110, h: 40 },
  // ---------------- Marietta ----------------
  { id: 'jmw-student-center', campus: 'marietta', name: 'Joe Mack Wilson Student Center', x: 330, y: 175, w: 140, h: 46 },
  { id: 'rec-wellness',    campus: 'marietta', name: 'Recreation & Wellness Center',  x: 855, y: 55,  w: 125, h: 44 },
  { id: 'administration',  campus: 'marietta', name: 'Administration Building',       x: 432, y: 236, w: 100, h: 40 },
  { id: 'mathematics',     campus: 'marietta', name: 'Mathematics Building',          x: 240, y: 250, w: 110, h: 36 },
  { id: 'shore',           campus: 'marietta', name: 'Shore Innovation Center',       x: 560, y: 270, w: 120, h: 40 },
  { id: 'etc',             campus: 'marietta', name: 'Engineering Technology Center', x: 40,  y: 270, w: 160, h: 40 },
  { id: 'crawford',        campus: 'marietta', name: 'Crawford Lab',                  x: 240, y: 305, w: 100, h: 34 },
  { id: 'johnson-library', campus: 'marietta', name: 'Johnson Library',               x: 360, y: 295, w: 130, h: 44 },
  { id: 'norton',          campus: 'marietta', name: 'Norton Hall',                   x: 515, y: 330, w: 90,  h: 34 },
  { id: 'university-commons', campus: 'marietta', name: 'University Commons',         x: 820, y: 330, w: 115, h: 40 },
  { id: 'academic',        campus: 'marietta', name: 'Academic Building',             x: 340, y: 365, w: 120, h: 36 },
  { id: 'design',          campus: 'marietta', name: 'Design 1 Building',             x: 250, y: 420, w: 110, h: 36 },
  { id: 'atrium',          campus: 'marietta', name: 'Atrium Building',               x: 400, y: 425, w: 110, h: 36 },
  { id: 'architecture',    campus: 'marietta', name: 'Architecture Building',         x: 620, y: 445, w: 110, h: 36 },
  { id: 'hornet-village',  campus: 'marietta', name: 'Hornet Village',                x: 60,  y: 480, w: 140, h: 36 },
  { id: 'textile',         campus: 'marietta', name: 'Textile Center',                x: 470, y: 480, w: 130, h: 44 },
  { id: 'event-center',    campus: 'marietta', name: 'Event Center',                  x: 620, y: 505, w: 110, h: 36 },
  { id: 'cee',             campus: 'marietta', name: 'Civil & Environmental Engineering', x: 240, y: 510, w: 140, h: 40 },
  { id: 'wilder',          campus: 'marietta', name: 'Wilder Communications Center',  x: 240, y: 590, w: 140, h: 40 },
];

// ---------------------------------------------------------------------------
// Big Owl Bus: KSU's free shuttle. Routes, stop order and hours are from KSU's
// "Fall 2026 Routes" page (campus.kennesaw.edu/offices-services/parking/big-owl-bus/shuttle-routes.php).
// KSU does not publish frequencies or the Kennesaw–Marietta trip time, so `headway` and
// `intercampusMin` are DEMO ASSUMPTIONS; the app says so and points riders to Passio GO! for live times.
// Stops with x/y are drawn on that campus map; stops without x/y are off the OwlPark maps.
// via['a>b'] = map waypoints between consecutive stops a and b (otherwise an L-shaped path).
// `service` = Monday–Thursday hours in minutes since midnight (the demo clock has no weekday).
// ---------------------------------------------------------------------------
const BUS_STOPS = [
  { id: 'k-rec',          campus: 'kennesaw', name: 'KSU Bookstore/Rec Center', x: 598, y: 505 },
  { id: 'k-commons',      campus: 'kennesaw', name: 'The Commons',              x: 706, y: 268 },
  { id: 'k-north',        campus: 'kennesaw', name: 'North Residential',        x: 437, y: 60 },
  { id: 'k-marietta-dr',  campus: 'kennesaw', name: 'Marietta Drive',           x: 216, y: 640 },
  { id: 'k-town-point',   campus: 'kennesaw', name: 'Town Point',               x: 586, y: 882 },
  { id: 'k-science-math', campus: 'kennesaw', name: 'Science & Mathematics Building', x: 336, y: 418 },
  { id: 'k-art',          campus: 'kennesaw', name: 'School of Art',            x: 100, y: 358 },
  { id: 'k-dance',        campus: 'kennesaw', name: 'Department of Dance' },
  { id: 'k-gutenberg',    campus: 'kennesaw', name: 'Gutenberg' },
  { id: 'k-ksu-center',   campus: 'kennesaw', name: 'KSU Center' },
  { id: 'k-busbee',       campus: 'kennesaw', name: 'Busbee Park and Ride (Shuttle Lot)' },
  { id: 'm-student-center', campus: 'marietta', name: 'Marietta Student Center',  x: 480, y: 200 },
  { id: 'm-shore',        campus: 'marietta', name: 'Shore Innovation Center',  x: 628, y: 320 },
  { id: 'm-courtyard',    campus: 'marietta', name: 'University Courtyard',     x: 805, y: 314 },
  { id: 'm-hornet-village', campus: 'marietta', name: 'Hornet Village',         x: 130, y: 528 },
  { id: 'm-shuttle-lot',  campus: 'marietta', name: 'Shuttle Lot' },
  { id: 'm-columns',      campus: 'marietta', name: 'University Columns' },
  { id: 'm-hornet-hub',   campus: 'marietta', name: 'Hornet Hub',               x: 120, y: 254 },
];

const BUS_ROUTES = [
  { id: 'km', name: 'Kennesaw/Marietta Route', short: 'Kennesaw ↔ Marietta', color: '#c98a00',
    stops: ['k-commons', 'k-rec', 'm-student-center'], headway: 20, intercampusMin: 25,
    service: [420, 1410], hours: ['Mon–Thu 7:00 AM – 11:30 PM', 'Fri 7:00 AM – 7:00 PM', 'Sat 12:00 PM – 7:00 PM'] },
  { id: 'k-loop', name: 'Kennesaw Loop Route', short: 'Kennesaw Loop', color: '#2563eb',
    stops: ['k-rec', 'k-commons', 'k-north', 'k-marietta-dr'], headway: 10,
    via: { 'k-rec>k-commons': [[598, 492], [705, 492]], 'k-commons>k-north': [[706, 95], [437, 95]],
      'k-north>k-marietta-dr': [[437, 16], [200, 16], [200, 640]], 'k-marietta-dr>k-rec': [[216, 552], [598, 552]] },
    service: [420, 1380], hours: ['Mon–Thu 7:00 AM – 11:00 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'm-loop', name: 'Marietta Loop Route', short: 'Marietta Loop', color: '#0d9488',
    stops: ['m-shore', 'm-courtyard', 'm-hornet-village', 'm-shuttle-lot', 'm-columns', 'm-hornet-hub'], headway: 10,
    via: { 'm-shore>m-courtyard': [[628, 318], [805, 318]], 'm-courtyard>m-hornet-village': [[805, 410], [225, 410], [225, 528]],
      'm-hornet-hub>m-shore': [[225, 254], [225, 163], [685, 163], [685, 320]] },
    service: [450, 1080], hours: ['Mon–Fri 7:30 AM – 6:00 PM'] },
  { id: 'economy', name: 'Economy Parking Route', short: 'Economy Parking', color: '#7c3aed',
    stops: ['k-gutenberg', 'k-town-point', 'k-science-math', 'k-art', 'k-dance'], headway: 12,
    via: { 'k-town-point>k-science-math': [[586, 850], [385, 850], [385, 418]], 'k-science-math>k-art': [[336, 390], [200, 390], [200, 358]] },
    service: [420, 1350], hours: ['Mon–Thu 7:00 AM – 10:30 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'shuttle', name: 'Shuttle Parking Route (3305 Express)', short: 'Shuttle Parking', color: '#db2777',
    stops: ['k-rec', 'k-commons', 'k-ksu-center', 'k-busbee'], headway: 10,
    via: { 'k-rec>k-commons': [[598, 492], [705, 492]] },
    service: [420, 1320], hours: ['Mon–Thu 7:00 AM – 10:00 PM', 'Fri 7:00 AM – 7:00 PM'] },
  // Listed for completeness; their stops are off the OwlPark maps, so no trip planning or demo times.
  { id: 'big-shanty', name: 'Big Shanty Loop Route', color: '#64748b', info: true,
    stopNames: ['KSU Bookstore/Rec Center', 'The Commons', 'Busbee Park and Ride', 'Parliament & Copper Social', 'SOVA & Indy'],
    hours: ['Mon–Thu 7:00 AM – 11:00 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'arts', name: 'Chastain Pointe/Arts Route', color: '#64748b', info: true,
    stopNames: ['KSU Bookstore/Rec Center', 'The Commons', 'School of Art', 'Department of Dance', 'Austin Residence Complex (ARC)'],
    hours: ['Mon–Thu 7:00 AM – 10:30 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'skip-spann', name: 'Skip Spann/Frey Road Route', color: '#64748b', info: true,
    stopNames: ['Education Building', 'Yugo Pavilion', 'The Nest', 'The Blake'],
    hours: ['Mon–Thu 7:00 AM – 11:00 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'west-campus', name: 'West Campus Route', color: '#64748b', info: true,
    stopNames: ['KSU Bookstore/Rec Center', 'The Commons', 'West 22', 'Austin Residence Complex (ARC)'],
    hours: ['Mon–Thu 7:00 AM – 11:00 PM', 'Fri 7:00 AM – 7:00 PM'] },
  { id: 'k-shopping', name: 'Kennesaw Shopping Route', color: '#64748b', info: true,
    stopNames: ['North Residential', 'Austin Residence Complex (ARC)', 'Town Center Mall', 'Walmart', 'Barrett Pavilion Shopping Center'],
    hours: ['Fri–Sat 12:00 PM – 7:00 PM'] },
  { id: 'm-shopping', name: 'Marietta Shopping Route', color: '#64748b', info: true,
    stopNames: ['Administration Building', 'University Courtyard', 'University Commons', 'Hornet Village', 'University Columns', 'Walmart', 'Providence Square Shopping Center'],
    hours: ['Fri–Sat 12:00 PM – 7:00 PM'] },
];
