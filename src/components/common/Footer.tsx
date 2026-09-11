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

import Link from 'next/link';
import { Gamepad2, Github, Scale, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Brand & Mission */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2">
            <Link href="/" className="group flex items-center space-x-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-foreground/85 bg-gradient-to-br from-primary to-teal-400 text-white shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]">
                <Gamepad2 className="h-4 w-4" />
              </span>
              <span className="font-bold font-headline text-lg tracking-tight">
                Motion<span className="text-gradient-brand">Arcade</span>
              </span>
            </Link>
            <p className="text-xs text-muted-foreground max-w-sm">
              Touchless AR arcade gaming platform powered by MediaPipe computer vision & AI.
            </p>
          </div>

          {/* AGPL-3.0 License & Section 13 Network Interaction Notice */}
          <div className="flex flex-col items-center md:items-end text-center md:text-right gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
              <Scale className="h-4 w-4 text-primary" />
              <span>Licensed under <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">GNU AGPL v3.0</a></span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <a
                href="https://github.com/kravitexx/MotionArcade_test"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-medium"
              >
                <Github className="h-3.5 w-3.5" />
                <span>Source Code (AGPL Sec. 13)</span>
              </a>
              <span>•</span>
              <Link href="/about" className="hover:text-foreground transition-colors">
                About & Legal
              </Link>
            </div>
          </div>

        </div>

        <div className="border-t border-border/40 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
          <p>© 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors.</p>
          <p className="flex items-center gap-1">
            Built with <Heart className="h-3 w-3 text-red-500 fill-red-500" /> for Open Source
          </p>
        </div>
      </div>
    </footer>
  );
}
