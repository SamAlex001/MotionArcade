import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator, BrainCircuit, Waves, Pencil, Gamepad2, Hand, Music, Play, FileSpreadsheet, PersonStanding } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const allGames = [
  {
    title: 'Motion Quiz Studio',
    description: 'Upload custom questions via CSV/Excel or build your own quiz decks in-app! Show fingers to select options in hands-free motion trivia.',
    href: '/games/motion-quiz-studio',
    icon: FileSpreadsheet,
    badge: 'Custom Deck Quiz',
    badgeClass: 'bg-purple-100 text-purple-800',
    iconClass: 'from-purple-400 to-indigo-600',
    shadowClass: 'shadow-purple-500',
    buttonClass: 'bg-purple-500 hover:bg-purple-600',
    tilt: 'hover:-rotate-1',
  },
  {
    title: 'Math Challenge',
    description: 'Solve dynamic math problems using your hands! Show the correct number of fingers to answer questions and test your arithmetic skills.',
    href: '/games/math-challenge',
    icon: Calculator,
    badge: 'Math',
    badgeClass: 'bg-teal-100 text-teal-800',
    iconClass: 'from-teal-400 to-teal-600',
    shadowClass: 'shadow-teal-500',
    buttonClass: 'bg-teal-500 hover:bg-teal-600',
    tilt: 'hover:-rotate-1',
  },
  {
    title: 'Quiz Quest',
    description: 'Answer trivia questions by showing the number of fingers corresponding to your chosen option. Hold your answer to lock it in!',
    href: '/games/quiz-quest',
    icon: BrainCircuit,
    badge: 'Trivia',
    badgeClass: 'bg-violet-100 text-violet-800',
    iconClass: 'from-violet-400 to-violet-600',
    shadowClass: 'shadow-violet-500',
    buttonClass: 'bg-violet-500 hover:bg-violet-600',
    tilt: 'hover:rotate-1',
  },
  {
    title: 'Math Challenge 2',
    description: 'A more physical challenge! Pop the bubbles with the correct answer using your hands. Move your body and test your math skills.',
    href: '/games/math-challenge-2',
    icon: Waves,
    badge: 'Move & Math',
    badgeClass: 'bg-sky-100 text-sky-800',
    iconClass: 'from-sky-400 to-sky-600',
    shadowClass: 'shadow-sky-500',
    buttonClass: 'bg-sky-500 hover:bg-sky-600',
    tilt: 'hover:-rotate-1',
  },
  {
    title: 'Sketch & Score',
    description: 'Draw the shape you see on screen using your index finger. Use gestures to switch between pencil and eraser. A creative challenge!',
    href: '/games/sketch-and-score',
    icon: Pencil,
    badge: 'Creativity',
    badgeClass: 'bg-amber-100 text-amber-800',
    iconClass: 'from-amber-400 to-orange-500',
    shadowClass: 'shadow-amber-500',
    buttonClass: 'bg-amber-500 hover:bg-amber-600',
    tilt: 'hover:rotate-1',
  },
  {
    title: 'Just show your hands',
    description: 'A tech demo of the hand tracking engine. Choose between different models and see the real-time hand skeleton tracking.',
    href: '/games/just-show-your-hands',
    icon: Hand,
    badge: 'Tech Demo',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    iconClass: 'from-emerald-400 to-emerald-600',
    shadowClass: 'shadow-emerald-500',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-600',
    tilt: 'hover:-rotate-1',
  },
  {
    title: 'Just Show Your Body',
    description: 'A full-body pose-tracking demo. Step back and see all 33 joints tracked live as a Classic skeleton, Neon glow, or holographic 3D Aura.',
    href: '/games/just-show-your-body',
    icon: PersonStanding,
    badge: 'Tech Demo',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    iconClass: 'from-emerald-400 to-emerald-600',
    shadowClass: 'shadow-emerald-500',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-600',
    tilt: 'hover:rotate-1',
  },
  {
    title: 'Ping Pong',
    description: 'A classic game of single-player ping pong. Control the paddle with your hand and try to keep the ball in play.',
    href: '/games/ping-pong',
    icon: Gamepad2,
    badge: 'Reflex',
    badgeClass: 'bg-orange-100 text-orange-800',
    iconClass: 'from-orange-400 to-orange-600',
    shadowClass: 'shadow-orange-500',
    buttonClass: 'bg-orange-500 hover:bg-orange-600',
    tilt: 'hover:rotate-1',
  },
  {
    title: 'Air Piano',
    description: 'Play a virtual piano by hitting falling notes with your fingers in the air. A rhythm game that tests your timing and coordination.',
    href: '/games/air-piano',
    icon: Music,
    badge: 'Rhythm',
    badgeClass: 'bg-rose-100 text-rose-800',
    iconClass: 'from-rose-400 to-rose-600',
    shadowClass: 'shadow-rose-500',
    buttonClass: 'bg-rose-500 hover:bg-rose-600',
    tilt: 'hover:-rotate-1',
  },
];

export default function GamesPage() {
  return (
    <div className="relative flex-1 bg-dots">
      <div aria-hidden className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="container relative mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-foreground/85 bg-sky-200 px-5 py-2 text-sm font-bold text-foreground shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]">
            <Hand className="h-4 w-4" />
            9 games · hands & body
          </span>
          <h1 className="font-headline text-4xl font-bold tracking-tight md:text-6xl">
            Choose Your{' '}
            <span className="text-gradient-brand animate-gradient-x">Game</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Every game is played with your hands in front of the camera — pick one and get moving.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {allGames.map((game) => (
            <Card
              key={game.title}
              className={cn(
                'group flex flex-col rounded-2xl border-2 border-foreground/85 bg-card transition-all duration-200',
                'shadow-[6px_6px_0_0_var(--tw-shadow-color)] hover:-translate-y-1.5 hover:shadow-[9px_9px_0_0_var(--tw-shadow-color)]',
                game.shadowClass,
                game.tilt
              )}
            >
              <CardHeader className="flex-row items-start gap-4 space-y-0">
                <div
                  className={cn(
                    'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-foreground/85 bg-gradient-to-br text-white group-hover:animate-wiggle',
                    game.iconClass
                  )}
                >
                  <game.icon className="h-8 w-8" />
                </div>
                <div>
                  <span className={cn('mb-1.5 inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide', game.badgeClass)}>
                    {game.badge}
                  </span>
                  <CardTitle className="font-headline text-2xl">{game.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <CardDescription className="text-base">{game.description}</CardDescription>
              </CardContent>
              <CardFooter>
                <Button
                  asChild
                  className={cn(
                    'w-full rounded-xl border-2 border-foreground/85 font-headline text-base font-bold text-white',
                    'shadow-[3px_3px_0_0_rgba(20,35,40,0.85)] transition-all hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_rgba(20,35,40,0.85)]',
                    game.buttonClass
                  )}
                >
                  <Link href={game.href}>
                    <Play className="mr-1.5 h-4 w-4" />
                    Play
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
