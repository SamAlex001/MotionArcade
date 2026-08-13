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

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gamepad2, Scale, Github, Users, Cpu, ShieldCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="flex-1 bg-dots py-12 sm:py-16">
      <div className="container mx-auto px-4 max-w-4xl space-y-8">
        
        {/* Main Header Card */}
        <Card className="rounded-2xl border-2 border-foreground/85 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-teal-500 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-teal-500/10 via-amber-500/10 to-primary/10 border-b">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-foreground/85 bg-gradient-to-br from-primary to-teal-400 text-white shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]">
                <Gamepad2 className="h-6 w-6" />
              </span>
              <div>
                <CardTitle className="font-headline text-3xl md:text-4xl">
                  About <span className="text-gradient-brand animate-gradient-x">MotionArcade</span>
                </CardTitle>
                <CardDescription className="text-base font-medium">
                  Touchless AR Arcade Gaming Platform
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <p className="text-base sm:text-lg text-foreground/90 leading-relaxed">
              <strong>MotionArcade</strong> is an open-source, touchless AR gaming platform where your <strong>hands are the controller</strong>.
              Combining high-frequency computer vision landmark tracking, Web Audio API synthesis, dynamic spreadsheet quiz parsing, and Google Gemini AI evaluation, MotionArcade delivers immersive browser gaming with zero extra hardware.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center text-center gap-2">
                <Cpu className="h-6 w-6 text-teal-600" />
                <h4 className="font-bold text-sm">60 FPS Gesture Engine</h4>
                <p className="text-xs text-muted-foreground">MediaPipe 3D landmark tracking decoupled from React state renders.</p>
              </div>

              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center text-center gap-2">
                <ShieldCheck className="h-6 w-6 text-amber-600" />
                <h4 className="font-bold text-sm">Anatomical Isolation</h4>
                <p className="text-xs text-muted-foreground">Relative DIP calculations for misfire-free finger counting.</p>
              </div>

              <div className="p-4 rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center text-center gap-2">
                <Scale className="h-6 w-6 text-primary" />
                <h4 className="font-bold text-sm">GNU AGPL v3 Licensed</h4>
                <p className="text-xs text-muted-foreground">Strong copyleft open-source guaranteeing user freedom.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* License & Open Source Section */}
        <Card className="rounded-2xl border-2 border-foreground/85 shadow-[6px_6px_0_0_rgba(20,35,40,0.85)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <CardTitle className="font-headline text-2xl">Open Source & AGPL v3 Licensing</CardTitle>
              </div>
              <Badge variant="outline" className="border-primary text-primary font-mono text-xs">
                AGPL-3.0-or-later
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-foreground/90">
            <p>
              MotionArcade is distributed under the <strong>GNU Affero General Public License v3.0 (GNU AGPLv3)</strong>.
              This guarantees your freedom to run, study, modify, and redistribute the program.
            </p>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs leading-relaxed space-y-2">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                ⚠️ Remote Network Interaction Notice (AGPL Section 13):
              </p>
              <p>
                If you modify this software and run it on a public network server, you are required under AGPL Section 13 to offer all users interacting with it remotely an opportunity to receive the Corresponding Source code of your version.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="https://github.com/kravitexx/MotionArcade_test"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background font-bold text-xs hover:bg-foreground/90 transition-all shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]"
              >
                <Github className="h-4 w-4" />
                View Source on GitHub
              </a>
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-foreground/85 bg-background text-foreground font-bold text-xs hover:bg-muted transition-all shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]"
              >
                <Scale className="h-4 w-4" />
                Read AGPL v3 License Text
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Project Authors Card */}
        <Card className="rounded-2xl border-2 border-foreground/85 shadow-[6px_6px_0_0_rgba(20,35,40,0.85)]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="font-headline text-2xl">Authors & Project Team</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              MotionArcade was originally created as an Academic MCA Capstone Project by:
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <li className="p-3 rounded-xl border border-border bg-card flex flex-col gap-1">
                <span className="font-bold text-sm">Kartik Hawelikar</span>
                <a href="https://github.com/kravitexx" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">@kravitexx</a>
              </li>
              <li className="p-3 rounded-xl border border-border bg-card flex flex-col gap-1">
                <span className="font-bold text-sm">Sam Alex</span>
                <a href="https://github.com/SamAlex001" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">@SamAlex001</a>
              </li>
              <li className="p-3 rounded-xl border border-border bg-card flex flex-col gap-1">
                <span className="font-bold text-sm">Shubham Bolave</span>
                <a href="https://github.com/THEKIRA001" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">@THEKIRA001</a>
              </li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
