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


'use server';
/**
 * @fileOverview An AI agent that generates dynamic math problems based on the player's score and selected difficulty.
 *
 * - generateMathProblem - A function that generates a math problem.
 * - GenerateMathProblemInput - The input type for the generateMathProblem function.
 * - GenerateMathProblemOutput - The return type for the generateMathProblem function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMathProblemInputSchema = z.object({
  difficulty: z.number().min(1).max(10).describe('The selected difficulty level, from 1 (easiest) to 10 (hardest).'),
  currentScore: z.number().describe('The player\'s current score.'),
  pastScores: z.array(z.number()).describe('The player\'s past scores.'),
});
export type GenerateMathProblemInput = z.infer<typeof GenerateMathProblemInputSchema>;

const GenerateMathProblemOutputSchema = z.object({
  problem: z.string().describe('A math problem with operands and result between 0 and 10.'),
  solution: z.number().int().min(0).max(10).describe('The solution to the generated math problem, which must be an integer between 0 and 10.'),
});
export type GenerateMathProblemOutput = z.infer<typeof GenerateMathProblemOutputSchema>;

export async function generateMathProblem(input: GenerateMathProblemInput): Promise<GenerateMathProblemOutput> {
  return generateMathProblemFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMathProblemPrompt',
  input: {schema: GenerateMathProblemInputSchema},
  output: {schema: GenerateMathProblemOutputSchema},
  prompt: `You are an expert math problem generator for a children's game. The problems should be tailored to the selected difficulty level.

  The generated math problem MUST adhere to the following rules:
  1.  The final solution MUST be an integer between 0 and 10, inclusive.
  2.  Only use the following operations: addition, subtraction, multiplication, and division.
  3.  The problem can be a symbolic arithmetic problem (e.g., "4 + 2") or a short word problem.

  Here is the selected difficulty level (1=easy, 10=hard): {{{difficulty}}}
  -   Level 1: Use simple, single-step addition only. The result must be 10 or less. (e.g., "3 + 5" or "1 + 2")
  -   Level 2: Use simple, single-step subtraction only. Numbers should be simple. (e.g., "8 - 2" or "5 - 1")
  -   Level 3: Use a mix of simple, single-step addition and subtraction. (e.g., "4 + 3" or "9 - 5")
  -   Level 4: Introduce single-step multiplication. Word problems should be very simple. (e.g., "2 * 4" or "How many wheels on two cars?")
  -   Level 5: Introduce simple division that results in a whole number. A mix of all four single-step operations is allowed. Word problems can be slightly more descriptive. (e.g., "8 / 2" or "If you share 9 cookies among 3 friends, how many does each get?")
  -   Level 6: Create two-step problems. Use parentheses for symbolic problems. Word problems should require two calculations. (e.g., "(2 * 3) + 4" or "A farmer has 3 pens, and each pen has 3 sheep. If he sells 2 sheep, how many are left?")
  -   Level 7: More complex two-step problems. Introduce concepts like "half of" for even numbers. (e.g., "You have 8 apples and eat half. Then you pick 3 more. How many apples now?")
  -   Level 8: Create three-step problems. The intermediate calculations can go above 10, but the final answer MUST be between 0 and 10. Word problems are strongly preferred. (e.g., "You have 5 apples. You get 5 more, then eat half. How many are left?")
  -   Level 9: More complex three-step problems where the logic is less direct. Use phrases like "twice as many" or "three less than". (e.g., "A basket has 4 red apples. There are twice as many green apples. If you remove 3 green apples, how many green apples are left?")
  -   Level 10: Create a complex, multi-step (3 or 4 steps) word problem that requires careful reading and logical deduction. The problem should be challenging but result in a simple integer answer between 0 and 10. (e.g., "A bus starts with 10 people. At the first stop, 5 people get off and 2 get on. At the second stop, half of the people currently on the bus get off. How many people are left?")

  Generate a math problem and the solution to that problem.
  Ensure that you do not include the solution in the problem itself, and that the solution matches the value in the "solution" output field.
  
  THE FINAL ANSWER MUST BE BETWEEN 0 AND 10.

  Example for difficulty 1:
  {
    "problem": "5 + 3",
    "solution": 8
  }

  Example for difficulty 4:
  {
    "problem": "How many legs do two cats have?",
    "solution": 8
  }

  Example for difficulty 7:
  {
    "problem": "A bake sale has 5 cookies. If they sell 3, and then bake 6 more, how many cookies do they have now?",
    "solution": 8
  }

  Example for difficulty 10:
  {
    "problem": "A train car has 8 rows of seats. Each row has 4 seats. If the car is half full, and then 6 people get off, how many people are on the train?",
    "solution": 10
  }
  `,
});

const generateMathProblemFlow = ai.defineFlow(
  {
    name: 'generateMathProblemFlow',
    inputSchema: GenerateMathProblemInputSchema,
    outputSchema: GenerateMathProblemOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
