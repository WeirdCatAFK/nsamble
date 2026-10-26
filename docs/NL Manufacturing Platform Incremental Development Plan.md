# NL Manufacturing Platform — Incremental Development Plan

Oct 23, 2026 · @Daniel Pineda Torres

This plan divides the MVP into 10 phases. Each phase builds on the previous phase. Complete each phase before you start the next one. Each task references the functional requirement that it satisfies (e.g., FR-FE-001).

## Phase 1: Foundation

Build the project skeleton. All later phases depend on this phase.

### Backend tasks

1. Create the project directory structure: src/, build/, docs/, lib/, logs/ (FR-INF-004).
2. Write a Dockerfile for the OpenSCAD container. Verify that the container starts and compiles a test script (FR-INF-001).
3. Write a Dockerfile for the SVG generator service (FR-INF-001).
4. Write a docker-compose.yml file that starts all backend containers with one command (FR-INF-002).
5. Create an MCP server skeleton for each backend service. Verify that the orchestrator can send a test call and receive a response (FR-INF-003, FR-ORC-007).
6. Create a project manifest schema (manifest.json) with the fields that FR-ACE-001 defines. Include separate function and form constraint categories (FR-ACE-007). Write a validation script that checks the manifest against the schema.
7. Set up a logging module that records every LLM call with timestamp, role name, prompt, and response (FR-INF-006).
8. Select the CAD tool and the MCP server for sheet metal parts (FR-GEN-010).
9. Add the SGE checker to the backend image. Create an empty `sge-glossary.json` in the project directory (FR-SGE-002).

### Frontend tasks

1. Create a Next.js project with the application shell: sidebar navigation, main content area, and a placeholder for each view (FR-FE-001).
2. Build the chat interface view with a text input and a message list. Connect it to the backend orchestrator endpoint (FR-FE-001).
3. Build the file browser view with a tree layout grouped by file type. Use placeholder data (FR-FE-008).
4. Build the empty 3D viewport view with a Three.js canvas, orbit controls, and a grid floor (FR-FE-004, FR-FE-005).

### Done when

Docker Compose starts all services. The chat interface sends a prompt to the orchestrator and shows a response. The 3D viewport renders an empty scene with orbit controls.

## Phase 2: Core generation

Make the system generate real files from natural language prompts. This phase proves the central value proposition.

### Backend tasks

1. Write the geometry generator system prompt. The prompt must instruct the LLM to produce valid OpenSCAD code with parametric variables for all dimensions (FR-GEN-001, FR-GEN-002).
2. Connect the geometry generator to the OpenSCAD container through MCP. The container must accept a script, compile it, and return an STL file and a PNG preview (FR-GEN-004).
3. Write the SVG generation system prompt. The prompt must instruct the LLM to produce valid SVG files with closed paths for laser cutting (FR-GEN-005).
4. Add kerf compensation logic to the SVG generator. Apply the offset to all cut paths (FR-GEN-006).
5. Write the DXF conversion service with ezdxf. The service takes an SVG file and returns a DXF file (FR-GEN-007).
6. Write the orchestrator routing logic. The orchestrator must parse a user prompt and decide which generator to call on the basis of the manufacturing method (FR-ORC-001).
7. Write the form constraint parser. The orchestrator must separate function constraints and form constraints in the first prompt, and store each set in the manifest. Send only function constraints to the core roles (FR-ORC-005, FR-ACE-007).
8. Connect the geometry generator to the sheet metal CAD tool through MCP. The tool must return a 3D model and a DXF flat pattern with the bend lines on a separate layer (FR-GEN-010, FR-GEN-011).
9. Store all generated source files and compiled outputs in the project directory under src/ and build/ (FR-INF-004).

### Frontend tasks

1. Connect the chat interface to the generation pipeline. Show the status of each part while the system generates files (FR-FE-001, FR-FE-016).
2. Let the user ask for changes to a generated design in the chat (FR-FE-017).
3. Load the generated STL file into the Three.js viewport and render it (FR-FE-004).
4. Connect the file browser to the project directory. Show real generated files instead of placeholder data (FR-FE-008).
5. Add a download button to each file in the file browser (FR-FE-009).
6. Let the user open a source file in the file browser and read its code (FR-FE-014).

### Done when

The user types "make a bracket with two M3 holes" and the system returns a valid OpenSCAD script, an STL file, and a PNG preview. The STL renders in the 3D viewport. The user can download all files. A prompt with a style direction stores the form constraints in the manifest, apart from the function constraints.

## Phase 3: Standard parts library

Build the parts database so that generated files use correct, real-world dimensions.

### Backend tasks

