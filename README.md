# OwlPark

A hackathon prototype that shows real-time parking availability on both Kennesaw State campuses (Kennesaw and Marietta).
A small sensor in each space (an ESP32 with an HC-SR04 ultrasonic sensor) reports whether
a car is there, and OwlPark shows open spaces the moment they change.

> **Prototype.** Every lot, count and sensor in the app is simulated demo data. It is not
> live KSU parking information, and OwlPark is not an official KSU service.

## Run it

```bash
npm install               # once: installs the Anthropic SDK for the AI assistant (Node 22.9+)
npm start                 # http://localhost:3000
```

You can also open `public/index.html` directly in a browser. Everything except the AI assistant
runs entirely in the browser.

### Turn on the AI assistant

Copy `.env.example` to `.env` and paste your Anthropic API key after `ANTHROPIC_API_KEY=`, then
`npm start`. The server prints `Ask OwlPark: on`. `.env` is git-ignored; never commit it. Without a key
the app works the same, and the assistant shows "AI off".

## What's in the app

The **Kennesaw / Marietta** switcher at the top changes which campus the dashboard, map and sensor ops show.
Find parking lists destinations on both campuses and recommends lots on the destination's campus.
Lot and building names and their relative positions come from KSU's official parking maps
(Kennesaw updated 8/12/2026, Marietta 8/7/2026). Each lot is a small sensor-equipped pilot
section, not the whole deck.

**Your permit.** Pick your KSU permit (Central, East, West, North Commuter, East Economy,
Town Point Economy, South Lot, Faculty/Staff, or Visitor) once. Find parking then recommends only
lots that permit covers, the dashboard lists only those lots, and the map fades the rest. KSU
permits are reciprocal: a permit covers the same area on both campuses (for example East → East Deck
on Kennesaw and East Lots 1 and 2 on Marietta). The permit-to-lot mapping in `campus-data.js`
follows the official map legends; check it against KSU's current permit list before relying on it.

| Page | What it does |
|---|---|
| **Dashboard** | Open spaces across campus, occupancy trend, sensor-network health, best lot right now, live sensor activity feed |
| **Live map** | 2.5D schematic map of the selected campus (Day / Night styles): every space is a painted stall that glows green when open, shows a red car when occupied, or is hatched gray with no signal. Tap a space to simulate a car arriving or leaving. |
| **Find parking** | Pick a destination on either campus, the time you need to be there, and your permit. You get the best lot, the predicted open spaces, the time to park by, a walking route, other options, and an "alert me if it fills" option. |
| **Big Owl Bus** | KSU's shuttle: next departures between campuses, all 11 Fall 2026 routes with stops and hours, and which routes are running at the demo time |
| **Sensor ops** | Staff view: sensor uptime, battery and offline alerts with actions (reboot, replace battery), availability by lot, and a per-sensor inventory |
| **Simulator** (gold button) | Make a car arrive or leave, run scenarios (morning rush, class change, event, evening), cause sensor faults, and change the speed of auto traffic and the demo clock |

**Big Owl Bus.** Bus stops and moving buses appear on both campus maps (toggle in the map legend).
Find parking adds the bus when it helps: "Faster by bus" (for example Town Point Economy → Economy
Parking Route) or "Park & ride" when your permit has no lots on the destination's campus (park on the
other campus and take the Kennesaw/Marietta Route). Routes, stop order and hours come from KSU's Fall 2026
route page. KSU doesn't publish frequencies or the campus-to-campus trip time, so bus times use an assumed
demo schedule (`headway`, `intercampusMin` in `campus-data.js`) and the app points riders to Passio GO! for
live times.

## Ask OwlPark (AI)

At the top of **Find parking**, students ask in their own words (typed or spoken), for example
*"I have class in the Atrium at 9:30 and an East permit"*. Claude (`claude-opus-5-5`) works out the
destination, arrival time and permit, then calls OwlPark's own tools and answers in a few sentences: the lot,
the exact open space, when to park, the walk, and the Big Owl Bus when it's faster.

- **Tools Claude can call** (they run in the browser, on the same live data the app shows):
  `find_parking` (also fills in the Find parking screen and draws the route), `plan_day`, `get_lot_status`, `get_bus_departures`.
- **Walking directions:** every route becomes plain steps ("Exit East Lot 2 on the south side, head west past Shore
  Innovation Center, turn left…"), naming the buildings you pass and the roads you cross. They show under the route
  map, and the assistant can read them out.
- **Plan my day:** *"Atrium at 9:30, Norton Hall at 11, Carmichael at 2, East permit"* → one lot per campus that keeps
  walking shortest, the walk between classes, when moving the car during a long break is worth it, and a drive-or-bus
  step when the day switches campuses. Shown as a "Your day" timeline on the Find parking screen.
- **Server side** (`ai.js`, `POST /api/ask`): holds the API key and sets the model, system prompt and tool list; the
  browser only sends the conversation. Effort is `low` for quick chat replies, and server-side refusal fallback is on.
- **No key or no internet?** The assistant says so, and the regular form keeps working.

## Connect a real sensor (live demo)

1. Run `npm start` on a laptop. Note its IP address on the Wi-Fi network.
2. Open `firmware/owlpark_sensor/owlpark_sensor.ino` in the Arduino IDE. Set the Wi-Fi
   details, set `SERVER_URL` to `http://<laptop-ip>:3000/api/sensor`, and set `SENSOR_ID`
   (for example `east-deck-A1`). Flash it to the ESP32.
3. Open `http://<laptop-ip>:3000` on your phone. The sidebar shows **ESP32 bridge
   connected**. Put your hand or a box over the sensor, and space A1 in East Deck turns red
   within about 3 seconds, tagged `ESP32` in the activity feed.

```
[HC-SR04 + ESP32] --Wi-Fi--> POST /api/sensor --> server.js --SSE /api/stream--> OwlPark app
```

No hardware? `npm run simulate` drives every space through the same API that a sensor uses.

### Sensor API

`POST /api/sensor` with header `x-api-key: <SENSOR_API_KEY>` (default `dev-sensor-key`):

```json
{ "sensorId": "east-deck-A1", "occupied": true, "battery": 87 }
```

Batches work too: `{ "readings": [ ... ] }`. The simulator also sends `"source": "simulator"`, so
its events are tagged `Sensor API` in the app instead of `ESP32`. Any space the server has
a reading for is driven only by the server. The app's in-browser demo traffic, scenarios
and fault buttons leave it alone. Sensor IDs are `<lotId>-<row letter><number>`
and come from `data/lots.json`, which must match `public/campus-data.js` (same lot ids, rows and columns). A sensor that is silent
for 2 minutes shows as offline, so the firmware sends a heartbeat every minute.

## Files

```
public/index.html, owlpark.css, owlpark.js   OwlPark web app (no build step)
public/campus-data.js                         both campuses: permits, lots, buildings, roads, Big Owl Bus routes
public/v1/                                    first prototype
server.js                                     sensor API + live stream + /api/ask
ai.js                                         Ask OwlPark: system prompt, tools, Claude API call
simulator.js                                  fake sensor network
firmware/owlpark_sensor/                      ESP32 + HC-SR04 sketch
data/lots.json                                sensor registry for the server (matches campus-data.js)
```

## Beyond the hackathon

- Real campus lot layouts and GPS. The map is schematic and not to scale.
- Store readings (Postgres or Redis) to train the arrival-time forecast on real history.
- Use per-sensor keys and HTTPS. Consider LoRaWAN magnetometers for surface lots, where
  Wi-Fi coverage is weak.
- Turn the app into a PWA with push notifications for "your lot is filling up".
