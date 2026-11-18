// The first-run tutorial: one card over the app. What Helix is, and connecting an AI model, ending
// with the learner able to start a goal (or sent to Settings to connect one).
// Esc or "Set up later" closes it; it's in the ⌘K palette to see again.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CONNECTIONS, modelLabel, parseModelId, type ModelId, type ProviderStatus, type Settings } from "@helix/contracts";
import { suggestedModel, usable } from "../tutorial.ts";
import { Button } from "./ui/Button.tsx";
import { Alert, Spinner } from "./ui/feedback.tsx";
import { PlusIcon, RefreshIcon } from "./ui/icons.tsx";

type Props = {
  connected: boolean; // whether the window can reach the server
  settings: Settings | null; // null until the server replies
  providers: ProviderStatus[] | null; // null until the server has checked
  hasGoals: boolean; // reopened by someone who already has goals: the main button just closes
  onCheckProviders: () => void;
  onUseModel: (model: ModelId) => void; // sets every job to this model
  onOpenSettings: () => void;
  onNewGoal: () => void;
  onClose: () => void;
};

// Where the model setup stands, worked out from what the server reported.
//   ready  every job's connection is usable. `unchecked`: the tools among them that are installed
//          but whose sign-in can't be checked without using them.
type ModelState =
  | { kind: "offline" }
  | { kind: "checking" }
  | { kind: "ready"; model: ModelId | null; unchecked: string[] } // model: null when the jobs use different ones
  | { kind: "pick"; found: ProviderStatus[] }
  | { kind: "none" };

function modelState(connected: boolean, settings: Settings | null, providers: ProviderStatus[] | null): ModelState {
  if (!connected) return { kind: "offline" };
  if (!settings || !providers) return { kind: "checking" };
  const status = (id: ModelId) => providers.find((p) => p.connection === parseModelId(id).connection);
  const chosen = Object.values(settings.models);
  if (chosen.every((id) => usable(status(id)))) {
    const unchecked = [...new Set(chosen.filter((id) => status(id)?.state === "unchecked").map((id) => CONNECTIONS[parseModelId(id).connection].label))];
    return { kind: "ready", model: new Set(chosen).size === 1 ? chosen[0]! : null, unchecked };
  }
  const found = providers.filter(usable);
  return found.length > 0 ? { kind: "pick", found } : { kind: "none" };
}

export function Tutorial({ connected, settings, providers, hasGoals, onCheckProviders, onUseModel, onOpenSettings, onNewGoal, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const state = modelState(connected, settings, providers);
  // What had focus before the card opened (read during the first render, before the card takes
  // it), to give it back on closing.
  const [previous] = useState(() => document.activeElement);

  // The connections are checked when the card opens (and again once the server is back).
  useEffect(() => {
    if (connected) onCheckProviders();
  }, [connected]);

  // The main button takes focus, so Enter does it. Again whenever it changes (picking a model
  // swaps the buttons); with none, the card itself holds focus.
  useEffect(() => {
    const target = dialog.current?.querySelector<HTMLElement>("[data-primary]") ?? dialog.current;
    target?.focus();
  }, [state.kind]);

  // Esc closes from anywhere, before anything behind the card sees it. (Through a ref, so a new
  // onClose each render doesn't re-subscribe.)
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    function onEscape(event: globalThis.KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    }
    window.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("keydown", onEscape, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  // Keep Tab inside the card while it's open.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? [])];
    const first = focusable[0];
    const end = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault();
      end?.focus();
    } else if (!event.shiftKey && document.activeElement === end) {
      event.preventDefault();
      first?.focus();
    }
  }

  // The footer: a way out on the left, the next useful thing on the right.
  const ready = state.kind === "ready";
  const finishes = ready && hasGoals; // "Done" is the way out, so no second one
  let actions: ReactNode = null;
  if (ready) {
    actions = (
      <>
        {state.unchecked.length > 0 && <Button onClick={onOpenSettings}>Open Settings</Button>}
        {hasGoals ? (
          <Button data-primary variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button data-primary variant="primary" icon={<PlusIcon className="size-4" />} onClick={onNewGoal}>
            Create my first goal
          </Button>
        )}
      </>
    );
  } else if (state.kind === "pick" && state.found.length === 1) {
    const model = suggestedModel(state.found[0]!);
    actions = (
      <Button data-primary variant="primary" onClick={() => onUseModel(model.id)}>
        Use {model.label}
      </Button>
    );
  } else if (state.kind === "none") {
    actions = (
      <Button data-primary variant="primary" onClick={onOpenSettings}>
        Open Settings
      </Button>
    );
  }

  return (
    // The dimmed backdrop. A click on it keeps focus in the card (so Tab and Enter still work there).
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-[2px] dark:bg-black/50 desktop:[-webkit-app-region:no-drag]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-md animate-pop-in flex-col overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-2xl shadow-black/20 focus:outline-none"
      >
        <div className="px-7 pt-7 pb-6">
          <img src="/brand/helix-mark.svg" alt="" className="mb-4 size-8 dark:hidden" />
          <img src="/brand/helix-mark-on-dark.svg" alt="" className="mb-4 hidden size-8 dark:block" />
          <h2 id="tutorial-title" className="text-lg font-semibold tracking-tight text-fg">
            Welcome to Helix
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            Your personal tutor. Tell it what you want to learn, and it maps the concepts, finds out what you already know, and teaches you the rest.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            First, connect an AI model: a plan you already pay for (Claude, ChatGPT, Google AI) or an API key.
          </p>
          <div className="mt-4">
            <ModelStatus state={state} onCheck={onCheckProviders} onUse={onUseModel} />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-7 py-4">
          {!finishes && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              {ready ? "Close" : "Set up later"}
            </Button>
          )}
          <span className="flex-1" />
          {actions}
        </div>
      </div>
    </div>
  );
}

