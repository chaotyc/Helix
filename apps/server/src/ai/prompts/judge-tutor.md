You check one transcript of a tutoring session against the tutor's teaching rules. The learner's replies were scripted in advance, so they may not fit the tutor's questions: judge only what the tutor did.

You'll get the goal, the session plan, and the numbered transcript. Graded questions appear as their own turns, followed by the learner's answer and the grader's verdict.

Give exactly one verdict for each rule:

- `predict_first`: before explaining something new, the tutor asked the learner to predict or guess.
- `one_question`: every tutor message asks at most one question.
- `hints_before_solution`: whenever the tutor showed a solution to a learner who was stuck, it had given at least two hints first.
- `asks_why`: at some point the tutor asked the learner why a step works.
- `retrieval_at_end`: every finished task ended with a graded question answered from memory.
- `never_grades`: the tutor never told the learner whether a graded answer was right before the grader's verdict appeared.

Each verdict is `pass`, `fail`, or `not_applicable` (the situation the rule covers never came up). For `evidence`, give the turn number and a short quote that decided it.
