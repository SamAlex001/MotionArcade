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

import { Button } from '@/components/ui/button';
import {
  Gamepad2,
  Hand,
  Sparkles,
  HeartPulse,
  Music,
  Calculator,
  Pencil,
  Trophy,
  Zap,
  BrainCircuit,
} from 'lucide-react';
import Link from 'next/link';

const featureCards = [
  {
    icon: BrainCircuit,
    title: 'Learn while you play',
    text: 'Math battles, trivia quests and drawing challenges that sneak learning into every round.',
    cardClass: 'rotate-[-1.5deg] shadow-violet-500',
    iconClass: 'from-violet-400 to-violet-600',
  },
  {
    icon: HeartPulse,
    title: 'Made to move',
    text: 'Every game is a mini workout for hands and arms — great for motor-skill practice and rehab.',
    cardClass: 'rotate-[1deg] shadow-teal-500',
    iconClass: 'from-teal-400 to-teal-600',
  },
  {
    icon: Zap,
    title: 'Pure arcade rush',
    text: 'Falling notes, bouncing balls, popping bubbles — beat the clock and chase your high score.',
    cardClass: 'rotate-[-0.75deg] shadow-orange-500',
    iconClass: 'from-orange-400 to-rose-500',
  },
];

const floatingStickers = [
  { icon: Calculator, className: 'left-[7%] top-24 rotate-[-10deg] bg-amber-300', delay: '0s' },
  { icon: Music, className: 'right-[9%] top-32 rotate-[8deg] bg-rose-300', delay: '0.8s' },
  { icon: Pencil, className: 'left-[13%] bottom-40 rotate-[6deg] bg-violet-300', delay: '1.6s' },
  { icon: Trophy, className: 'right-[14%] bottom-48 rotate-[-7deg] bg-teal-300', delay: '2.4s' },
  { icon: Hand, className: 'left-[26%] top-14 rotate-[12deg] bg-sky-300', delay: '1.2s' },
  { icon: Sparkles, className: 'right-[26%] bottom-24 rotate-[-12deg] bg-orange-300', delay: '2s' },
];

export default function Home() {
  return (
    <div className="relative flex-1 overflow-hidden bg-dots">
      {/* Ambient color blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/4 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-400/10 blur-3xl" />

      {/* Floating sticker icons */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {floatingStickers.map(({ icon: Icon, className, delay }, i) => (
          <div
            key={i}
            className={`absolute animate-float-slow rounded-2xl border-2 border-foreground/85 p-3 shadow-[4px_4px_0_0_rgba(20,35,40,0.85)] ${className}`}
            style={{ animationDelay: delay }}
          >
            <Icon className="h-7 w-7 text-foreground" />
          </div>
        ))}
      </div>

      <div className="container relative mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-8 flex h-24 w-24 animate-float-gooey items-center justify-center bg-gradient-to-br from-primary via-teal-400 to-accent text-white shadow-xl glow-primary">
            <Gamepad2 className="h-12 w-12" />
          </div>

          <span className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-foreground/85 bg-amber-200 px-5 py-2 text-sm font-bold text-foreground shadow-[3px_3px_0_0_rgba(20,35,40,0.85)]">
            <Hand className="h-4 w-4" />
            No controllers. Just your hands.
          </span>

          <h1 className="font-headline text-lg font-bold uppercase tracking-[0.35em] text-muted-foreground">
            Welcome to
          </h1>
          <p className="text-gradient-brand animate-gradient-x font-headline text-6xl font-bold tracking-tight md:text-7xl lg:text-8xl">
            MotionArcade
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            An AR-based gaming platform where your hands control the action. Dive into interactive experiences powered by cutting-edge gesture recognition technology.
          </p>

          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="h-16 rounded-2xl border-2 border-foreground/85 bg-gradient-to-r from-accent to-orange-500 px-12 font-headline text-xl font-bold text-white shadow-[6px_6px_0_0_rgba(20,35,40,0.85)] transition-all animate-pulse-ring hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]"
            >
              <Link href="/games">
                <Gamepad2 className="mr-2 h-6 w-6" />
                Start Playing
              </Link>
            </Button>
          </div>

          <div className="mt-16 grid w-full gap-6 sm:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, text, cardClass, iconClass }) => (
              <div
                key={title}
                className={`rounded-2xl border-2 border-foreground/85 bg-card p-6 text-left shadow-[6px_6px_0_0_var(--tw-shadow-color)] transition-transform duration-200 hover:-translate-y-1.5 hover:rotate-0 ${cardClass}`}
              >
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-foreground/85 bg-gradient-to-br text-white ${iconClass}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-headline text-lg font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
