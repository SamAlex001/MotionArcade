'use client';

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


import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from 'lucide-react';
import { generateMathProblem } from '@/ai/flows/dynamic-math-problem-generation';
import { generateMathProblem2 } from '@/ai/flows/math-challenge-2-flow';
import { generateQuizQuestion } from '@/ai/flows/quiz-quest-flow';
import { generateShapeToDraw, evaluatePlayerDrawing } from '@/ai/flows/shape-challenge-flow';
import { initializeHandTracking } from '@/ai/flows/air-piano-flow';


type TestResult = {
  flow: string;
  data: any;
  error?: string;
};

/**
 * Creates a small dummy triangle PNG as a data URI for testing the image evaluation flow.
 */
function createDummyTriangleDataUri(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 100, 100);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, 10);
  ctx.lineTo(10, 90);
  ctx.lineTo(90, 90);
  ctx.closePath();
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

export default function DebugPage() {
  const [loadingFlow, setLoadingFlow] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTest = async (flowName: string, flowFunction: () => Promise<any>) => {
    setLoadingFlow(flowName);
    setResult(null);
    try {
      const data = await flowFunction();
      setResult({ flow: flowName, data });
    } catch (e: any) {
      console.error(e);
      setResult({ flow: flowName, data: null, error: e.message || 'An unknown error occurred.' });
    } finally {
      setLoadingFlow(null);
    }
  };

  const testMathChallenge1 = () => handleTest(
    'Math Challenge',
    () => generateMathProblem({ difficulty: 3, currentScore: 5, pastScores: [1, 2, 3] })
  );

  const testMathChallenge2 = () => handleTest(
    'Math Challenge 2',
    () => generateMathProblem2({ difficulty: 3, currentScore: 5 })
  );

  const testQuizQuest = () => handleTest(
    'Quiz Quest',
    () => generateQuizQuestion({ currentScore: 5, subjects: ['Science', 'History'] })
  );
  
  const testShapeGeneration = () => handleTest(
    'Sketch & Score (Shape)',
    () => generateShapeToDraw({ pastShapes: [] })
  );

  const testDrawingEvaluation = () => handleTest(
    'Sketch & Score (Evaluate)',
    () => evaluatePlayerDrawing({
      shapeToDraw: 'triangle',
      drawingDataUri: createDummyTriangleDataUri(),
    })
  );

  const testAirPiano = () => handleTest(
    'Air Piano (Hand Tracking)',
    () => initializeHandTracking()
  );

  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline text-3xl">AI Flow Debugger</CardTitle>
          <p className="text-muted-foreground">
            Use these buttons to test each AI flow individually. This helps diagnose issues
            with the Gemini API key or the prompts themselves. If these tests fail,
            it&apos;s likely there is an issue with the environment configuration (e.g., API key).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Text-based AI Flows (Gemini API)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button onClick={testMathChallenge1} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Math Challenge' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Math Challenge
            </Button>
            <Button onClick={testMathChallenge2} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Math Challenge 2' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Math Challenge 2
            </Button>
            <Button onClick={testQuizQuest} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Quiz Quest' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Quiz Quest
            </Button>
            <Button onClick={testShapeGeneration} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Sketch & Score (Shape)' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Shape Generation
            </Button>
          </div>

          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide mt-4">Image-based AI Flow (Gemini Vision)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button onClick={testDrawingEvaluation} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Sketch & Score (Evaluate)' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Drawing Evaluation
            </Button>
          </div>

          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide mt-4">Client-side Model (MediaPipe)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button onClick={testAirPiano} disabled={!!loadingFlow} className="flex-1">
              {loadingFlow === 'Air Piano (Hand Tracking)' && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Test Hand Tracking Model
            </Button>
          </div>

          {result && (
            <Card className="mt-4 bg-muted/50">
              <CardHeader>
                <CardTitle>Result for: {result.flow}</CardTitle>
              </CardHeader>
              <CardContent>
                {result.error ? (
                  <div className="text-destructive">
                    <h3 className="font-bold">Error:</h3>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-destructive/10 p-4 font-mono text-sm">
                      {result.error}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-bold">Success:</h3>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-background p-4 font-mono text-sm">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
