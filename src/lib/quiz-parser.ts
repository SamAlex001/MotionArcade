import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { QuizQuestion, QuizDeck } from '@/types/motion-quiz-studio';

export interface ParseResult {
  questions: QuizQuestion[];
  errors: string[];
}

/**
 * Normalizes header keys by removing spaces, underscores, symbols and converting to lowercase
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses raw JSON rows into validated QuizQuestion objects
 */
export function parseRawRows(rows: Record<string, unknown>[]): ParseResult {
  const questions: QuizQuestion[] = [];
  const errors: string[] = [];

  rows.forEach((rawRow, index) => {
    // Create normalized key-value map for each row
    const row: Record<string, string> = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      if (k && v !== undefined && v !== null) {
        row[normalizeKey(k)] = String(v).trim();
      }
    });

    // Check question
    const questionText = row['question'] || row['q'] || row['prompt'] || row['questiontext'] || row['questionprompt'];
    if (!questionText) {
      // Skip completely empty rows
      if (Object.keys(row).length === 0) return;
      errors.push(`Row ${index + 1}: Missing question text.`);
      return;
    }

    // Extract options (flexible column header detection)
    const opt1 = row['option1'] || row['opt1'] || row['optiona'] || row['ans1'] || row['a'] || row['choice1'] || row['choicea'] || row['answer1'] || '';
    const opt2 = row['option2'] || row['opt2'] || row['optionb'] || row['ans2'] || row['b'] || row['choice2'] || row['choiceb'] || row['answer2'] || '';
    const opt3 = row['option3'] || row['opt3'] || row['optionc'] || row['ans3'] || row['c'] || row['choice3'] || row['choicec'] || row['answer3'] || '';
    const opt4 = row['option4'] || row['opt4'] || row['optiond'] || row['ans4'] || row['d'] || row['choice4'] || row['choiced'] || row['answer4'] || '';

    if (!opt1 || !opt2 || !opt3 || !opt4) {
      errors.push(`Row ${index + 1} ("${questionText.slice(0, 20)}..."): All 4 options are required.`);
      return;
    }

    // Correct option parsing
    const rawCorrect = row['correctoption'] || row['correct'] || row['correctanswer'] || row['answer'] || row['correctindex'] || row['correctoptionindex'] || row['solution'];
    let correctOption: 1 | 2 | 3 | 4 = 1;

    if (rawCorrect) {
      const parsedNum = parseInt(rawCorrect, 10);
      if (parsedNum >= 1 && parsedNum <= 4) {
        correctOption = parsedNum as 1 | 2 | 3 | 4;
      } else {
        const lower = rawCorrect.toLowerCase().trim();
        if (lower === 'a' || lower === 'option 1' || lower === 'option1' || lower === opt1.toLowerCase().trim()) correctOption = 1;
        else if (lower === 'b' || lower === 'option 2' || lower === 'option2' || lower === opt2.toLowerCase().trim()) correctOption = 2;
        else if (lower === 'c' || lower === 'option 3' || lower === 'option3' || lower === opt3.toLowerCase().trim()) correctOption = 3;
        else if (lower === 'd' || lower === 'option 4' || lower === 'option4' || lower === opt4.toLowerCase().trim()) correctOption = 4;
        else {
          errors.push(`Row ${index + 1}: Could not determine correct option (expected 1, 2, 3, 4 or Option text/letter). Defaulting to 1.`);
        }
      }
    }

    // Points & Penalty
    const pointsNum = parseInt(row['points'] || row['score'] || row['positivescore'] || '10', 10);
    const points = isNaN(pointsNum) ? 10 : pointsNum;

    const penaltyNum = parseInt(row['penalty'] || row['minusscore'] || row['negativescore'] || '0', 10);
    const penalty = isNaN(penaltyNum) ? 0 : Math.abs(penaltyNum);

    // Time Limit
    const timeLimitNum = parseInt(row['timelimit'] || row['timelimitsec'] || row['time'] || row['timer'] || '15', 10);
    const timeLimit = isNaN(timeLimitNum) ? 15 : Math.max(5, timeLimitNum);

    const explanation = row['explanation'] || row['explain'] || row['notes'] || undefined;

    questions.push({
      id: `q_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
      question: questionText,
      options: [opt1, opt2, opt3, opt4],
      correctOption,
      points,
      penalty,
      timeLimit,
      explanation,
    });
  });

  return { questions, errors };
}

/**
 * Parses a user uploaded File (.csv or .xlsx / .xls)
 */
export async function parseQuizFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsed = parseRawRows(results.data as Record<string, unknown>[]);
          resolve(parsed);
        },
        error: (err) => {
          resolve({ questions: [], errors: [`CSV Parse Error: ${err.message}`] });
        },
      });
    });
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      return parseRawRows(jsonRows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { questions: [], errors: [`Excel Parse Error: ${msg}`] };
    }
  } else {
    return { questions: [], errors: ['Unsupported file format. Please upload a .csv or .xlsx file.'] };
  }
}

/**
 * Generates and downloads sample template files for users
 */
export function downloadSampleTemplate(type: 'csv' | 'xlsx' = 'csv') {
  const sampleData = [
    {
      Question: 'Which planet is known as the Red Planet?',
      Option1: 'Earth',
      Option2: 'Mars',
      Option3: 'Jupiter',
      Option4: 'Venus',
      CorrectOption: 2,
      Points: 10,
      Penalty: 0,
      TimeLimit: 15,
      Explanation: 'Mars appears red due to iron oxide (rust) on its surface.',
    },
    {
      Question: 'What is the chemical symbol for Gold?',
      Option1: 'Au',
      Option2: 'Ag',
      Option3: 'Fe',
      Option4: 'Cu',
      CorrectOption: 1,
      Points: 10,
      Penalty: 5,
      TimeLimit: 15,
      Explanation: 'Au comes from the Latin word for gold, Aurum.',
    },
    {
      Question: 'How many sides does a Heptagon have?',
      Option1: '6',
      Option2: '7',
      Option3: '8',
      Option4: '9',
      CorrectOption: 2,
      Points: 15,
      Penalty: 0,
      TimeLimit: 20,
      Explanation: 'A heptagon is a 7-sided polygon.',
    },
    {
      Question: 'Which programming language runs natively in web browsers?',
      Option1: 'Python',
      Option2: 'C++',
      Option3: 'JavaScript',
      Option4: 'Java',
      CorrectOption: 3,
      Points: 10,
      Penalty: 0,
      TimeLimit: 15,
      Explanation: 'JavaScript is the main scripting language of the Web.',
    },
  ];

  if (type === 'csv') {
    const csvString = Papa.unparse(sampleData);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'MotionQuizStudio_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quiz Questions');
    XLSX.writeFile(workbook, 'MotionQuizStudio_Template.xlsx');
  }
}

/**
 * Built-in Preset Quiz Decks
 */
export const PRESET_DECKS: QuizDeck[] = [
  {
    id: 'preset_general_knowledge',
    name: '🌟 General Knowledge & Trivia',
    description: 'Fun facts about world geography, science, pop culture, and history.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPreset: true,
    questions: [
      {
        id: 'gk_1',
        question: 'Which ocean is the largest on Earth?',
        options: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean'],
        correctOption: 2,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'The Pacific Ocean covers over 30% of Earth’s total surface area.',
      },
      {
        id: 'gk_2',
        question: 'Who painted the Mona Lisa?',
        options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Claude Monet'],
        correctOption: 3,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Leonardo da Vinci painted the Mona Lisa in the early 16th century.',
      },
      {
        id: 'gk_3',
        question: 'What is the fastest land animal?',
        options: ['Cheetah', 'Lion', 'Pronghorn Antelope', 'Falcon'],
        correctOption: 1,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Cheetahs can reach speeds up to 70 mph (112 km/h).',
      },
      {
        id: 'gk_4',
        question: 'How many continents are there on Earth?',
        options: ['5', '6', '7', '8'],
        correctOption: 3,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Asia, Africa, North America, South America, Antarctica, Europe, and Australia.',
      },
    ],
  },
  {
    id: 'preset_tech_science',
    name: '🚀 Science & Technology',
    description: 'Challenge your knowledge of outer space, physics, computers, and biology.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPreset: true,
    questions: [
      {
        id: 'st_1',
        question: 'What is the hardest natural substance on Earth?',
        options: ['Gold', 'Iron', 'Diamond', 'Titanium'],
        correctOption: 3,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Diamond is made of pure carbon atoms in a crystalline lattice.',
      },
      {
        id: 'st_2',
        question: 'What does "CPU" stand for in computers?',
        options: ['Central Processing Unit', 'Central Power Unit', 'Computer Process Unit', 'Core Processing Unit'],
        correctOption: 1,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'The CPU is often referred to as the brain of the computer.',
      },
      {
        id: 'st_3',
        question: 'Which gas do plants absorb from the atmosphere for photosynthesis?',
        options: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Hydrogen'],
        correctOption: 2,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Plants use sunlight to turn CO2 and water into glucose and oxygen.',
      },
      {
        id: 'st_4',
        question: 'How long does light from the Sun take to reach Earth?',
        options: ['8 seconds', '8 minutes', '8 hours', 'Instantaneous'],
        correctOption: 2,
        points: 10,
        penalty: 0,
        timeLimit: 15,
        explanation: 'Sunlight takes approximately 8 minutes and 20 seconds to travel 93 million miles.',
      },
    ],
  },
];