1. Define the JSON schema for library entries (FR-SPL-001). Include identifier, category, dimensions with tolerances, mounting geometry, and material. Include supplier name, supplier part number, reference unit price, minimum order quantity, and OpenSCAD module path.
2. Build the metric fasteners category (M2, M2.5, M3, M4, M5). Enter dimensions from ISO 4762 and ISO 4032 (FR-SPL-002).
3. Build the board mounts category. Enter mounting hole positions for ATX, MicroATX, Mini-ITX, and Raspberry Pi from official mechanical drawings (FR-SPL-003).
4. Build the fans category (40 mm, 60 mm, 80 mm, 120 mm). Enter mounting hole positions from manufacturer datasheets (FR-SPL-004).
5. Build the drive bays category (2.5-inch, 3.5-inch). Enter dimensions from SFF-8301 (FR-SPL-005).
6. Build the rack hardware category. Enter 19-inch rail dimensions from EIA-310 (FR-SPL-006).
7. Build the connectors category (USB-C, barrel jack, JST, header pins). Enter footprint dimensions from datasheets (FR-SPL-007).
8. Write a parametric OpenSCAD module for each library entry. Verify that each module compiles and matches the stated dimensions (FR-SPL-008).
9. Update the geometry generator system prompt. Instruct the LLM to import library modules for all standard parts instead of writing geometry from scratch (FR-SPL-009, FR-GEN-003).
10. Write a library lookup API that the LLM can call through MCP to search for parts by category, size, or name.
11. Write the price lookup MCP server. It must get current prices through a web search, and return the supplier, the source URL, and the retrieval date (FR-PRC-001, FR-PRC-002).
12. Write the price cache and the fallback to the cached or reference price (FR-PRC-003, FR-PRC-004).

### Frontend tasks

1. No frontend changes in this phase. The library works through the backend only.

### Done when

The generator produces a bracket with M3 holes. The OpenSCAD script imports the M3 module from the library. The hole diameter in the compiled STL is 3.2 mm (clearance), not a guessed value. A price request for an M3 bolt returns a current price with its source URL and date.

## Phase 4: Constraint check engine

Build the deterministic validator that catches errors before the LLM reviewer sees the design.

### Backend tasks

1. Write the engine framework: accept a compiled output file (STL or SVG) and the project manifest, run all applicable checks, and return a JSON validation report (FR-CCE-015).
2. Write dimensional checks: verify bolt hole diameters against the standard parts library (FR-CCE-002), verify board mounting positions against specifications (FR-CCE-003), and verify mating surface dimensions (FR-CCE-004).
3. Write 3D printing checks: minimum wall thickness (FR-CCE-005), maximum overhang angle (FR-CCE-006), build volume limits (FR-CCE-007), and minimum hole diameter (FR-CCE-008). Add the maximum bridge length check (FR-CCE-017).
4. Write laser cutting checks: minimum feature size (FR-CCE-009), kerf compensation (FR-CCE-010), and minimum distance between cuts (FR-CCE-011). Add the bed size check (FR-CCE-018) and the material thickness check (FR-CCE-019).
5. Write assembly checks: verify that every part has at least one connection (FR-CCE-012), verify fastener hole alignment between mating parts (FR-CCE-013), and check for bounding-box overlap (FR-CCE-014).
6. Integrate the engine into the generation pipeline. The engine must run after the geometry generator and before the DFM reviewer (FR-CCE-001).
7. Write the feedback loop: send error-level failures back to the geometry generator as structured feedback. The generator must fix errors before the design goes to the DFM reviewer (FR-CCE-016).
8. Send the warning-level failures to the DFM reviewer for a decision (FR-CCE-020).

### Frontend tasks

1. Build the revision panel view. Show each validation finding with severity, rule name, measured value, and expected value (FR-FE-010).
2. Add accept and reject buttons to each finding in the revision panel (FR-FE-011).
3. Add a redesign button for each part in the revision panel (FR-FE-015).

### Done when

The generator produces a part with a 3.0 mm hole for an M3 bolt. The engine catches the error (expected 3.2 mm). The generator receives the feedback and produces a corrected version. The revision panel shows the finding.

## Phase 5: Clarifying questions and recommendations

Build the requirements-gathering phase that runs before any file generation.

### Backend tasks

1. Write the question generation logic. The orchestrator must analyze the user prompt and produce between 15 and 50 questions across all constraint categories: dimensions, materials, manufacturing, assembly, environment, electrical, and scope (FR-CQ-001, FR-CQ-002).
2. Write the recommendation engine. For each question about a component or material, query the standard parts library and the price lookup service. Select a quality pick and a cost pick (FR-CQ-003, FR-CQ-004, FR-CQ-005).
3. Write the answer processing logic. The system must accept three answer types per question: accepted recommendation, custom value, or skip with default (FR-CQ-006, FR-CQ-007, FR-CQ-008).
4. Write the answer logging logic. Store every answer in the project manifest with its source (quality pick, cost pick, custom, default) (FR-CQ-009).
5. Write the completeness check. After the last question, verify that the system has enough answers to produce a manufacturable design. Generate additional questions if critical answers are missing (FR-CQ-010).
6. Update the orchestrator: do not call the geometry generator until the clarifying questions phase is complete (FR-CQ-001).

