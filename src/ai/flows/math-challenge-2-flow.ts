'use server';

/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @fileOverview An AI agent that generates math problems with multiple choice options for Math Challenge 2.
 *
 * - generateMathProblem2 - A function that generates a math problem.
 * - GenerateMathProblem2Input - The input type for the function.
 * - GenerateMathProblem2Output - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMathProblem2InputSchema = z.object({
  difficulty: z.number().min(1).max(10).describe('The selected difficulty level, from 1 (easiest) to 10 (hardest).'),
  currentScore: z.number().describe("The player's current score, to adjust difficulty."),
});
export type GenerateMathProblem2Input = z.infer<typeof GenerateMathProblem2InputSchema>;

const GenerateMathProblem2OutputSchema = z.object({
  problem: z.string().describe('A math problem, can be symbolic or a word problem.'),
  options: z.array(z.number()).min(4).max(6).describe('An array of 4-6 plausible integer or decimal answer options.'),
  correctAnswer: z.number().describe('The correct answer, which must be one of the options.'),
});
export type GenerateMathProblem2Output = z.infer<typeof GenerateMathProblem2OutputSchema>;


export async function generateMathProblem2(input: GenerateMathProblem2Input): Promise<GenerateMathProblem2Output> {
  return generateMathProblem2Flow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMathProblem2Prompt',
  input: {schema: GenerateMathProblem2InputSchema},
  output: {schema: GenerateMathProblem2OutputSchema},
  prompt: `You are an expert math problem generator for a children's game. The problems should be tailored to the selected difficulty level.

  The generated math problem MUST adhere to the following rules:
  1.  The final answer can be an integer or a decimal.
  2.  The problem can be symbolic (e.g., "5 * 2") or a short word problem.
  3.  You must provide between 4 and 6 plausible multiple-choice options.
  4.  The value in the "correctAnswer" field MUST be one of the numbers from the "options" array.

  Here is the selected difficulty level (1=easy, 10=hard): {{{difficulty}}}

  -   Level 1: Simple, single-step addition or subtraction. (e.g., "15 - 7")
  -   Level 2: Single-step multiplication or simple division. (e.g., "6 * 8" or "45 / 9")
  -   Level 3: Mix of all four basic operations, single step.
  -   Level 4: Two-step problems using parentheses. (e.g., "(3 * 4) + 5")
  -   Level 5: Problems involving finding a simple percentage of a number or a simple fraction. (e.g., "What is 25% of 80?" or "What is 3/4 of 20?")
  -   Level 6: Basic geometry problems, like the area or perimeter of a square or rectangle. (e.g., "A rectangle is 5 units wide and 8 units long. What is its area?")
  -   Level 7: More complex multi-step word problems involving a combination of arithmetic operations. (e.g., "You buy 3 items at $2.50 each and pay with a $10 bill. How much change do you get?")
  -   Level 8: Find the Highest Common Factor (HCF) or Lowest Common Multiple (LCM) of two numbers. (e.g., "What is the LCM of 6 and 8?")
  -   Level 9: Simple algebraic equations. Ask to solve for 'x'. (e.g., "If 3x + 5 = 14, what is x?")
  -   Level 10: Basic trigonometry. Ask for the value of sin, cos, or tan for common angles (0, 30, 45, 60, 90). The answer may be a decimal. (e.g., "What is the value of sin(30°)?")

  Generate a math problem, a set of options, and identify the correct answer. Ensure the incorrect options are plausible but wrong.

  Example for difficulty 2:
  {
    "problem": "6 * 7",
    "options": [36, 42, 48, 49],
    "correctAnswer": 42
  }

  Example for difficulty 5:
  {
    "problem": "What is 50% of 90?",
    "options": [40, 45, 50, 90],
    "correctAnswer": 45
  }

  Example for difficulty 9:
  {
    "problem": "If 2x - 4 = 10, what is x?",
    "options": [5, 6, 7, 8],
    "correctAnswer": 7
  }

  Example for difficulty 10:
  {
    "problem": "What is cos(60°)?",
    "options": [0.5, 0.866, 1, 0.707],
    "correctAnswer": 0.5
  }
  `,
});

const generateMathProblem2Flow = ai.defineFlow(
  {
    name: 'generateMathProblem2Flow',
    inputSchema: GenerateMathProblem2InputSchema,
    outputSchema: GenerateMathProblem2OutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
