// Asks the clarifying questions in the terminal and returns the answers (C6). Every question
// must be answered (C4). For a choice question, type a choice's number or your own answer.
import type { ClarifyAnswer, ClarifyQuestion } from "@helix/contracts";

// `ask` shows a prompt and resolves with the line typed; `print` writes a line.
// Passed in, so a test can drive this without a real terminal.
export async function askQuestions(
  questions: ClarifyQuestion[],
  ask: (prompt: string) => Promise<string>,
  print: (line: string) => void,
): Promise<ClarifyAnswer[]> {
  const answers: ClarifyAnswer[] = [];

  for (const [i, q] of questions.entries()) {
    print("");
    print(`${i + 1}/${questions.length}. ${q.question}`);
    q.choices.forEach((choice, n) => print(`   ${n + 1}) ${choice}`));
    const hint = q.answerType === "choice" ? "Number, or your own answer: " : "Your answer: ";

    let answer = "";
    while (!answer) {
      const typed = (await ask(hint)).trim();
      const n = Number(typed);
      answer = Number.isInteger(n) && n >= 1 && n <= q.choices.length ? q.choices[n - 1]! : typed;
      if (!answer) print("   An answer is needed to build the map.");
    }
    answers.push({ questionId: q.id, answer });
  }
  return answers;
}
