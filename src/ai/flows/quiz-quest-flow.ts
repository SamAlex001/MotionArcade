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
 * @fileOverview An AI agent that generates quiz questions based on selected subjects.
 *
 * - generateQuizQuestion - A function that generates a quiz question.
 * - GenerateQuizQuestionInput - The input type for the generateQuizQuestion function.
 * - GenerateQuizQuestionOutput - The return type for the generateQuizQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateQuizQuestionInputSchema = z.object({
  currentScore: z.number().describe("The player's current score."),
  subjects: z.array(z.string()).describe("An array of subjects for the quiz questions. Can be broad (e.g., 'History') or specific (e.g., 'World War 2')."),
});
export type GenerateQuizQuestionInput = z.infer<typeof GenerateQuizQuestionInputSchema>;

const GenerateQuizQuestionOutputSchema = z.object({
  question: z.string().describe('A trivia question on a random topic.'),
  options: z.array(z.string()).length(4).describe('An array of 4 possible answers.'),
  correctAnswerIndex: z.number().int().min(0).max(3).describe('The 0-based index of the correct answer in the options array.'),
});
export type GenerateQuizQuestionOutput = z.infer<typeof GenerateQuizQuestionOutputSchema>;


export async function generateQuizQuestion(input: GenerateQuizQuestionInput): Promise<GenerateQuizQuestionOutput> {
  return generateQuizQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizQuestionPrompt',
  input: {schema: GenerateQuizQuestionInputSchema},
  output: {schema: GenerateQuizQuestionOutputSchema},
  prompt: `You are a quiz master for a fun, educational game. Generate a trivia question based on the following subjects: {{{subjects}}}.

  The question must be answerable within 10 seconds.
  The question should be interesting and suitable for a general audience.
  Provide 4 distinct options for the answer.
  One of the options must be the correct answer.
  Indicate the index of the correct answer.

  The player's current score is {{{currentScore}}}. You can use this to adjust the difficulty slightly if you wish.

  Example:
  {
    "question": "What is the capital of France?",
    "options": ["London", "Berlin", "Paris", "Madrid"],
    "correctAnswerIndex": 2
  }
  `,
});

const generateQuizQuestionFlow = ai.defineFlow(
  {
    name: 'generateQuizQuestionFlow',
    inputSchema: GenerateQuizQuestionInputSchema,
    outputSchema: GenerateQuizQuestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

    