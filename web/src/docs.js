// Docs page content. Written as static HTML, so it contains no user data.
const SECTIONS = [
  {
    id: 'about',
    title: 'What earth-gs is',
    body: `
      <p>earth-gs is a real-scale Earth in the browser. The globe is procedural or uses an open basemap by default.
      Gaussian splats fill in real places on demand, one chunk at a time.</p>
      <p>Places are ranked in a registry, and each shows the detail level it has reached so far. Coordinates are
      verified before anything is published, and every chunk records where its data came from.</p>`,
  },
  {
    id: 'globe',
    title: 'Using the globe',
    body: `
      <ul>
        <li><b>Turn the globe</b>: drag with the left button. The surface follows the pointer.</li>
        <li><b>Tilt the view</b>: drag with the right button, or hold Shift and drag.</li>
        <li><b>Zoom</b>: scroll. Zooming in moves toward the point under the cursor.</li>
        <li><b>Select a place</b>: click its marker or label. The Details page opens.</li>
        <li><b>Fly to a view</b>: open the Camera page, set the look-at point, eye altitude, heading and pitch, then press Fly.</li>
        <li><b>Measure</b>: on the Camera page press Measure, then click two points. The great-circle distance appears on the globe.</li>
        <li><b>Share</b>: Copy link stores the current place, view and time in the address bar and the clipboard.</li>
        <li><b>Side panel</b>: the panel icon in the top bar hides or shows the Places, Details and Camera pages.</li>
        <li><b>Overlays</b>: the eye icon hides the labels and the coordinate readout.</li>
      </ul>`,
  },
  {
    id: 'time',
    title: 'Time and the sky',
    body: `
      <p>The sun, moon and star field all come from one UTC clock, so the globe, the sky and the sun's position agree.</p>
      <p>Open the <b>Time</b> pill at the bottom of the globe to use the controls:</p>
      <ul>
        <li><b>Live</b> follows the real clock. Scrub moves it up to 12 hours either way.</li>
        <li><b>Capture</b> shows the sky at the time the photos were taken, where that time is recorded.</li>
        <li><b>Play</b> advances the live clock. Speed goes up to 3600×.</li>
      </ul>
      <p>Splat chunks have their lighting baked in at capture time. Moving the sun changes the sky and the globe,
      but not the shadows inside a splat. The notice in the Time panel says which mode you are in.</p>`,
  },
  {
    id: 'lod',
    title: 'Levels of detail',
    body: `
      <p>The level of detail (LOD) follows how high the eye is above the ground. Higher numbers are closer.
      The altitude is measured from the surface, so a level changes only when you move the eye.</p>
      <table>
        <thead><tr><th>LOD</th><th>Name</th><th>Eye altitude</th><th>What you see</th></tr></thead>
        <tbody>
          <tr><td>0</td><td>Space</td><td>1,000 km and above</td><td>The whole Earth, drawn from the basemap.</td></tr>
          <tr><td>1</td><td>Sky</td><td>100 km to 1,000 km</td><td>Continents, coastlines and weather systems.</td></tr>
          <tr><td>2</td><td>Air</td><td>10 km to 100 km</td><td>Regions. Airliners fly at about 10 km.</td></tr>
          <tr><td>3</td><td>City</td><td>1 km to 10 km</td><td>Whole cities and their skylines.</td></tr>
          <tr><td>4</td><td>Tower</td><td>100 m to 1 km</td><td>A single tower or block. The Burj Khalifa is 828 m tall.</td></tr>
          <tr><td>5</td><td>Street</td><td>below 100 m</td><td>Streets, facades and people-scale detail.</td></tr>
        </tbody>
      </table>
      <p>The view LOD appears in the readout at the top of the globe. It is separate from the place LOD (0 to 4) on the
      Places list, which describes how much data a place has.</p>
      <p>Planned: levels 0 to 1 use the basemap only. Splats start at level 2 and get finer below. These are targets,
      not yet built.</p>`,
  },  {
    id: 'scale',
    title: 'Scale',
    body: `
      <p>The globe is drawn at real scale for the Earth itself. One unit is the Earth's mean radius (6,371 km), so the
      eye altitude and the measurements are real distances.</p>
      <ul>
        <li><b>Atmosphere</b>: a 100 km shell, the real thickness of the visible atmosphere.</li>
        <li><b>Moon</b>: real size and distance. It looks the same size in the sky as the real Moon.</li>
        <li><b>Sun</b>: placed far away at its real apparent size. Its direction is correct; its distance is not.</li>
        <li><b>Shape</b>: the globe is a perfect sphere. The real Earth is flattened about 21 km at the poles. Not yet modelled.</li>
        <li><b>Terrain</b>: flat for now. Mountains and valleys come with the splat data.</li>
      </ul>`,
  },
  {
    id: 'chunks',
    title: 'Splat chunks',
    body: `
      <p>A place's splats are stored as one chunk, in <code>registry/chunks/&lt;place id&gt;/</code>. The folder holds:</p>
      <ul>
        <li><b>manifest.json</b>: the chunk record, with the origin, licence, metrics and the name of the splat file.</li>
        <li><b>the splat file</b>: raw <code>.splat</code>, 32 bytes per splat. Positions are metres in the chunk's local
        east-north-up frame, which starts at the origin.</li>
      </ul>
      <p>A chunk with a broken manifest is reported in the Details page instead of being drawn. Where a place has no chunk,
      the stand-in geometry is shown, marked PROXY.</p>`,
  },  {
    id: 'status',
    title: 'Places and status',
    body: `
      <table>
        <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>ready</td><td>Every target detail level (LOD 4) is reached.</td></tr>
          <tr><td>training</td><td>Some detail exists and more is being trained.</td></tr>
          <tr><td>queued</td><td>Waiting for data or compute.</td></tr>
          <tr><td>needs capture</td><td>Open coverage is too weak. Someone has to capture the site.</td></tr>
        </tbody>
      </table>
      <p>The four ticks on each place show its detail level, from LOD 0 to LOD 4.
      Geometry marked <b>PROXY</b> is a stand-in drawn from the detail level. It is not captured data.</p>`,
  },
  {
    id: 'rules',
    title: 'Data rules',
    body: `
      <ol>
        <li>A chunk is the unit of work, cache, licence, retraining and removal.</li>
        <li>Real coordinates or it does not ship. An unregistered chunk is not published.</li>
        <li>No Google imagery in training, display or pose derivation.</li>
        <li>Provenance is recorded on every chunk from the first build. Unknown licence means default-deny.</li>
        <li>Code is open source. Each data source has its own licence.</li>
      </ol>`,
  },
  {
    id: 'licences',
    title: 'Licence tiers',
    body: `
      <table>
        <thead><tr><th>Tier</th><th>Examples</th><th>Rule</th></tr></thead>
        <tbody>
          <tr><td>A</td><td>Own captures, CC0 / CC BY, Sentinel-2, Landsat, NAIP, Copernicus DEM</td><td>Publish with attribution</td></tr>
          <tr><td>B</td><td>Mapillary (CC BY-SA), OSM-derived (ODbL), OAM per item</td><td>Hold for counsel review</td></tr>
          <tr><td>C</td><td>Tanks and Temples, MatrixCity, Inria 3DGS trainer</td><td>Internal research only</td></tr>
          <tr><td>D</td><td>Google Earth / Maps / Earth Studio, BungeeNeRF scenes</td><td>Never</td></tr>
          <tr><td>Hold</td><td>Mill-19, UrbanScene3D, GauU-Scene, Mip-NeRF 360</td><td>Default-deny</td></tr>
        </tbody>
      </table>
      <p>This is an engineering summary, not legal advice. Share-alike sources can extend their terms to derived data.</p>`,
  },
  {
    id: 'glossary',
    title: 'Glossary',
    body: `
      <dl>
        <dt>Chunk</dt><dd>A bounded piece of the Earth with one splat model, one manifest and one licence record.</dd>
        <dt>LOD</dt><dd>Level of detail. Higher levels mean more splats and finer geometry.</dd>
        <dt>Splat</dt><dd>A 3D Gaussian primitive. A scene is a large set of them.</dd>
        <dt>SfM</dt><dd>Structure from motion. It recovers camera poses from photos.</dd>
        <dt>Registration error</dt><dd>How far, in metres, a chunk's coordinates differ from its anchors.</dd>
        <dt>Capture time</dt><dd>When the source photos were taken. The Capture mode uses it.</dd>
      </dl>`,
  },
  {
    id: 'keys',
    title: 'Keyboard',
    body: `
      <ul>
        <li><b>Space</b>: play or pause the live clock (when no control has focus).</li>
        <li><b>Esc</b>: cancel measuring.</li>
        <li><b>← / →</b>: move between the Places, Details and Camera tabs.</li>
        <li><b>W A S D</b>: pan across the globe, relative to the heading. <b>Shift</b> runs (four times faster).</li>
        <li><b>Q / E</b>: turn left and right. <b>Z / X</b>: zoom in and out.</li>
        <li><b>F</b>: full screen.</li>
      </ul>`,
  },
];

export function renderDocs(root) {
  const toc = SECTIONS.map((s) => `<a href="#docs-${s.id}">${s.title}</a>`).join('');
  const body = SECTIONS.map(
    (s) => `<section class="doc-section" id="docs-${s.id}"><h2>${s.title}</h2>${s.body}</section>`,
  ).join('');
  root.innerHTML = `
    <header class="doc-head">
      <p class="kicker">Docs</p>
      <h1>How earth-gs works</h1>
      <p class="doc-lede">A short guide to the globe, its time and sky controls, the place registry and the data rules.</p>
    </header>
    <nav class="doc-toc" aria-label="On this page">${toc}</nav>
    ${body}`;
}