function ModelStatus({ state, onCheck, onUse }: { state: ModelState; onCheck: () => void; onUse: (model: ModelId) => void }) {
  switch (state.kind) {
    case "offline":
      return (
        <Alert tone="warning" icon={<Spinner className="size-4" />}>
          Can't reach the Helix server. It will reconnect on its own.
        </Alert>
      );
    case "checking":
      return <Alert icon={<Spinner className="size-4" />}>Checking what's set up on this computer…</Alert>;
    case "ready": {
      const via = state.model ? `${modelLabel(state.model)} via ${CONNECTIONS[parseModelId(state.model).connection].label}` : null;
      if (state.unchecked.length > 0) {
        return (
          <Alert tone="warning" title="Almost ready">
            Helix found {state.unchecked.join(" and ")} but couldn't confirm you're signed in. If you haven't yet, sign in from Settings.
          </Alert>
        );
      }
      return (
        <Alert tone="success" title="You're ready">
          {via ? `Helix will use ${via}.` : "Your chosen models are connected."} You can change this in Settings.
        </Alert>
      );
    }
    case "pick":
      if (state.found.length === 1) {
        const found = state.found[0]!;
        return (
          <p className="text-[13px] text-fg">
            Found <span className="font-medium">{CONNECTIONS[found.connection].label}</span> on this computer. Helix will use {suggestedModel(found).label} for
            everything.
          </p>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-fg">Found on this computer. Pick one to use for everything:</p>
          {state.found.map((status, i) => {
            const model = suggestedModel(status);
            const label = CONNECTIONS[status.connection].label;
            return (
              <div key={status.connection} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2.5">
                <div className="min-w-0 text-[13px]">
                  <div className="font-medium text-fg">{label}</div>
                  <div className="text-xs text-fg-subtle">
                    {model.label}
                    {status.state === "unchecked" && " · sign-in not confirmed"}
                  </div>
                </div>
                <Button size="sm" data-primary={i === 0 || undefined} aria-label={`Use ${model.label} via ${label}`} onClick={() => onUse(model.id)}>
                  Use this
                </Button>
              </div>
            );
          })}
        </div>
      );
    case "none":
      return (
        <Alert
          tone="warning"
          title="No AI model found"
          action={
            <Button size="sm" variant="ghost" icon={<RefreshIcon className="size-3.5" />} onClick={onCheck}>
              Check again
            </Button>
          }
        >
          Open Settings to sign in to a tool like Claude Code or Codex, or to add an API key. This card comes back when you leave Settings.
        </Alert>
      );
  }
}
