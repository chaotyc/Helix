# Later

Ideas the developer has said he'll build later. Claude Code adds to this list whenever one comes up and reviews it at the end of each step.

| Idea | Raised | Notes |
| --- | --- | --- |
| **LLM map editor**: fix the map by typing instructions to an LLM instead of clicking a graph editor. Code still enforces the hard rules (no loops, no arrows to missing concepts). | Step 7 | The diary already supports it (`actor: "editor"`, `instruction`, `request_id`). `docs/build-plan.md` Step 10 still describes a click-to-edit editor: update it. |
| **Graph-generating model**: a trained model that builds concept maps, in place of (or alongside) the prompted extractor. | Step 8 | Training data: extraction outputs, corrections in `map_event`, and the gold maps from Step 9. Compare against prompting with the Step 9 harness. Same idea as After-the-MVP item 1. |
| **Hallucination check on extracted maps**: a pass after extraction that flags concepts or arrows that aren't real or don't belong. | Step 8 | Fits Step 9's evaluation harness: score it like any other map error. Concept names stay free-form; nothing is tied to syllabus wording. |
| **Session graphs**: a diagnosis pulls its starting point from the global graph, the session builds its own graph, and the global graph is updated from it afterward. | Step 8 | Design in Steps 11–13. Open question: is the session graph a stored copy merged back afterward, or a view computed from the global graph plus the evidence log? |
