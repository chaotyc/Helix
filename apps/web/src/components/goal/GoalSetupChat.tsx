// Setting up a goal as a chat: the learner says what they want to learn (with any documents),
// Helix asks its clarifying questions one at a time, then builds the map. Shown on the New goal
// page (no goal yet) and on a goal's map page until the goal has a map.
//
// The chat is drawn from the store: the goal's words, the pending questions, the build progress,
// and the goal's SetupChat (what this window sent, and the answers so far), so leaving the page
// and coming back loses nothing.
import { useEffect, useRef, type ReactNode } from "react";
import type { ClarifyQuestion, Goal } from "@helix/contracts";
import { useAppStore, type BuildProgress, type ChatMessage, type PendingQuestions, type SetupChat } from "../../store.ts";
import { ElapsedClock } from "../map/ElapsedClock.tsx";
import { HelixAvatar } from "../session/HelixAvatar.tsx";
import { Button } from "../ui/Button.tsx";
import { Spinner } from "../ui/feedback.tsx";
import { FileIcon, RefreshIcon } from "../ui/icons.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { useDocuments } from "./DocumentDrop.tsx";

type NewGoalProps = {
  goal: null; // the New goal page
  sending: ChatMessage | null; // sent, waiting for the server to create the goal
  draft: string; // words to put back in the box (a send that never reached the server)
  onStart: (prompt: string, sourceText: string | undefined, documents: string[]) => boolean; // false: not sent
};

type GoalProps = {
  goal: Goal;
  setup: SetupChat | undefined;
  progress: BuildProgress | undefined;
  step: 1 | 2; // which job runs: writing questions (1) or building the map (2)
  questions: PendingQuestions | undefined;
  onAsk: (message: ChatMessage, sourceText: string | undefined) => boolean; // a goal with nothing running; false: not sent
  onRetryQuestions: () => boolean; // ask again, with the same material
  // Build the map from a fully answered round (App's submitRound). `retry`: send it again even
  // though it was sent before. Returns whether it was sent.
  onSubmit: (round: AnsweredRound, retry?: boolean) => boolean;
  onChangeMaterial: () => void; // drop the failed attempt: back to the box for new material
};

export type AnsweredRound = { roundId: string; questions: ClarifyQuestion[]; answers: Record<string, string> };

// Progress stages whose detail is for the learner ("12 concepts so far", a reasoning summary);
// the others carry the prompt version and effort, which are for the logs.
const SHOWN_DETAIL = new Set(["thinking", "writing", "checking"]);

export function GoalSetupChat(props: NewGoalProps | GoalProps) {
  return props.goal === null ? <NewGoalChat {...props} /> : <SetupConversation {...props} />;
}

// ---- The New goal page: one question and the box, in the middle; then the first message. ----
function NewGoalChat({ sending, draft, onStart }: NewGoalProps) {
  const documents = useDocuments();
  if (sending) {
    return (
      <ChatLayout composer={<ChatComposer placeholder="Helix is working…" disabled onSend={() => {}} />}>
        <LearnerBubble message={sending} />
        <HelixSays>
          <Working label="Starting…" />
        </HelixSays>
      </ChatLayout>
    );
  }
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl animate-fade-in flex-col justify-center px-6 py-12">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-fg">What do you want to learn?</h1>
      <p className="mt-2 mb-7 text-center text-[13px] text-fg-muted">
        A course, a book, a job, or one specific problem. Attach a syllabus or notes if you have them. Helix asks a few questions, then maps it out.
      </p>
      <ChatComposer
        initialText={draft} // the words of a send that never got through
        placeholder="I'm taking Signals and Systems this term and want to be able to design a simple digital filter…"
        documents={documents}
        sendLabel="Start"
        onSend={(text) => onStart(text, documents.sourceText, readyNames(documents))}
      />
    </div>
  );
}

