// "Ask OwlPark": the AI assistant behind POST /api/ask.
//
// The browser runs the tool loop: it sends the conversation here, this module adds the
// model, system prompt and tool definitions (the browser can't change those), calls Claude
// once, and returns the reply. When Claude asks for a tool, the browser runs it against the
// live parking model it already has (lots, sensors, Big Owl Bus) and sends the result back.
//
// Credentials: the Anthropic SDK reads ANTHROPIC_API_KEY from the environment. Without it,
// /api/ask answers 503 and the app falls back to the normal Find parking form.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MODEL = process.env.OWLPARK_MODEL || "claude-opus-5-5";
const MAX_MESSAGES = 40;          // keep conversations short; the browser starts a new chat after this
const MAX_BODY_CHARS = 300_000;

// Campus data (destinations, permits, bus routes) comes from the same file the browser uses.
const campus = (() => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "public/campus-data.js"), "utf8") +
      ";this.CAMPUSES=CAMPUSES;this.PLACES=PLACES;this.PERMIT_TYPES=PERMIT_TYPES;this.BUS_ROUTES=BUS_ROUTES;",
    ctx,
  );
  return ctx;
})();

const campusName = (id) => campus.CAMPUSES.find((c) => c.id === id).name;
const destinations = campus.PLACES.map((p) => `- ${p.id}: ${p.name} (${campusName(p.campus)} campus)`).join("\n");
const permits = campus.PERMIT_TYPES.map((p) => `- ${p.id}: ${p.name}`).join("\n");
const routes = campus.BUS_ROUTES.filter((r) => r.stops).map((r) => `- ${r.id}: ${r.name}`).join("\n");

const SYSTEM = `You are OwlPark, the parking assistant in a student hackathon prototype for Kennesaw State University (KSU). You help students, faculty and visitors find parking on KSU's two campuses (Kennesaw and Marietta) and get to class on time, including by the Big Owl Bus.

How to work:
- Answer parking, lot, permit and bus questions by calling the tools. Never invent counts, times or walking distances; use only what the tools return.
- To recommend where to park, call find_parking. It needs the destination, the time the person must arrive, and their permit.
  - Map the place the person names to a destination id from the list below (for example "the library on Marietta" is johnson-library, "the student center at Kennesaw" is carmichael).
  - If they don't give a time, use about 20 minutes after the current demo time, rounded to 5 minutes.
  - If they don't name a permit, use their saved permit from the context line. If none is saved, ask which permit they have in one short question.
- For "how full is X" or "where is there space right now", call get_lot_status. For bus times, call get_bus_departures.
- Each user message starts with a [Context: ...] line written by the app (demo time, saved permit, campus on screen). Use it, but don't repeat it back.

How to answer:
- 2 to 4 short sentences, friendly and direct, like a text from a friend who knows campus. Plain text; you may wrap the lot name and space number in **double asterisks**.
- Lead with the action: which lot, which space, and when to park. Then the walk, and the bus if the tool returned a bus option that is faster or saves a long walk.
- If find_parking reports no lots for their permit on that campus, explain the park-and-ride option it returns.
- All parking numbers are simulated demo data from a prototype; say so only if someone asks whether the data is real. Don't present OwlPark as an official KSU service.
- If asked about something unrelated to campus parking or getting around campus, say briefly that you only help with parking and the Big Owl Bus.

Destinations (id: name):
${destinations}

Permit types (id: name):
${permits}

Big Owl Bus routes with demo schedules (id: name):
${routes}`;

const TOOLS = [
  {
    name: "find_parking",
    description:
      "Recommend where to park for a trip to one KSU building, arriving by a given time, with a given permit. " +
      "Returns the best lot the permit allows (open spaces now, predicted open spaces when they park, the time to park by, walking time, a specific open space), " +
      "up to two alternatives, a Big Owl Bus option when it is faster or replaces a long walk, and a park-and-ride plan when the permit has no lots on that campus. " +
      "Also shows the result in the app's Find parking screen.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string", enum: campus.PLACES.map((p) => p.id), description: "Destination id from the list in the system prompt." },
        arrive_by: { type: "string", description: "24-hour time the person must arrive, HH:MM, e.g. 09:30." },
        permit: { type: "string", enum: campus.PERMIT_TYPES.map((p) => p.id), description: "Permit type id." },
      },
      required: ["destination", "arrive_by", "permit"],
      additionalProperties: false,
    },
  },
  {
    name: "get_lot_status",
    description: "Live open-space counts for every lot on one campus or both: open and total spaces, how full it is, the trend (filling up, opening up, steady) and which permits it accepts.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { campus: { type: "string", enum: ["kennesaw", "marietta", "both"] } },
      required: ["campus"],
      additionalProperties: false,
    },
  },
  {
    name: "get_bus_departures",
    description: "Next Big Owl Bus departures (demo schedule) for one route or all routes, per stop, with service hours and whether the route is running at the demo time.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { route: { type: "string", enum: [...campus.BUS_ROUTES.filter((r) => r.stops).map((r) => r.id), "all"] } },
      required: ["route"],
      additionalProperties: false,
    },
  },
];

let client = null;
const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
function getClient() {
  if (!hasCredentials()) return null;
  if (!client) {
    const Anthropic = require("@anthropic-ai/sdk").default;
    client = new Anthropic();
  }
  return client;
}

/** Light shape check: the browser may only send user/assistant turns. */
function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= MAX_MESSAGES &&
    messages.every((m) => m && (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content))) &&
    messages[0].role === "user";
}

/** Handle POST /api/ask. Returns [status, body]. */
async function ask(body) {
  const anthropic = getClient();
  if (!anthropic) return [503, { error: "AI assistant is off: start the server with ANTHROPIC_API_KEY set." }];
  if (JSON.stringify(body).length > MAX_BODY_CHARS || !validMessages(body.messages)) return [400, { error: "bad conversation" }];

  const Anthropic = require("@anthropic-ai/sdk").default;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },          // quick, chat-style answers for a live demo
      betas: ["server-side-fallback-2026-07-01"], // if a request is declined, the API retries on a fallback model
      fallbacks: "default",
      system: SYSTEM,
      tools: TOOLS,
      messages: body.messages,
    });
    return [200, { content: response.content, stop_reason: response.stop_reason }];
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return [502, { error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }];
    if (err instanceof Anthropic.PermissionDeniedError) return [502, { error: "This API key can't use that model." }];
    if (err instanceof Anthropic.RateLimitError) return [429, { error: "Too many questions at once. Try again in a moment." }];
    if (err instanceof Anthropic.BadRequestError) return [400, { error: "The assistant couldn't read that conversation. Start a new chat." }];
    if (err instanceof Anthropic.APIConnectionError) return [503, { error: "Can't reach the AI service. Check the internet connection." }];
    if (err instanceof Anthropic.APIError) return [502, { error: `AI service error (${err.status}).` }];
    throw err;
  }
}

module.exports = { ask, MODEL, enabled: hasCredentials };