### Frontend tasks

1. Build the question card component. Each card shows the question text, the quality pick (name, price, reason), the cost pick (name, price, trade-off), a "Use quality pick" button, a "Use cost pick" button, a text input for a custom answer, and a skip button (FR-FE-002, FR-CQ-006, FR-CQ-007, FR-CQ-008).
2. Build the progress bar for the clarifying questions phase. Show the current question number and the total (FR-FE-003).
3. Integrate the question cards into the chat interface. Show them inline in the conversation flow (FR-FE-001).

### Done when

The user types a prompt for a Raspberry Pi enclosure. The system generates 20 questions with quality and cost picks for component questions. The user answers all questions with a mix of recommendation clicks and custom text. The manifest stores every answer with its source. The system then starts generation.

## Phase 6: Assembly composition

Combine individual parts into a full assembly with a 3D preview.

### Backend tasks

1. Write the assembly planner system prompt. The planner must read all approved part geometries and set the position and rotation of each part in the manifest (FR-ACE-002).
2. Write the assembly order logic. The planner must determine which parts must be in position before other parts and list the fasteners and tools for each step (FR-ACE-003, FR-ACE-004).
3. Update the project manifest with assembly data: position (X, Y, Z), rotation (X, Y, Z), assembly step number, and fastener requirements for each part (FR-ACE-001).
4. Add function and form tags to each feature of each part entry in the manifest. Use the constraint sets that phase 2 stores (FR-ACE-007).
5. Write a glTF export service that combines all part meshes into a single glTF file with the manifest positions (FR-ACE-006).

### Frontend tasks

1. Update the Three.js viewport to load multiple STL meshes and position them per the manifest (FR-FE-004, FR-ACE-005).
2. Add click-to-select to the viewport. Show the part name, material, and dimensions when the user clicks a part (FR-FE-006).
3. Build the step-by-step assembly mode. A slider or play button adds parts to the scene one at a time in assembly order (FR-FE-007).
4. Add a show or hide toggle for each part (FR-FE-013).

### Done when

The system generates a bracket and a base plate. The assembly planner positions them in the manifest. The 3D viewport shows both parts in their correct positions. The user can click each part to see its data. The step-by-step mode shows the base plate first, then the bracket.

## Phase 7: Supervision and SGE compliance

Add the LLM review loop and the controlled language pipeline.

### Backend tasks

1. Write the DFM reviewer system prompt. The prompt must instruct the LLM to find manufacturing problems in the generated geometry: impractical print orientations, infeasible assembly sequences, and designs that are difficult to manufacture at scale (FR-ORC-002).
2. Send the DFM reviewer only the compiled geometry and the constraint check report. Do not send the generator prompt context (FR-ORC-008).
3. Write the revision loop between the geometry generator and the DFM reviewer. When the reviewer reports an error, the orchestrator sends feedback to the generator and requests a new version (FR-ORC-003).
4. Set the maximum revision cycle limit to 5 per part. After 5 cycles, show the best version with a list of remaining issues (FR-ORC-004).
5. Write the SGE rewriter system prompt. The prompt must contain the full SGE ruleset from the SGE `rules.md` file (FR-SGE-001, FR-SGE-004).
6. Write the logic that adds new technical terms to `sge-glossary.json` when the user introduces them (FR-SGE-002, FR-SGE-003).
7. Connect the SGE checker `sge_check.py` to the pipeline. Use its `--json` output to get the flagged sentences (FR-SGE-005, FR-SGE-006, FR-SGE-007).
8. Write a reader that sends the comments of OpenSCAD files to the SGE checker (FR-SGE-010, FR-GEN-009).
9. Write the SGE feedback loop. Text that fails the check goes back to the rewriter for correction (FR-SGE-008).
10. Track part status in the manifest: pending, generating, reviewing, approved, failed (FR-ORC-006).

### Frontend tasks

1. Update the revision panel to show DFM reviewer findings alongside constraint engine findings (FR-FE-010).
2. Show part status in the file browser and the 3D viewport (use colour codes: green for approved, yellow for reviewing, red for failed).

### Done when

The generator produces a part with a 0.5 mm wall. The constraint engine flags it as an error. The generator fixes it. The DFM reviewer then checks the corrected part and approves it. The SGE rewriter produces an assembly instruction. The SGE checker gives the verdict "compliant".

## Phase 8: Documentation generation

Generate the full design package documents from the project data.

### Backend tasks