// ---- A goal without a map: the conversation so far, and whatever is next. ----
function SetupConversation({ goal, setup, progress, step, questions, onAsk, onRetryQuestions, onSubmit, onChangeMaterial }: GoalProps) {
  const documents = useDocuments();
  const patch = (p: Partial<SetupChat>) => useAppStore.getState().patchSetup(goal.id, p);

  // "saved" is done too: the map follows at once (and if it's empty, the chat starts over).
  const running = progress !== undefined && !["asked", "saved", "failed"].includes(progress.stage);
  const failed = progress?.stage === "failed";
  // The round on screen: the pending questions with this window's answers so far, or, once
  // answered, the submitted round, while its map builds or after the build failed.
  const saved = setup?.round;
  const round = questions
    ? { roundId: questions.roundId, questions: questions.questions, answers: saved?.roundId === questions.roundId ? saved.answers : {}, submitted: saved?.roundId === questions.roundId && saved.submitted }
    : step === 2 && (running || failed) && saved?.submitted
      ? saved
      : undefined;
  const current = questions ? round?.questions.find((q) => !round.answers[q.id]) : undefined;
  // Every question answered, but the build request never went out (offline): offer to send it.
  const unsent = questions !== undefined && round !== undefined && !current && !round.submitted;
  const idle = !running && !failed && !questions;

  // Saves the answer; the last one sends the round. False when that send didn't go out, so the
  // answer box keeps its text.
  function answer(q: ClarifyQuestion, text: string): boolean {
    if (!questions || !round) return false;
    const answered = { roundId: questions.roundId, questions: questions.questions, answers: { ...round.answers, [q.id]: text } };
    if (questions.questions.every((x) => answered.answers[x.id])) return onSubmit(answered);
    patch({ round: { ...answered, submitted: false } });
    return true;
  }

  // A failed build is sent again with the same answers; failed questions are asked again.
  const canRebuild = step === 2 && saved?.submitted === true;

  let composer: ReactNode;
  if (unsent) {
    composer = <ChatComposer placeholder="Press Build the map above to send your answers." disabled onSend={() => {}} />;
  } else if (current) {
    composer = (
      <ChatComposer
        key={current.id} // each question starts with an empty box
        placeholder={current.answerType === "choice" ? "Pick an answer above, or type your own…" : "Your answer…"}
        onSend={(text) => answer(current, text)}
      />
    );
  } else if (idle) {
    composer = (
      <ChatComposer
        placeholder="Paste material here, or attach documents with the paperclip. Optional."
        documents={documents}
        textOptional
        sendLabel="Continue"
        onSend={(text) => {
          const message = { text, documents: readyNames(documents) };
          const sent = onAsk(message, [text, documents.sourceText].filter(Boolean).join("\n\n") || undefined);
          if (sent) documents.clear();
          return sent;
        }}
      />
    );
  } else {
    composer = <ChatComposer placeholder={failed ? "Something went wrong above." : "Helix is working…"} disabled onSend={() => {}} />;
  }

  return (
    <ChatLayout composer={composer} scrollKey={[current?.id, round?.submitted, running, failed, progress?.detail, setup?.added].join("|")}>
      <LearnerBubble message={{ text: goal.prompt || setup?.opening?.text || goal.title, documents: setup?.opening?.documents ?? [] }} />
      {setup?.added && (setup.added.text || setup.added.documents.length > 0) && <LearnerBubble message={setup.added} />}

      {round?.questions.map((q) => {
        const reply = round.answers[q.id];
        const isCurrent = q.id === current?.id;
        if (!reply && !isCurrent) return null; // not asked yet
        return (
          <div key={q.id} className="flex flex-col gap-6">
            <HelixSays>
              <p>{q.question}</p>
              {q.why && <p className="mt-0.5 text-[13px] leading-6 text-fg-subtle">{q.why}</p>}
              {isCurrent && q.answerType === "choice" && q.choices.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={q.question}>
                  {q.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => answer(q, choice)}
                      className="rounded-full border border-line-strong px-3 py-1 text-[13px] text-fg-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-text"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
            </HelixSays>
            {reply && <LearnerBubble message={{ text: reply, documents: [] }} />}
          </div>
        );
      })}

      {running && (
        <HelixSays>
          <Working label={step === 1 ? "Reading what you've told me…" : "Building your concept map…"} startedAt={progress.startedAt} />
          {SHOWN_DETAIL.has(progress.stage) && progress.detail && <p className="mt-1 text-[13px] leading-6 text-fg-subtle">{progress.detail}</p>}
          {step === 2 && (
            <p className="mt-1 text-[13px] leading-6 text-fg-subtle">
              A long source at high effort can take 10 minutes or more. You can switch to another page meanwhile; the map opens here when it's done.
            </p>
          )}
        </HelixSays>
      )}

      {unsent && round && (
        <HelixSays>
          <p>{round.questions.length ? "I have all your answers, but they didn't reach Helix." : "No questions needed, but the request to build the map didn't reach Helix."}</p>
          <Button size="sm" className="mt-3" icon={<RefreshIcon className="size-3.5" />} onClick={() => onSubmit(round)}>
            Build the map
          </Button>
        </HelixSays>
      )}

      {failed && (
        <HelixSays>
          <p className="text-danger">{step === 1 ? "I couldn't come up with my questions." : "Building the map failed."}</p>
          {/* This goal's own failure, not the window's latest error from anything. */}
          <p className="mt-0.5 text-[13px] leading-6 text-fg-muted">{progress.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<RefreshIcon className="size-3.5" />} onClick={() => (canRebuild && saved ? onSubmit(saved, true) : onRetryQuestions())}>
              Try again
            </Button>
            {canRebuild && (
              <Button size="sm" variant="ghost" onClick={onRetryQuestions}>
                Start over with new questions
              </Button>
            )}
            {/* A source too long for the model, or the wrong one: attach or paste something else. */}
            <Button size="sm" variant="ghost" onClick={onChangeMaterial}>
              Use different material
            </Button>
          </div>
        </HelixSays>
      )}

      {idle && (
        <HelixSays>
          <p>I'll ask a few questions about what you want from this, then lay out the concepts. Attach any documents you have first: a syllabus, notes, or a posting.</p>
        </HelixSays>
      )}
    </ChatLayout>
  );
}

function readyNames(documents: ReturnType<typeof useDocuments>): string[] {
  return documents.entries.flatMap((e) => (e.status === "ready" ? [e.name] : []));
}

// The messages, scrolling, with the box below. A change in `scrollKey` scrolls to the newest.
function ChatLayout({ children, composer, scrollKey }: { children: ReactNode; composer: ReactNode; scrollKey?: string }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [scrollKey]);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-8 pb-6">
          {children}
          <div ref={bottom} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 pb-6">{composer}</div>
    </div>
  );
}

function Working({ label, startedAt }: { label: string; startedAt?: number }) {
  return (
    <div className="flex items-center gap-2 text-fg-muted" role="status">
      <Spinner className="size-4 text-accent" />
      <span>{label}</span>
      <ElapsedClock startedAt={startedAt} className="text-[13px] text-fg-subtle" />
    </div>
  );
}

function HelixSays({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full animate-fade-in gap-3">
      <HelixAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 text-xs font-medium text-fg-subtle">Helix</div>
        <div className="text-[15px] leading-7 text-fg">{children}</div>
      </div>
    </div>
  );
}

function LearnerBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-auto flex max-w-[80%] animate-fade-in flex-col items-end gap-1.5">
      {message.documents.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.documents.map((name, i) => (
            <span key={`${i}-${name}`} className="flex max-w-60 items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-fg-muted">
              <FileIcon className="size-3.5" />
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      )}
      {message.text && <div className="rounded-2xl rounded-br-md bg-fill-strong px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap text-fg">{message.text}</div>}
    </div>
  );
}
