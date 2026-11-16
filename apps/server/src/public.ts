// What other packages (the evaluations) may use from the server. Everything else is internal.
export { openDatabase } from "./db/open.ts";
export { createGoal, listGoals } from "./db/goals.ts";
export { createSource, getSource } from "./db/sources.ts";
export { answersForGoal, createRound } from "./db/clarifications.ts";
export { readGraph, readMapEvents, recordMapChange } from "./db/graph.ts";
export { getSettings } from "./db/settings.ts";
export { callClaude, type ModelCall } from "./ai/claude.ts";
export { extractMap } from "./ai/extraction/extract-map.ts";
export { judgeMap, type JudgeResult } from "./ai/judge/judge-map.ts";
export { judgeTutor } from "./ai/judge/judge-tutor.ts";
export { gradeAnswer } from "./ai/grading/grade-answer.ts";
export { insertEvidence, insertItem } from "./db/learner.ts";
export { createSession, getSession, listTasks, readTurns, type Task, type Turn } from "./db/sessions.ts";
export { replyToSession, startSession } from "./sessions/runner.ts";
export { fakeModel } from "./ai/fake-model.ts";