1. Write the BOM generator. Parse the project manifest and produce a table with: part name, quantity, material, dimensions, manufacturing method, unit cost, and supplier part number. Mark non-library parts as "TBC" (FR-DOC-001, FR-SPL-010).
2. Write the cost report generator. Calculate cost per part: material volume multiplied by cost per unit volume for 3D printing, cut length multiplied by cost per unit length for laser cutting, library prices for standard parts (FR-DOC-002).
3. Add manufacturing time estimates to the cost report: estimated print time for 3D parts, estimated cut time for laser parts (FR-DOC-003).
4. Write the assembly guide generator. Produce step-by-step instructions from the assembly order in the manifest. Each step must list the parts, fasteners, tools, and instructions (FR-DOC-004).
5. Write the screenshot service. Render the Three.js assembly at each step and save the image as a PNG file for the assembly guide (FR-DOC-005).
6. Write the specification sheet generator. List overall dimensions, weight estimate, materials, tolerances, manufacturing requirements, function/form labels, and all default values used for skipped questions (FR-DOC-006, FR-DOC-007).
7. Run the SGE pipeline on all document text before the PDF conversion (FR-DOC-009, FR-SGE-009).
8. Write the PDF conversion service with weasyprint or Puppeteer. Convert all Markdown documents to PDF files (FR-DOC-008).

### Frontend tasks

1. Add a "Generate design package" button to the chat interface. The button triggers all documentation generation tasks.
2. Show the generated documents in the file browser under a docs/ group (FR-FE-008).
3. Add a "Download all as ZIP" button that packages the full design into one ZIP file (FR-FE-012).

### Done when

The system generates a multi-part assembly. The user clicks "Generate design package." The system produces a BOM, cost report, assembly guide with step images, and specification sheet. All documents are PDF files. All text has no SGE findings. The user downloads the full ZIP.

## Phase 9: Integration and demo

Connect all phases into one flow and prepare the hackathon demonstration.

### Backend tasks

1. Test the full pipeline end to end: prompt to clarifying questions to generation to constraint check to DFM review to assembly to documentation to ZIP export.
2. Run demo scenario A (MicroATX server rack casing) through the full pipeline. Record every LLM call, constraint check, and revision cycle.
3. Run demo scenario B (stackable Raspberry Pi cluster) through the full pipeline.
4. Run demo scenario C (rugged field data collector) through the full pipeline.
5. Cache the complete output of the best demo scenario. Store all generated files, the manifest, and all documents as a fallback for the live demo.
6. Write the retry mechanism for LLM service provider failures. Retry up to 3 times. Fall back to the cached response if all retries fail (FR-INF-007).
7. Collect generation metrics: how many prompts tested, percentage of STL files that compile on first generation, percentage that pass DFM review without revision, and average number of revision cycles per part.
8. Export the best STL file and 3D-print a physical part for the demo table.

### Frontend tasks

1. Polish the chat interface: smooth transitions between the clarifying questions phase and the generation phase.
2. Polish the 3D viewport: add part highlighting, camera animation for step-by-step mode, and a loading indicator.
3. Polish the file browser: add file type icons, file size, and generation timestamp.
4. Build a demo loop mode: a screen that cycles through prompt entry, question answering, 3D assembly, and documentation generation on repeat for the demo table.

### Done when

The team can run the full demo scenario in under 10 minutes from prompt to ZIP download. The fallback cache works when the LLM service is unavailable. A physical 3D-printed part is on the demo table. The generation metrics are recorded.

## Phase 10: Optional roles

Add the industrial engineer and design author roles if the team has time after phase 9.

### Backend tasks

1. Write the industrial engineer system prompt. The prompt must instruct the LLM to produce a production plan: manufacturing operations in order, tooling for each operation, batch sizing, and quality checks between operations (FR-OPT-001).
2. Run the production plan through the SGE pipeline (FR-OPT-002).
3. Write the design author system prompt. The prompt must instruct the LLM to apply a form language (futuristic, industrial, ergonomic, minimal, organic) to the finished functional design (FR-OPT-003).
4. Send the form constraints that phase 2 stores in the manifest only to the design author (FR-OPT-004).
5. Write the form protection logic. The design author must not modify any dimension or feature that the manifest marks as serving function. Verify with a before-and-after comparison (FR-OPT-005).
6. Update the orchestrator pipeline. The design author must run only after all core roles approve the functional design with zero errors (FR-OPT-006).

### Frontend tasks

1. Add a form/function toggle to the 3D viewport. The user can highlight function features in one colour and form features in another.
2. Add the production plan to the file browser under docs/.
3. Show a before-and-after comparison view in the 3D viewport when the design author makes changes.

### Done when

The user types a prompt with separate function and form constraints. The system generates the functional design first. After approval, the design author applies the stated form language. The 3D viewport shows the before-and-after comparison. A production plan PDF is in the design package.
